# FirstRecord

FirstRecord is a case-management and statement-recording system for police stations. Authorized staff use it to:

- take a person's account, typed or recorded with consent,
- keep the original account, transcript versions, draft versions and review decisions linked together,
- prepare an editable FIR **draft** from the reviewed account,
- track cases and tasks through a configurable workflow,
- see the status and next action for every case.


## Live deployment (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/lalamansingh/FirstRecord)

Runs the Docker image on Render's free plan with fictional demo data. You'll be asked for
`JUDGE_PASSWORD` (evaluation account `judges@firstrecord.example`) and `SEED_PASSWORD`
(sample staff accounts). Free instances sleep when idle and re-seed the demo data on restart.

## What FirstRecord is not

- **It is not an official filing system.** Saving or reviewing a draft never files an FIR. A case shows "Officially filed" only when an authorized external system confirms it, and no such integration ships with FirstRecord. See [docs/external-dependencies.md](docs/external-dependencies.md).
- **It is not a government system**, and it is not affiliated with any police department or government body.
- **It makes no decisions.** The AI assistant only organizes what the speaker said, with source quotes, for a human to review. It never decides whether an offence occurred, never chooses legal sections, never scores credibility, guilt or risk, and never submits anything.
- **Compliance is not established.** The security and privacy controls are documented in [docs/security.md](docs/security.md), but they have not been independently audited. No certification, legal or regulatory compliance, or tamper-proof evidence handling is claimed. A real deployment needs legal review for its jurisdiction, a security review, and organizational approval.

## Quick start (local demo)

Requirements: Node.js 22.13 or later (Node 24 recommended). FirstRecord uses the built-in `node:sqlite` module, so there are no native database drivers to install.

```bash
npm install
cp .env.example .env.local
# Generate the two secrets and paste them into .env.local:
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('STORAGE_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
npm run db:seed      # creates the schema and the fictional demo data (DEMO_MODE=true)
npm run dev          # http://localhost:3000
```

### Demo accounts

With `DEMO_MODE=true`, `npm run db:seed` creates the sample accounts below. Their password is `SEED_PASSWORD` from `.env.local`, or, if that is unset, a random password printed once by the seed command. No credentials are shown in the app. All people, stations, phone numbers (`00000-0xxxx`) and events are fictional.

### Account for hackathon judges

Create one shared evaluation account and hand the credentials to the judges privately:

```bash
FR_NEW_PASSWORD='choose-a-strong-password-123' \
  npm run user:create -- --email judges@firstrecord.example --name "Hackathon Judges" \
  --role station_admin --station CNT --no-force-change
```

`--no-force-change` skips the forced password change at first sign-in. Use `--role reviewer` for a read-only account. Sign-in attempts and all access are logged.

| Account | Role | Station |
|---|---|---|
| admin@central.example | Station Administrator | CNT |
| officer.rao@central.example | Officer | CNT |
| officer.khan@central.example | Officer | CNT |
| clerk@central.example | Records Clerk | CNT |
| reviewer@central.example | Read-only Reviewer | CNT |
| sysadmin@firstrecord.example | System Administrator | — |
| officer.das@riverside.example | Officer | RVR |
| admin@riverside.example | Station Administrator | RVR |

The demo data contains 24 cases at every workflow stage, about 40 tasks (including overdue and due-soon ones), draft versions with reviews, one statement in Hindi, and in-progress intakes. It contains **no audio or video recordings**. You can try the recording workflow live in a browser.

### Production-style setup (no demo data)

```bash
# .env.local: DEMO_MODE=false, real secrets, APP_ORIGIN=https://your-host
npm run db:seed                               # reference data only: roles, workflows, template, retention
FR_NEW_PASSWORD='a-long-password-123' npm run user:create -- \
  --email admin@example.org --name "Station Admin" --role station_admin --station CNT
npm run build && npm start
```

The seeded stations are demo placeholders. Rename them, or create real ones, in **Settings → Station**. Read the [production checklist](docs/security.md#production-deployment-checklist) before handling real records.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite (each test file uses its own isolated temporary database) |
| `npm run check` | Run typecheck, lint, test and build in sequence |
| `npm run db:migrate` | Apply pending schema migrations (also applied automatically on startup) |
| `npm run db:seed` | Seed an empty database |
| `npm run db:reset` | **Wipe all data** and reseed. Refused unless `DEMO_MODE=true` |
| `npm run user:create` | Create a user from the CLI (password read from `FR_NEW_PASSWORD`) |
| `npm run retention:run` | Apply retention policies and send task reminders (run it from cron) |
| `npm run docs:permissions` | Regenerate [docs/permissions.md](docs/permissions.md) from the code |

## Project layout

```
src/
  app/
    login/                 sign-in (password + clearly-labelled demo sign-in)
    (app)/                 authenticated application (sidebar shell)
      page.tsx             Overview dashboard
      cases/               case list, board, and case workspace
      intake/              New Report guided workflow (intake → consent → capture → transcript → draft → review → case)
      statements/          draft review workspace (side-by-side source vs draft)
      tasks/               task list, board, and detail
      records/             statements, transcripts, drafts, attachments, audit
      analytics/           aggregate reports + CSV export
      admin/               users and roles
      settings/            station, workflows, templates, retention, preferences, system status
    api/                   route handlers for file upload/download and export
  components/              UI primitives (ui.tsx, forms.tsx, shell.tsx) and feature components
  lib/
    db/                    node:sqlite connection, query helpers, versioned migrations
    auth/                  password hashing, sessions
    rbac/                  permission catalog, record-level access checks
    domain/                business logic (cases, tasks, workflow, notifications, retention…)
    ai/                    AI provider abstraction, demo provider, source verification
    storage.ts             encrypted file storage adapter and expiring file tokens
    audit.ts               append-only audit trail and access logging
    seed/                  reference data + fictional demo content
scripts/                   CLI: migrate, seed, create-user, retention, docs generation
tests/                     Vitest suites
docs/                      architecture, permissions, AI, consent/retention, security, operations, API
```

## Documentation

- [Architecture and data flows](docs/architecture.md)
- [Roles and permissions](docs/permissions.md)
- [AI behaviour and limitations](docs/ai.md)
- [Recording consent and retention](docs/recording-consent-retention.md)
- [Security, threat model and production checklist](docs/security.md)
- [Operations: backup, recovery, migrations, retention jobs](docs/operations.md)
- [API reference](docs/api.md)
- [External dependencies that need credentials or approval](docs/external-dependencies.md)

## Deploy

FirstRecord needs a host with a persistent disk (SQLite + stored recordings), so it ships
as a Docker container: `Dockerfile`, `railway.json` (Railway) and `render.yaml` (Render
Blueprint). Mount a volume at `/data`, set `SESSION_SECRET`, `STORAGE_ENCRYPTION_KEY`,
`DEMO_MODE=true`, `JUDGE_EMAIL` and `JUDGE_PASSWORD`, and the container migrates, seeds
fictional demo data on first boot, creates the judges' account and starts. Health check:
`/api/health`. Full steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
