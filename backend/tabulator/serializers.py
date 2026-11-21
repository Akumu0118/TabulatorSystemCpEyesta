from django.db.models import Max, Sum
from rest_framework import serializers

from .models import Candidate, Category, Criterion, Event, Judge


class CriterionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Criterion
        fields = ['id', 'event', 'name', 'weight', 'max_score']
        extra_kwargs = {'event': {'write_only': True}}

    def validate(self, attrs):
        event = attrs.get('event') or self.instance.event
        weight = attrs.get('weight', getattr(self.instance, 'weight', 0))
        others = event.criteria.exclude(pk=getattr(self.instance, 'pk', None))
        used = others.aggregate(total=Sum('weight'))['total'] or 0
        if used + weight > 100:
            raise serializers.ValidationError(
                {'weight': f'Only {100 - used}% is left. Remove or lower another criteria first.'}
            )
        if self.instance is not None and 'max_score' in attrs:
            highest = self.instance.scores.aggregate(top=Max('value'))['top']
            if highest is not None and highest > attrs['max_score']:
                raise serializers.ValidationError(
                    {'max_score': f'A judge already gave {highest.normalize():f}. The highest score cannot go below that.'}
                )
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop('event', None)  # criteria cannot move between events
        return super().update(instance, validated_data)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'event', 'name', 'order']
        extra_kwargs = {'event': {'write_only': True}}

    def validate(self, attrs):
        event = attrs.get('event') or self.instance.event
        name = attrs.get('name', getattr(self.instance, 'name', '')).strip()
        if not name:
            raise serializers.ValidationError({'name': 'Give the category a name.'})
        clash = event.categories.filter(name__iexact=name).exclude(pk=getattr(self.instance, 'pk', None))
        if clash.exists():
            raise serializers.ValidationError({'name': f'{event.name} already has a category called {name}.'})
        attrs['name'] = name
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop('event', None)  # categories cannot move between events
        return super().update(instance, validated_data)


class CandidateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidate
        fields = ['id', 'event', 'category', 'number', 'name']
        extra_kwargs = {'event': {'write_only': True}, 'category': {'required': False}}

    def validate(self, attrs):
        event = attrs.get('event') or self.instance.event
        category = attrs.get('category')
        if category is not None and category.event_id != event.id:
            raise serializers.ValidationError({'category': 'That category belongs to another event.'})
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop('event', None)
        return super().update(instance, validated_data)


class EventSerializer(serializers.ModelSerializer):
    criteria = CriterionSerializer(many=True, read_only=True)
    candidates = CandidateSerializer(many=True, read_only=True)
    categories = CategorySerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = ['id', 'name', 'locked', 'finalized_at', 'criteria', 'categories', 'candidates']
        read_only_fields = ['finalized_at']

    def validate(self, attrs):
        if self.instance is not None and self.instance.finalized_at and attrs.get('locked') is False:
            raise serializers.ValidationError({'locked': 'Results are final. Reopen the results before unlocking scoring.'})
        return attrs


class JudgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Judge
        fields = ['id', 'name', 'code', 'last_seen_at']
        read_only_fields = ['code', 'last_seen_at']


class PublicJudgeSerializer(serializers.ModelSerializer):
    """Judges as other judges see them: no access codes."""

    class Meta:
        model = Judge
        fields = ['id', 'name']


class LoginSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['admin', 'judge'])
    secret = serializers.CharField(trim_whitespace=True)


class ScoreItemSerializer(serializers.Serializer):
    eventId = serializers.IntegerField()
    candidateId = serializers.IntegerField()
    scores = serializers.DictField(
        # Upper bound is each criterion's max_score, checked in submit_scores.
        child=serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0),
        allow_empty=False,
    )
    # When the sheet was saved on the phone (ms since epoch). Lets the newest sheet win
    # when the same sheet arrives twice (e.g. over Wi-Fi and by QR).
    capturedAt = serializers.IntegerField(required=False, min_value=0)

    def validate_scores(self, value):
        try:
            return {int(k): v for k, v in value.items()}
        except (TypeError, ValueError):
            raise serializers.ValidationError('Criterion ids must be integers.')


class ScoreSubmissionSerializer(serializers.Serializer):
    items = ScoreItemSerializer(many=True, allow_empty=True)


class ScoreImportSerializer(serializers.Serializer):
    """Sheets the organizer brings in for a judge whose phone could not reach the tabulator."""

    judgeId = serializers.IntegerField()
    source = serializers.ChoiceField(choices=['qr', 'manual'])
    items = ScoreItemSerializer(many=True, allow_empty=False)
