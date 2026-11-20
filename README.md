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

## Event network: a phone hotspot, no internet
```
 [phone: Wi-Fi hotspot, no internet]
        |              |
 [laptop: runs the tabulator]   [judges' tablets]
```
A spare phone runs a Wi-Fi hotspot. The laptop and the judges' tablets join it, and the laptop runs everything.
Nothing uses the internet: fonts, charts, QR codes and the HTTPS certificate are all local.

**Hotspot phone**
- Turn off the hotspot's auto-off ("Turn off hotspot automatically" / "Timeout"); keep the phone charging.
- Allow enough devices (laptop + every tablet + one spare). iPhone hotspots allow few devices; Android ones usually 8–10.
- Give it a name and password you can read out, and don't restart it during the event: a restart can give the laptop
  a new address (see below).

**Laptop**
- Plugged in, set to never sleep while plugged in. Join the hotspot, then run the start script below.
- The script asks once to let the tablets through Windows Firewall (hotspots count as "Public" networks; this needs
  administrator approval), and picks the laptop's Wi-Fi address even when a VPN (ZeroTier, Tailscale…) is also on.
- Leave the script's window open. It keeps watching the laptop's address and beeps if it changes.

**Tablets** (the `/setup` page walks through this)
- Android: when it says the network has no internet, choose to stay connected; turn mobile data off and "switch to
  mobile data" off, or the tablet stops talking to the laptop. iPad: turn off Wi-Fi Assist on cellular iPads.
- Forget other Wi-Fi networks nearby, set screen timeout to 10 minutes or more, and keep them charged.
- Do the one-time setup (certificate + home-screen icon) before the event, with the hotspot that will be used.

**If the laptop's address changes** (hotspot or laptop restarted): the start script updates the HTTPS certificate,
restarts the tabulator and prints the new address; **Judge access** shows it too. Browsers keep data per address,
so on each tablet tap **Laptop address changed?** and type the new address. The tablet's unsent sheets, drafts and
login come along. A tablet that can't reach the laptop at all can still hand its sheets over by QR (**Import sheets**).

Do a dry run with the real phone, laptop and one tablet before the event.

## Run with Docker (recommended for the event)
Requires Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux). Join the event hotspot first, then:

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
- Options: `-Ip 192.168.43.25` forces an address, `-NoWatch` starts and exits, `-SkipFirewall` skips the
  firewall check (`LAN_IP=…` and `--no-watch` for the shell script).
- Tablets can't connect? Check they're on the hotspot (not another Wi-Fi or mobile data), that the start script's
  firewall rule exists, and open `http://<laptop address>:8000/api/health` on the tablet. The firewall rule, as
  Administrator:
  `New-NetFirewallRule -DisplayName 'ICPEP Tabulator' -Direction Inbound -Protocol TCP -LocalPort 8000,8443 -Action Allow -Profile Any`
- Venue/guest Wi-Fi often blocks device-to-device traffic ("client isolation"); that's why the hotspot is used.

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
Log in as Admin, open **Judge access**, and share the link and codes. Tablets must be on the same hotspot.

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
