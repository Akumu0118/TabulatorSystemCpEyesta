"""URL configuration for config project.

/api/...   JSON API for the Vue app
/admin/    Django admin (optional, needs `manage.py createsuperuser`)
anything else → the built Vue single-page app (frontend/dist/index.html)
"""
from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404, HttpResponse
from django.urls import include, path, re_path
from django.views.generic import TemplateView


def spa(request, *args, **kwargs):
    if not (settings.FRONTEND_DIST / 'index.html').exists():
        return HttpResponse(
            'Frontend not built. Run `npm run build` in frontend/, or use the Vite dev server on :5173.',
            status=503,
            content_type='text/plain',
        )
    res = TemplateView.as_view(template_name='index.html')(request)
    # Always revalidate: a cached page would keep loading the previous build's hashed bundles.
    res['Cache-Control'] = 'no-cache'
    return res


def dist_file(name, content_type, **headers):
    """Serve one built file from the site root (the rest of the build lives under /static/)."""

    def view(request):
        target = settings.FRONTEND_DIST / name
        if not target.exists():
            raise Http404(f'{name} is not built yet.')
        res = FileResponse(target.open('rb'), content_type=content_type)
        res['Cache-Control'] = 'no-cache'
        for key, value in headers.items():
            res[key.replace('_', '-')] = value
        return res

    return view


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('tabulator.urls')),
    # The service worker must come from the root so it can serve the app while offline.
    path('sw.js', dist_file('sw.js', 'text/javascript', Service_Worker_Allowed='/')),
    # One-time phone setup: trust the tabulator's certificate, then install the app.
    path('setup', dist_file('setup.html', 'text/html; charset=utf-8')),
    re_path(r'^(?!api/|admin/|static/).*$', spa, name='spa'),
]
