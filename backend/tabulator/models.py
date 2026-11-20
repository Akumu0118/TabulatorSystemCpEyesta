import secrets

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Event(models.Model):
    """A judged segment (e.g. Pageant, Bench Yell) with its own criteria and entries."""

    name = models.CharField(max_length=120)
    locked = models.BooleanField(default=False, help_text='When locked, judges can no longer submit scores.')
    finalized_at = models.DateTimeField(
        null=True, blank=True, help_text='Set when results are final; scores are frozen and can be presented.'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.name


class Criterion(models.Model):
    """A scoring criterion. Weights within one event add up to at most 100."""

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='criteria')
    name = models.CharField(max_length=120)
    weight = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(100)])
    max_score = models.PositiveSmallIntegerField(
        default=100,
        validators=[MinValueValidator(1), MaxValueValidator(999)],
        help_text='Highest score a judge may give on this criterion (e.g. 10, 20 or 100).',
    )

    class Meta:
        ordering = ['id']
        verbose_name_plural = 'criteria'

    def __str__(self):
        return f'{self.name} ({self.weight}%, out of {self.max_score})'


class Candidate(models.Model):
    """An entry in an event: a contestant or a team."""

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='candidates')
    number = models.PositiveIntegerField()
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ['number', 'id']

    def __str__(self):
        return f'#{self.number} {self.name}'


def generate_judge_code():
    """A 4-digit access code not used by any other judge."""
    while True:
        code = str(secrets.randbelow(9000) + 1000)
        if not Judge.objects.filter(code=code).exists():
            return code


class Judge(models.Model):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=4, unique=True, default=generate_judge_code)
    last_seen_at = models.DateTimeField(null=True, blank=True, help_text='Last time this judge reached the tabulator.')

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.name

    def regenerate_code(self):
        self.code = generate_judge_code()
        self.save(update_fields=['code'])


class Score(models.Model):
    """One judge's raw score (0 to the criterion's max_score) for one entry on one criterion."""

    NETWORK, QR, MANUAL = 'network', 'qr', 'manual'
    SOURCES = [(NETWORK, 'Sent from the judge'), (QR, 'Imported by QR'), (MANUAL, 'Entered by the organizer')]

    judge = models.ForeignKey(Judge, on_delete=models.CASCADE, related_name='scores')
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name='scores')
    criterion = models.ForeignKey(Criterion, on_delete=models.CASCADE, related_name='scores')
    value = models.DecimalField(max_digits=5, decimal_places=2, validators=[MinValueValidator(0)])

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.value is not None and self.criterion_id and self.value > self.criterion.max_score:
            raise ValidationError({'value': f'Must be at most {self.criterion.max_score}.'})

    updated_at = models.DateTimeField(auto_now=True)
    client_updated_at = models.DateTimeField(
        null=True, blank=True, help_text='When the judge saved this sheet on their phone. The newest sheet wins.'
    )
    source = models.CharField(max_length=10, choices=SOURCES, default=NETWORK)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['judge', 'candidate', 'criterion'], name='unique_score_per_judge'),
        ]

    def __str__(self):
        return f'{self.judge} → {self.candidate} / {self.criterion.name}: {self.value}'
