# Deploying FirstRecord to a public URL

FirstRecord keeps its SQLite database and its stored recordings/attachments on disk.
That rules out serverless hosts such as Vercel (no persistent filesystem). Use a host
that runs a **Docker container with a persistent volume** — Railway or Render below.
Everything durable lives under `/data` inside the container:

| Path | Contents |
| --- | --- |
| `/data/firstrecord.db` | SQLite database (`DATABASE_PATH`) |
| `/data/storage/` | Encrypted recordings and attachments (`STORAGE_DIR`) |

If `/data` is not on a persistent volume, **all data is lost on every redeploy**.

## What happens on boot

`scripts/docker-entrypoint.sh` runs on every start:

1. Fixes ownership of `/data`, then drops from root to the unprivileged `node` user.
2. Runs database migrations.
3. Seeds the database **only if it is empty**: reference data always; fictional demo
   cases and sample accounts only when `DEMO_MODE=true`. Later boots skip this.
4. If `JUDGE_EMAIL` and `JUDGE_PASSWORD` are set and that account does not exist yet,
   creates it (Station Administrator at station `CNT`, no forced password change).
5. Starts the server on `$PORT`.

Health check: `GET /api/health` returns `{"status":"ok","db":"ok"}` (HTTP 200).

## Environment variables

Generate secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it twice — once for each secret.

| Variable | Required | Value |
| --- | --- | --- |
| `SESSION_SECRET` | **yes** | random base64 (32 bytes) |
| `STORAGE_ENCRYPTION_KEY` | **yes** | random base64, exactly 32 bytes — without it files are stored unencrypted |
| `DEMO_MODE` | yes | `true` for the hackathon (fictional data + sample accounts); `false` for real use |
| `JUDGE_EMAIL` | recommended | e.g. `judges@firstrecord.example` |
| `JUDGE_PASSWORD` | recommended | 12+ characters; share privately with judges |
| `JUDGE_NAME` | optional | default `Hackathon Judges` |
| `JUDGE_ROLE` / `JUDGE_STATION` | optional | default `station_admin` / `CNT` |
| `SEED_PASSWORD` | optional | password for the seeded sample accounts (12+ chars); if unset a random one is printed once in the boot log |
| `APP_ORIGIN` | auto | public URL, e.g. `https://firstrecord.up.railway.app`. Filled automatically from Railway/Render; set it yourself if you use a custom domain |
| `AI_PROVIDER` | optional | `demo` (default, no external calls) |

`DATABASE_PATH`, `STORAGE_DIR`, `PORT` and `NODE_ENV` are preset in the image; leave them.

## Option A — Railway

**Dashboard**

1. Push this repository to GitHub.
2. railway.com → **New Project** → **Deploy from GitHub repo** → pick the repo.
   Railway detects `Dockerfile` and `railway.json` (health check `/api/health`).
3. Open the service → **Variables** → add the variables from the table above.
4. Service → right-click / **⋯** → **Attach volume** → mount path **`/data`**.
5. Service → **Settings** → **Networking** → **Generate Domain**. This is your public URL.
6. Redeploy (Deployments → ⋯ → Redeploy) so the volume and variables take effect.
   Watch **Deploy Logs** for `[boot] starting server`.

**CLI** (install: `npm i -g @railway/cli` or `brew install railway`)

```bash
railway login
railway init                       # create a project
railway up                         # build & deploy from this folder
railway volume add --mount-path /data
railway variables --set "SESSION_SECRET=..." --set "STORAGE_ENCRYPTION_KEY=..." \
  --set "DEMO_MODE=true" --set "JUDGE_EMAIL=judges@firstrecord.example" --set "JUDGE_PASSWORD=..."
railway domain                     # prints the public URL
```

## Option B — Render

1. Push this repository to GitHub.
2. dashboard.render.com → **New** → **Blueprint** → pick the repo. Render reads
   `render.yaml`: a Docker web service with a 1 GB disk at `/data` and health check
   `/api/health`. (Persistent disks need a paid instance type — `starter`.)
3. Render generates `SESSION_SECRET`. Fill in the prompted values:
   `STORAGE_ENCRYPTION_KEY`, `JUDGE_EMAIL`, `JUDGE_PASSWORD`, optionally `SEED_PASSWORD`.
4. **Apply**. When the deploy is live, the URL is shown at the top of the service page
   (`https://firstrecord-xxxx.onrender.com`).

## Run the container locally

Needs Docker Desktop running.

```bash
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
export STORAGE_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
docker compose up --build        # http://localhost:3000
```

## HTTPS

Browsers only allow the microphone, camera, geolocation (used by SOS) and service
workers / push notifications on **HTTPS** origins (or `localhost`). Railway and Render
both serve your URL over HTTPS automatically — always share the `https://` link.

## After deploying

- Open `https://<your-url>/api/health` — expect `{"status":"ok","db":"ok"}`.
- Sign in with `JUDGE_EMAIL` / `JUDGE_PASSWORD`.
- All seeded people, stations and events are fictional. This is a demonstration
  system: it does not file FIRs with any official system and is not certified for
  production police use.

## Backups

Download the volume's `firstrecord.db` periodically (Railway: volume backups;
Render: disk snapshots are automatic daily). Stop writes or use SQLite's
`.backup` command for a consistent copy.
