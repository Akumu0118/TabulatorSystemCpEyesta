import socket
from datetime import datetime
from datetime import timezone as dt_timezone

from django.conf import settings
from django.db import connection, transaction
from django.db.models import Count, Max
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .auth import IsJudge, IsTabulatorAdmin, IsTabulatorUser, check_admin_password, make_admin_token
from .models import Candidate, Category, Criterion, Event, Judge, Score
from .serializers import (
    CandidateSerializer,
    CategorySerializer,
    CriterionSerializer,
    EventSerializer,
    JudgeSerializer,
    LoginSerializer,
    PublicJudgeSerializer,
    ScoreImportSerializer,
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
    events = Event.objects.prefetch_related('criteria', 'candidates', 'categories')
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
        # Lets the browser show "seen 8 s ago" without trusting its own clock.
        'serverTime': timezone.now(),
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
    https_port = int(settings.TABULATOR_HTTPS_PORT or 0)
    return Response({'port': port, 'httpsPort': https_port, 'ips': ips})


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    """Liveness check used by Docker; also confirms the database answers."""
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    return Response({'ok': True})


class SheetRejected(Exception):
    """A sheet that can never be saved as sent; the client should drop it and tell the judge."""


def captured_time(item):
    """When the sheet was saved on the phone, or now if the client did not say."""
    ms = item.get('capturedAt')
    return datetime.fromtimestamp(ms / 1000, tz=dt_timezone.utc) if ms else timezone.now()


def apply_sheet(judge, candidate, item, source):
    """Save one judge's sheet for one entry, unless a newer copy is already stored.

    Returns 'saved' or 'stale'. A stale sheet is still acknowledged, so the phone
    stops resending it, but the newer scores are kept.
    """
    scores = item['scores']
    limits = dict(candidate.event.criteria.values_list('id', 'max_score'))
    if set(scores) != set(limits):
        raise SheetRejected('The criteria changed. Please score this entry again.')
    if any(value > limits[cid] for cid, value in scores.items()):
        raise SheetRejected('A score is above the highest allowed. Please check this entry.')

    captured = captured_time(item)
    newest = Score.objects.filter(judge=judge, candidate=candidate).aggregate(t=Max('client_updated_at'))['t']
    if newest is not None and newest > captured:
        return 'stale'
    for criterion_id, value in scores.items():
        Score.objects.update_or_create(
            judge=judge,
            candidate=candidate,
            criterion_id=criterion_id,
            defaults={'value': value, 'client_updated_at': captured, 'source': source},
        )
    return 'saved'


def find_candidate(item):
    return (
        Candidate.objects.select_related('event')
        .filter(pk=item['candidateId'], event_id=item['eventId'])
        .first()
    )


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
            candidate = find_candidate(item)
            if candidate is None:
                rejected.append({**ref, 'reason': 'This entry no longer exists.'})
                continue
            if candidate.event.locked:
                rejected.append({**ref, 'reason': 'Scoring is closed for this event.'})
                continue
            try:
                outcome = apply_sheet(judge, candidate, item, Score.NETWORK)
            except SheetRejected as exc:
                rejected.append({**ref, 'reason': str(exc)})
                continue
            saved.append({**ref, 'stale': outcome == 'stale'})

    return Response({'saved': saved, 'rejected': rejected})


@api_view(['POST'])
@permission_classes([IsTabulatorAdmin])
def import_scores(request):
    """Sheets the organizer brings in from a judge's phone by QR code or by typing them in.

    Allowed while scoring is locked (that is when it is needed most), but not once
    results are final.
    """
    ser = ScoreImportSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    judge = Judge.objects.filter(pk=ser.validated_data['judgeId']).first()
    if judge is None:
        return Response({'detail': 'This judge no longer exists.'}, status=status.HTTP_404_NOT_FOUND)
    source = ser.validated_data['source']
    saved, rejected = [], []

    with transaction.atomic():
        for item in ser.validated_data['items']:
            ref = {'eventId': item['eventId'], 'candidateId': item['candidateId']}
            candidate = find_candidate(item)
            if candidate is None:
                rejected.append({**ref, 'reason': 'This entry no longer exists.'})
                continue
            if candidate.event.finalized_at:
                rejected.append({**ref, 'reason': 'Results are final. Reopen them to import more sheets.'})
                continue
            try:
                outcome = apply_sheet(judge, candidate, item, source)
            except SheetRejected as exc:
                rejected.append({**ref, 'reason': str(exc)})
                continue
            saved.append({**ref, 'stale': outcome == 'stale'})

    return Response({'saved': saved, 'rejected': rejected})


def missing_sheets(event):
    """Every (judge, entry) pair without a complete sheet for this event."""
    needed = event.criteria.count()
    if not needed:
        return []
    complete = {
        (row['judge_id'], row['candidate_id'])
        for row in Score.objects.filter(candidate__event=event, criterion__event=event)
        .values('judge_id', 'candidate_id')
        .annotate(n=Count('id'))
        if row['n'] >= needed
    }
    return [
        {'judgeId': judge_id, 'candidateId': candidate_id}
        for judge_id in Judge.objects.values_list('id', flat=True)
        for candidate_id in event.candidates.values_list('id', flat=True)
        if (judge_id, candidate_id) not in complete
    ]


class AdminOnly:
    permission_classes = [IsTabulatorAdmin]


class EventViewSet(AdminOnly, viewsets.ModelViewSet):
    queryset = Event.objects.prefetch_related('criteria', 'candidates', 'categories')
    serializer_class = EventSerializer

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """Freeze the results so they can be presented. Missing sheets block it unless force is set."""
        event = self.get_object()
        if not event.locked:
            return Response({'detail': 'Lock scoring before finalizing.'}, status=status.HTTP_400_BAD_REQUEST)
        missing = missing_sheets(event)
        if missing and not request.data.get('force'):
            return Response(
                {'detail': 'Some sheets are missing.', 'missing': missing}, status=status.HTTP_409_CONFLICT
            )
        event.finalized_at = timezone.now()
        event.save(update_fields=['finalized_at'])
        return Response({**EventSerializer(event).data, 'missing': missing})

    @action(detail=True, methods=['post'])
    def unfinalize(self, request, pk=None):
        event = self.get_object()
        event.finalized_at = None
        event.save(update_fields=['finalized_at'])
        return Response(EventSerializer(event).data)


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


class CategoryViewSet(
    AdminOnly, mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    """Deleting a category keeps its entries; they simply have no category afterwards."""

    queryset = Category.objects.select_related('event')
    serializer_class = CategorySerializer


class JudgeViewSet(AdminOnly, viewsets.ModelViewSet):
    queryset = Judge.objects.all()
    serializer_class = JudgeSerializer

    @action(detail=True, methods=['post'], url_path='regenerate-code')
    def regenerate_code(self, request, pk=None):
        judge = self.get_object()
        judge.regenerate_code()
        return Response(JudgeSerializer(judge).data)
