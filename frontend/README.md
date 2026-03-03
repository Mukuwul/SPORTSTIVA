# Sportstiva Frontend

React + Vite frontend for the Sportstiva real-time sports app.

## What this UI supports

- Health + connectivity (`GET /health`, WebSocket `/ws`)
- Live matches list (max 4) (`GET /api/matches/live`)
- Upcoming and past sections (max 4 each) derived from (`GET /api/matches`)
- Click a live match to open live commentary panel (`GET /api/matches/:id/commentary`)
- Real-time commentary/score/status updates through WebSocket subscription
- Manual refresh and optional live sync trigger (`POST /api/sync/live-matches`)

## Run

```bash
cd frontend
npm install
npm run dev
```

## Backend URL

Default API base is `http://localhost:5000`.  
You can override it in two ways:

1. Use the Connection panel in the app and save config.
2. Set `VITE_API_BASE_URL` in `frontend/.env`.

Create `frontend/.env` with:

```env
VITE_API_BASE_URL=http://localhost:5000
```
