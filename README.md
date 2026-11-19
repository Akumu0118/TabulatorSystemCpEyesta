# ICPEP Tabulator

Vue 3 + TypeScript + Tailwind CSS v4 frontend, Django + Django REST Framework backend, PostgreSQL database.
Admin and judge logins, per-event criteria and entries, live tabulation, printable tally sheet, light/dark mode,
and offline score saving that syncs to the host when the judge reconnects.

## Structure
```
backend/                Django project (created with django-admin startproject / startapp)
  config/               settings, urls, wsgi/asgi
  tabulator/            models, API views, serializers, auth, migrations, tests
  requirements.txt
  .env.example          copy to .env
Dockerfile, compose.yaml  container build (Node builds the UI, gunicorn serves Django) + PostgreSQL
docker/entrypoint.sh      waits for the DB, runs migrations, starts gunicorn
scripts/start-lan.*       one-step LAN start (detects host IP, creates .env, starts Docker)
frontend/               Vue + TS app (Vite)
  src/types.ts          shared types
  src/api.ts            typed API client
  src/scoring.ts        weighting and ranking math
  src/store.ts          reactive state, sync, offline queue
  src/components/       UI
```

## Run with Docker (recommended for the event)
Requires Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux). Connect the host computer to the
event Wi-Fi first, then:

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\start-lan.ps1
```
```bash
# macOS / Linux
sh scripts/start-lan.sh
```

The script creates `.env` on first run (random `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`), detects this
computer's LAN IP, builds the images, starts PostgreSQL and the app, and prints the address judges should open,
e.g. `http://192.168.1.20:8000`. The same addresses appear in the app under **Judge access**.

- Admin password: `ADMIN_PASS` in `.env` (default `admin`, so change it before the event).
- Port: `APP_PORT` in `.env` (default 8000). The app listens on all interfaces; PostgreSQL is not exposed.
- Changed Wi-Fi? Re-run the script so `HOST_LAN_IP` is refreshed.
- Judges can't connect? Make sure they're on the same network, the host's Wi-Fi is set to **Private**, and
  port 8000 is allowed through the firewall. On Windows, as Administrator:
  `New-NetFirewallRule -DisplayName 'ICPEP Tabulator' -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Domain`
- Many venue/guest Wi-Fi networks block device-to-device traffic ("client isolation"). If so, use a phone
  hotspot or a dedicated router.

Everyday commands:
```bash
docker compose logs -f web      # watch requests
docker compose down             # stop (scores are kept in the pgdata volume)
docker compose down -v          # stop AND delete all data
docker compose exec web python manage.py createsuperuser   # for /admin/
```
Back up scores: `docker compose exec db pg_dump -U tabulator tabulator > backup.sql`

Note: `POSTGRES_PASSWORD` only takes effect when the database volume is first created. Don't change it later
unless you also run `docker compose down -v`.

## Local setup (without Docker)
Requires Python 3.12+, Node 20+, and PostgreSQL.

```bash
python -m venv .venv
.venv/Scripts/pip install -r backend/requirements.txt   # macOS/Linux: .venv/bin/pip
cp backend/.env.example backend/.env                     # set POSTGRES_PASSWORD, ADMIN_PASS, DJANGO_SECRET_KEY
createdb -U postgres tabulator
cd backend && ../.venv/Scripts/python manage.py migrate  # also seeds 3 events and 3 judges
cd ../frontend && npm install
```

## Develop
Two terminals:
```bash
cd backend && ../.venv/Scripts/python manage.py runserver     # API on :8000
cd frontend && npm run dev                                   # UI on :5173, proxies /api to :8000
```
Tests and type checks:
```bash
cd backend && ../.venv/Scripts/python manage.py test tabulator
cd frontend && npm run typecheck
```

## Run at the event without Docker
```bash
cd frontend && npm run build
cd ../backend && ../.venv/Scripts/python manage.py collectstatic --noinput
../.venv/Scripts/python manage.py runserver 0.0.0.0:8000
```
Set `DJANGO_DEBUG=false` and a real `DJANGO_SECRET_KEY` in `backend/.env` for the event.
Log in as Admin, open **Judge access**, and share the link and codes. Judges must be on the same Wi-Fi.

## API
All endpoints are under `/api` and take `Authorization: Bearer <token>` (from `POST /api/auth/login`).

| Method | Path | Who |
|---|---|---|
| POST | `/auth/login` `{role, secret}` | anyone |
| GET | `/state` | admin (all scores, judge codes) / judge (own scores) |
| GET | `/info` | admin (LAN addresses) |
| POST | `/scores` `{items:[{eventId,candidateId,scores}]}` | judge |
| CRUD | `/events`, `/criteria`, `/candidates`, `/judges`, `POST /judges/:id/regenerate-code` | admin |

Regenerating a judge's code signs that judge out. Django admin is at `/admin/` (needs `manage.py createsuperuser`).
