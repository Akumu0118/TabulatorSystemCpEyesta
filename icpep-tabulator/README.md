# ICPEP Tabulator

Vue 3 + Vite + Tailwind CSS v4. Admin and judge logins, per-event criteria and entries, live tabulation, printable tally sheet, light/dark mode, and offline score saving that syncs to the admin.

## Setup
```bash
npm install
```

## Run at the event (production)
```bash
npm start            # builds, then serves app + API on port 3000
```
Admin password defaults to `admin`. Change it:
- Windows (PowerShell): `$env:ADMIN_PASS="mypass"; npm start`
- Mac/Linux: `ADMIN_PASS=mypass npm start`

Then log in as Admin, open **Judge access**, and share the link and codes. Judges must be on the same Wi-Fi.

## Develop
Two terminals:
```bash
npm run server   # API on :3000
npm run dev      # UI on :5173 (proxies /api to :3000)
```

## Structure
```
index.html  vite.config.js  server.js  package.json
public/favicon.svg
src/main.js  src/App.vue  src/store.js  src/style.css
src/components/  AppHeader  AppFooter  EventNav  LoginScreen  AdminDashboard
                 LeaderboardTable  CriteriaManager  ContestantManager
                 PrintTallyModal  SetupModal  JudgePortal  Icon
```
Scores and settings are saved to `data.json` next to `server.js`. Delete it to reset.
