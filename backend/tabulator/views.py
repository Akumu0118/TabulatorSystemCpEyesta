import socket

from django.conf import settings
from django.db import connection, transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .auth import IsJudge, IsTabulatorAdmin, IsTabulatorUser, check_admin_password, make_admin_token
from .models import Candidate, Criterion, Event, Judge, Score
from .serializers import (
    CandidateSerializer,
    CriterionSerializer,
    EventSerializer,
    JudgeSerializer,
    LoginSerializer,
    PublicJudgeSerializer,
    ScoreSubmissionSerializer,
)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def login(request):
    ser = LoginSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    role, secret = ser.validated_data['role'], ser.validated_data['secret']

    if role == 'admin':
        if not check_admin_password(secret):
            return Response({'detail': 'Wrong admin password.'}, status=status.HTTP_401_UNAUTHORIZED)
        return Response({'role': 'admin', 'id': 0, 'name': 'Admin', 'token': make_admin_token()})

    judge = Judge.objects.filter(code=secret).first()
    if not judge:
        return Response(
            {'detail': 'Access code not found. Check the code and make sure you are on the event Wi-Fi.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return Response({'role': 'judge', 'id': judge.id, 'name': judge.name, 'token': judge.code})


login.cls.throttle_scope = 'login'


@api_view(['GET'])
@permission_classes([IsTabulatorUser])
def state(request):
    """Everything the UI needs in one call. Judges only receive their own scores and no access codes."""
    actor = request.user
    events = Event.objects.prefetch_related('criteria', 'candidates')
    judges = Judge.objects.all()
    scores = Score.objects.all()
    if not actor.is_admin:
        scores = scores.filter(judge=actor.judge)

    score_map = {}
    for event_id, candidate_id, judge_id, criterion_id, value in scores.values_list(
        'candidate__event_id', 'candidate_id', 'judge_id', 'criterion_id', 'value'
    ):
        sheet = score_map.setdefault(event_id, {}).setdefault(candidate_id, {}).setdefault(judge_id, {})
        sheet[criterion_id] = float(value)

    judge_serializer = JudgeSerializer if actor.is_admin else PublicJudgeSerializer
    return Response({
        'events': EventSerializer(events, many=True).data,
        'judges': judge_serializer(judges, many=True).data,
        'scores': score_map,
    })


def lan_ipv4_addresses():
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except socket.gaierror:
        pass
    try:
        # Connecting a UDP socket sends nothing; it only picks the outbound interface.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            ips.add(s.getsockname()[0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith('127.'))


@api_view(['GET'])
@permission_classes([IsTabulatorAdmin])
def info(request):
    ips = list(settings.TABULATOR_LAN_HOSTS)
    if settings.TABULATOR_DETECT_LAN:
        ips += [ip for ip in lan_ipv4_addresses() if ip not in ips]
    port = int(settings.TABULATOR_PUBLIC_PORT or request.get_port())
    return Response({'port': port, 'ips': ips})


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    """Liveness check used by Docker; also confirms the database answers."""
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    return Response({'ok': True})


@api_view(['POST'])
@permission_classes([IsJudge])
def submit_scores(request):
    """Accept a batch of score sheets from a judge (possibly queued while offline).

    Items for locked events, unknown entries, or sheets that no longer match the
    event's criteria are rejected individually so the client can drop them.
    """
    ser = ScoreSubmissionSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    judge = request.user.judge
    saved, rejected = [], []

    with transaction.atomic():
        for item in ser.validated_data['items']:
            ref = {'eventId': item['eventId'], 'candidateId': item['candidateId']}
            candidate = (
                Candidate.objects.select_related('event')
                .filter(pk=item['candidateId'], event_id=item['eventId'])
                .first()
            )
            if candidate is None:
                rejected.append({**ref, 'reason': 'This entry no longer exists.'})
                continue
            if candidate.event.locked:
                rejected.append({**ref, 'reason': 'Scoring is closed for this event.'})
                continue
            limits = dict(candidate.event.criteria.values_list('id', 'max_score'))
            if set(item['scores']) != set(limits):
                rejected.append({**ref, 'reason': 'The criteria changed. Please score this entry again.'})
                continue
            if any(value > limits[cid] for cid, value in item['scores'].items()):
                rejected.append({**ref, 'reason': 'A score is above the highest allowed. Please check this entry.'})
                continue
            for criterion_id, value in item['scores'].items():
                Score.objects.update_or_create(
                    judge=judge, candidate=candidate, criterion_id=criterion_id, defaults={'value': value}
                )
            saved.append(ref)

    return Response({'saved': saved, 'rejected': rejected})


class AdminOnly:
    permission_classes = [IsTabulatorAdmin]


class EventViewSet(AdminOnly, viewsets.ModelViewSet):
    queryset = Event.objects.prefetch_related('criteria', 'candidates')
    serializer_class = EventSerializer


class CriterionViewSet(
    AdminOnly, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    queryset = Criterion.objects.select_related('event')
    serializer_class = CriterionSerializer


class CandidateViewSet(
    AdminOnly, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    queryset = Candidate.objects.all()
    serializer_class = CandidateSerializer


class JudgeViewSet(AdminOnly, viewsets.ModelViewSet):
    queryset = Judge.objects.all()
    serializer_class = JudgeSerializer

    @action(detail=True, methods=['post'], url_path='regenerate-code')
    def regenerate_code(self, request, pk=None):
        judge = self.get_object()
        judge.regenerate_code()
        return Response(JudgeSerializer(judge).data)
