from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=False)
router.register('events', views.EventViewSet)
router.register('criteria', views.CriterionViewSet)
router.register('candidates', views.CandidateViewSet)
router.register('categories', views.CategoryViewSet)
router.register('judges', views.JudgeViewSet)

urlpatterns = [
    path('auth/login', views.login, name='login'),
    path('state', views.state, name='state'),
    path('info', views.info, name='info'),
    path('health', views.health, name='health'),
    path('scores', views.submit_scores, name='submit-scores'),
    path('scores/import', views.import_scores, name='import-scores'),
    path('', include(router.urls)),
]
