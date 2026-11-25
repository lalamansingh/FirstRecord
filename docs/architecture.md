# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | Next.js 16 (App Router), React 19, TypeScript | Server components render data on the server. Server actions give typed mutations with built-in Origin checking. |
| Styling | Tailwind CSS 4 | Consistent, restrained design tokens without a component-library dependency |
| Database | SQLite through Node's built-in `node:sqlite` (WAL mode, foreign keys on) | Needs no native modules or separate server. Suits one station or a small group of stations. See [operations.md](operations.md#scaling-and-moving-to-a-managed-database) for moving to a managed relational database. |
| Migrations | Versioned SQL in `src/lib/db/migrations.ts`, recorded in `schema_migrations` | Plain SQL with no ORM. Migrations apply automatically on startup or through `npm run db:migrate`. |
| Validation | zod | Validates every server action and API input on the server |
| Tests | Vitest | Each test file gets its own temporary database and storage directory |

## Layers

```
Browser ──► Next.js server components (read)  ──┐
        ──► Server actions (mutations)         ──┼──► lib/domain/*  ──► lib/db (bound-parameter SQL)
        ──► Route handlers /api/* (files, CSV) ──┘        │
                                                         ├──► lib/rbac (permission + record-level checks)
                                                         ├──► lib/audit (append-only audit, access log)
                                                         ├──► lib/storage (AES-256-GCM files)
                                                         ├──► lib/ai (provider abstraction)
                                                         └──► lib/domain/notifications (in-app + adapters)
```

- **Pages** call `requireUser()` or `requirePagePermission()` from `lib/auth/session.ts`. They then query through domain functions that apply the record-level filters in `lib/rbac/access.ts`.
- **Server actions** call `requireActor(permission)`. They then run record-level assertions (`assertCaseAccess`, `assertStatementAccess`, `assertTaskAccess`), validate input with zod, and write in a transaction with an audit event. `runAction()` turns errors into user-facing results.
- **Route handlers** do the same checks, plus `assertSameOrigin()` on state-changing requests.

## Main data flow: report → statement → draft → review → case

```
 Intake (statement row, status=in_progress, save-and-resume)
   │  station, intake time, capture officer, location, language, speaker contact (minimal)
   ▼
 Capture method ── typed | audio | video | staff-assisted | accessible alternative
   │
   ├─ audio/video ─► Consent notice shown (versioned text, en/hi)
   │                  └─ consent_events: granted | declined | withdrawn (+ notice text, version, language, who, when)
   │                      declined ─► continue with typed/assisted entry (report is never refused)
   ▼
 Recording (browser MediaRecorder) ─► POST /api/statements/:id/recordings
   │   server checks consent=granted, type and magic bytes, size; encrypts; verifies write; records sha256
   ▼
 Transcript versions (immutable rows; each correction is a new version)
   │   typed_original | manual_transcription | automatic_transcription* | assisted_entry | correction
   │   optional segment timestamps link passages to recording offsets ([mm:ss] or [mm:ss - mm:ss])
   │   *automatic: on-device Whisper in a Web Worker; raw output saved as its own version,
   │    staff edits saved as a separate version on top
   │   speaker/staff confirmation recorded (transcript_confirmed_at/by)
   ▼
 Draft generation (lib/ai) from a specific transcript version
   │   every field: value + status (provided / not_provided / needs_confirmation) + verbatim source quotes
   │   quotes are re-verified against the transcript server-side; unverifiable quotes are dropped
   │   draft_versions are immutable; edits create new versions; AI/demo origin and timestamp kept
   ▼
 Review (side-by-side source vs draft, field diffs, accept/edit/reject suggestions, comments)
   │   "Request clarification" or "Mark reviewed" (needs draft.review + explicit confirmation)
   │   required template fields validated; reviewed ≠ filed
   ▼
 Case creation
     reference from the station's numbering format (atomic per station/period)
     links statement, consent events, transcripts, drafts, attachments; status history; audit events
     official_status = "local" until an authorized external system confirms otherwise
```

\* Automatic transcription needs a transcription provider. None is bundled (see [external-dependencies.md](external-dependencies.md)).

## Data model (summary)

These are the main entities. The full schema is in `src/lib/db/migrations.ts`.

- **Identity and access:** `stations`, `roles` (permission list as JSON, editable), `users`, `sessions` (stores only the SHA-256 hash of each token)
- **Cases:** `cases`, `case_parties`, `case_assignments`, `case_status_history`, `case_links` (related or possible duplicate; records are never merged automatically), `case_notes`, `case_sequences`
- **Statements:** `statements` (the intake), `consent_events` (append-only), `recordings`, `transcript_versions` (immutable)
- **Drafts:** `drafts`, `draft_versions` (immutable), `reviews`, `review_comments`, `templates`
- **Work:** `tasks`, `task_comments`, `task_activity`, `notifications`
- **Records:** `attachments`, `record_access_events`, `audit_events` (append-only), `ai_request_metadata`
- **Configuration:** `workflow_definitions`, `retention_policies`, `settings`

The append-only and immutable rules are enforced with SQLite triggers. They protect against changes made through the application. Anyone with direct access to the database file can still bypass them, so they are not a tamper-proof mechanism.

## Authorization model

See [permissions.md](permissions.md). In summary:

1. **Deny by default.** A role holds an explicit list of permission keys.
2. **Server-side enforcement.** Every page, action and route checks permissions itself. Hidden controls are only a convenience.
3. **Record-level scope.** Case visibility comes from `case.view.assigned`, `case.view.station` and `case.view.all`. Statements, tasks, attachments and drafts inherit visibility from their case.
4. **No existence leaks.** An inaccessible record returns "not found".
5. **Field-level privacy.** Party contact details are masked unless the user holds `party.view_pii`.

## Storage

`lib/storage.ts` defines a `StorageAdapter` interface. The bundled local adapter works like this:

- Files are written under `STORAGE_DIR`, outside the web root, with mode `0600`.
- Each object is encrypted with AES-256-GCM (a random IV per object, authenticated with a tag) when `STORAGE_ENCRYPTION_KEY` is set.
- Each write is checked after it lands. A failed write is reported as a failure, never as "saved".
- The SHA-256 of the plaintext is recorded for integrity checks.
- Files are served only through permission-checked route handlers. Each request needs a valid session **and** a short-lived (5 minute) HMAC token bound to the file, the user and an expiry. The URLs carry identifiers only, never content.

To use object storage (for example S3-compatible), implement `StorageAdapter` and return it from `storage()`.

## AI abstraction

`lib/ai` defines an `AIProvider` interface (`generateDraft`, `summarize`, `chronology`, `questions`) with two implementations:

- **Demo provider (default):** deterministic and local, with no network calls. It copies verbatim sentences into fields by fixed rules and labels everything as demo output.
- **Anthropic provider:** used only when `AI_PROVIDER=anthropic`, an API key is set, **and** `AI_EXTERNAL_PROCESSING_AUTHORIZED=true`.

Both providers' output goes through server-side source verification. See [ai.md](ai.md).

## Notifications

Notifications are written in-app (`notifications` table) for assignments, review requests, clarification requests, status changes, due-soon and overdue tasks, and comments. Titles contain only references and task titles, never statement content. Email and SMS go through a delivery-adapter list in `lib/domain/notifications.ts`. No adapter is bundled, and nothing is reported as sent when no adapter is configured.
