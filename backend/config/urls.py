"""URL configuration for config project.

/api/...   JSON API for the Vue app
/admin/    Django admin (optional, needs `manage.py createsuperuser`)
anything else → the built Vue single-page app (frontend/dist/index.html)
"""
from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path, re_path
from django.views.generic import TemplateView


def spa(request, *args, **kwargs):
    if not (settings.FRONTEND_DIST / 'index.html').exists():
        return HttpResponse(
            'Frontend not built. Run `npm run build` in frontend/, or use the Vite dev server on :5173.',
            status=503,
            content_type='text/plain',
        )
    return TemplateView.as_view(template_name='index.html')(request)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('tabulator.urls')),
    re_path(r'^(?!api/|admin/|static/).*$', spa, name='spa'),
]
