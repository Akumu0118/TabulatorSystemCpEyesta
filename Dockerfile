# syntax=docker/dockerfile:1

# ---- 1. Build the Vue frontend ----
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Django app served by gunicorn ----
FROM python:3.13-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Static files are baked into the image; the key here is only used for this build step.
RUN DJANGO_SECRET_KEY=build-only DJANGO_DEBUG=false python manage.py collectstatic --noinput \
 && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh \
 && chmod +x /usr/local/bin/entrypoint.sh \
 && useradd --system --uid 10001 --home /app tabulator \
 && chown -R tabulator /app

USER tabulator
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "4", "--access-logfile", "-"]
