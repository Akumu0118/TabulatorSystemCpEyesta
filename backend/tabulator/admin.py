from django.contrib import admin

from .models import Candidate, Criterion, Event, Judge, Score


class CriterionInline(admin.TabularInline):
    model = Criterion
    extra = 0


class CandidateInline(admin.TabularInline):
    model = Candidate
    extra = 0


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['name', 'locked', 'created_at']
    list_filter = ['locked']
    inlines = [CriterionInline, CandidateInline]


@admin.register(Judge)
class JudgeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code']


@admin.register(Score)
class ScoreAdmin(admin.ModelAdmin):
    list_display = ['judge', 'candidate', 'criterion', 'value', 'updated_at']
    list_filter = ['judge', 'candidate__event']
    list_select_related = ['judge', 'candidate', 'criterion']
