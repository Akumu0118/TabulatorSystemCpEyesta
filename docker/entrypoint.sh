#!/bin/sh
set -e

# Wait for PostgreSQL (compose healthcheck covers most cases; this covers restarts).
python - <<'PY'
import os, sys, time
import psycopg

params = dict(
    dbname=os.environ.get('POSTGRES_DB', 'tabulator'),
    user=os.environ.get('POSTGRES_USER', 'postgres'),
    password=os.environ.get('POSTGRES_PASSWORD', ''),
    host=os.environ.get('POSTGRES_HOST', 'db'),
    port=os.environ.get('POSTGRES_PORT', '5432'),
)
for attempt in range(60):
    try:
        psycopg.connect(connect_timeout=3, **params).close()
        break
    except psycopg.OperationalError as exc:
        print(f'Waiting for database ({exc.__class__.__name__})...', flush=True)
        time.sleep(1)
else:
    sys.exit('Database never became available.')
PY

python manage.py migrate --noinput

exec "$@"
