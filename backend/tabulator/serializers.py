from django.db.models import Max, Sum
from rest_framework import serializers

from .models import Candidate, Criterion, Event, Judge


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


class CandidateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidate
        fields = ['id', 'event', 'number', 'name']
        extra_kwargs = {'event': {'write_only': True}}

    def update(self, instance, validated_data):
        validated_data.pop('event', None)
        return super().update(instance, validated_data)


class EventSerializer(serializers.ModelSerializer):
    criteria = CriterionSerializer(many=True, read_only=True)
    candidates = CandidateSerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = ['id', 'name', 'locked', 'criteria', 'candidates']


class JudgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Judge
        fields = ['id', 'name', 'code']
        read_only_fields = ['code']


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

    def validate_scores(self, value):
        try:
            return {int(k): v for k, v in value.items()}
        except (TypeError, ValueError):
            raise serializers.ValidationError('Criterion ids must be integers.')


class ScoreSubmissionSerializer(serializers.Serializer):
    items = ScoreItemSerializer(many=True, allow_empty=True)
