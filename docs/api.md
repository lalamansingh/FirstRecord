# API reference

FirstRecord has no public API. The browser UI uses two kinds of server entry points:

1. **Server actions** handle all form mutations.
2. **Route handlers** under `/api` handle binary uploads, downloads and CSV export.

Both need an authenticated session cookie (`fr_session`). Neither accepts API keys or bearer tokens. Building an integration (for example with an official filing system) would need a separately designed and authorized API.

## Common rules

| Rule | Server actions | Route handlers |
|---|---|---|
| Authentication | `requireActor()` / `getCurrentUser()` | `requireActor()` / `getCurrentUser()` |
| CSRF / origin | Next.js built-in Origin check | `assertSameOrigin()` on every POST (an Origin header is required and must match the host or `APP_ORIGIN`) |
| Authorization | Permission check, then record-level `assert*Access` | Same |
| Validation | zod, returned as `{ ok:false, error, fieldErrors }` | zod or explicit checks, returned as JSON `{ error, fieldErrors? }` with an HTTP status |
| Audit | Sensitive mutations write `audit_events` | Uploads, downloads, playback and exports write `audit_events` and/or `record_access_events` |
| Errors | 401 is not signed in, 403 is forbidden, **404 is not found or no access** (existence is not disclosed), 409 is a conflict, 422 is a validation error, 429 is rate limited | Same codes |

Server actions return `ActionResult`:

```ts
type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
```

## Route handlers

### `POST /api/statements/:id/recordings`

Uploads an audio or video recording for a statement.

- **Permission:** `recording.create` and access to the statement
- **Body:** `multipart/form-data` with `file` (Blob), `kind` (`audio` or `video`), and `durationMs` (optional)
- **Rules:**
  - The latest consent event for the scope must be `granted`, otherwise **409**.
  - The MIME type must be in `ALLOWED_RECORDING_TYPES` (webm, ogg or mp4) and match `kind`.
  - The magic bytes must match the declared type.
  - The size must be no more than `MAX_RECORDING_MB`.
  - The statement must not be abandoned.
  - Rate limit: 30 uploads per user per hour.
- **Response:** **201** only after the encrypted object is written and verified and its metadata row is committed. If anything fails after the write, the stored object is removed.

### `GET /api/recordings/:id?token=…`

Streams a recording for playback.

- **Permission:** `recording.view`, access to the statement, and a valid file token
- The token comes from `createFileToken("recording", id, userId)`. It is valid for 5 minutes and bound to the user. Pages generate it when they render.
- Writes a `record_access_events` row (`play`) and an audit event.
- **404** if the recording was deleted under retention.
- Headers: `Cache-Control: no-store, private` and `nosniff`.

### `POST /api/attachments`

Uploads an attachment to a case.

- **Permission:** `attachment.upload` and access to the case (checked in `uploadAttachment`)
- **Body:** `multipart/form-data` with `caseId`, `file`, and `description` (optional, up to 500 characters)
- **Rules:**
  - The type must be allowlisted (PDF, JPEG, PNG, WebP, plain text, MP3, WAV, MP4).
  - The magic bytes must match the declared type.
  - The size must be no more than `MAX_UPLOAD_MB`.
  - Rate limit: 30 uploads per 10 minutes per user.
- **Response:** **201** `{ ok: true, … }`

### `GET /api/attachments/:id?token=…`

Downloads an attachment.

- **Permission:** `attachment.download`, access to the case, and a valid file token (5 minutes, user-bound)
- Sent as `Content-Disposition: attachment` with `Content-Security-Policy: default-src 'none'; sandbox`, so the file is never rendered inline.
- Writes access and audit records.

### `POST /api/export`

Downloads aggregate analytics as CSV.

- **Permission:** `analytics.export`
- **Body:** form fields `dataset`, `purpose`, `purposeNote` (required when the purpose is `other`), `confirm=yes`, and the optional filters `from`, `to`, `status`, `stationId` and `officerId`. Filters are clamped to the user's scope.
- The output holds **aggregate counts only**: no party names and no statement text.
- Writes an audit event with the dataset, purpose and row count, plus an access record.
- Rate limit: 20 exports per user per hour. `GET` returns 405.

## Server actions

Server actions live next to their pages. Every action checks its own permission. The main ones are listed here.

| File | Actions | Key permissions |
|---|---|---|
| `src/app/login/actions.ts` | `loginAction`, `demoLoginAction` (refused unless `DEMO_MODE`), `logoutAction` | — |
| `src/app/(app)/intake/actions.ts` | `createIntakeAction`, `updateIntakeAction`, `setMethodAction`, `consentAction`, `withdrawConsentAction`, `saveTranscriptAction`, `confirmTranscriptAction`, `generateDraftAction`, `createCaseAction`, `abandonAction` | `statement.create`, `statement.edit`, `recording.create` (to grant consent), `draft.generate`, `case.create`, `case.assign` (to assign others) |
| `src/app/(app)/statements/actions.ts` | `saveDraftAction`, `decideFieldAction`, `commentAction`, `resolveCommentAction`, `requestReviewAction`, `clarificationAction`, `markReviewedAction` | `draft.edit`, `draft.review` |
| `src/app/(app)/cases/actions.ts` | `changeStatusAction`, `assignAction`, `updateDetailsAction`, `officialStatusAction`, `addNoteAction`, `savePartyAction`, `linkCaseAction`, `unlinkAction`, `dismissDuplicateAction`, `requestReviewAction`, `bulkAction`, `deleteAttachmentAction` | `case.status`, `case.assign`, `case.edit`, `case.official_status`, `case.link`, `case.bulk`, `attachment.delete` |
| `src/app/(app)/tasks/actions.ts` | `createTaskAction`, `updateTaskAction`, `assignTaskAction`, `changeTaskStatusAction`, `addTaskCommentAction` | `task.manage` |
| `src/app/(app)/notifications/actions.ts` | `markNotificationReadAction`, `markAllNotificationsReadAction` | own notifications only |
| `src/app/(app)/admin/actions.ts` | `createUserAction`, `updateUserAction`, `setUserStatusAction`, `resetPasswordAction`, `unlockUserAction`, `revokeSessionsAction`, `updateRolePermissionsAction`, `createRoleAction`, `renameRoleAction`, `deleteRoleAction` | `user.manage`, `role.manage`. An admin cannot grant permissions they do not hold themselves. |
| `src/app/(app)/settings/actions.ts` | `updateProfileAction`, `changePasswordAction`, `updateNotificationPrefsAction`, `updateStationAction`, `updateNumberingAction`, `saveWorkflowAction`, `saveListsAction`, `saveTemplateAction`, `saveRecordingNoticeAction`, `updateRetentionPolicyAction`, `runRetentionAction`, `deleteFlaggedAction`, `demoResetAction` (demo mode only) | own profile; `settings.station`, `settings.workflow`, `settings.retention`, `data.delete`, `demo.reset` |

The business logic behind these actions is in `src/lib/domain/*`. Those functions take an `AuthUser` and do their own authorization, so they can be tested and reused without the HTTP layer (see `tests/workflow-e2e.test.ts`).
