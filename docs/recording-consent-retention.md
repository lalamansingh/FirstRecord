# Recording, consent and retention

> These workflows were designed carefully, but they have **not** been reviewed against any jurisdiction's law. Before handling real statements, the deploying organization must have the consent wording, the retention periods and the deletion procedures approved by qualified legal counsel and by the responsible authority.

## Recording is optional

- A report is always accepted, whether or not the person agrees to be recorded. Typed entry, staff-assisted entry and an accessible alternative (for people who cannot read, write, hear, or use the standard flow) are always available.
- Staff choose audio or video capture only after a consent step.

## Consent step

1. The staff member shows the **recording notice** in the speaker's language (English and Hindi are bundled). The notice explains what the recording is for, who can access it, how it is stored and how long it is kept, that recording is optional, and that the speaker can ask to stop at any time.
2. The speaker's decision is recorded as a `consent_events` row with:
   - scope (`audio` or `video`),
   - decision (`granted`, `declined` or `withdrawn`),
   - the **exact notice text** displayed, its version and its language,
   - the staff member who recorded the decision, and a timestamp.
3. `consent_events` is append-only (enforced by a database trigger). A withdrawal is a new event, never an edit.
4. The server refuses a recording upload unless the latest consent event for that statement and scope is `granted`.
5. If consent is declined or withdrawn, or the device cannot record, the workflow continues with typed or assisted entry.

Administrators can edit the notice text and its version in **Settings → Recording & retention**. Each change applies to new consent events only. Past events keep the text that was actually shown.

The Hindi notice was written for this project and **must be reviewed by a qualified translator** before use.

## Recording handling

- Capture uses the browser's MediaRecorder. The screen shows a recording indicator, the elapsed time, pause and stop (where supported), a preview, and save or discard.
- Errors are shown and never hidden: permission denied, no device, an unsupported browser, interruption, an upload failure or a storage failure. A recording is shown as saved only after the server has confirmed the encrypted write and recorded its SHA-256.
- The original recording is stored separately from transcripts. Transcripts are immutable versions. Corrections are new versions linked to the same statement.
- Playback and download need `recording.view` and access to the case, and every use is logged in `record_access_events`.

## Transcription

Recordings can be transcribed automatically on the staff member's device (Whisper, in-browser; the audio is not sent to any external service) or manually with timestamp markers. The machine transcript is saved as its own version and must be reviewed, corrected and read back to the speaker before it is confirmed. See `docs/ai.md`.

## Retention

Retention policies are set per record type in **Settings → Recording & retention** (needs `settings.retention`).

| Record type | Default | Default action |
|---|---|---|
| Recordings | 3 years | Flag for review |
| Attachments | 3 years | Flag for review |
| Closed cases | 7 years | Flag for review |
| Notifications | 90 days | Delete |
| Sessions | 30 days | Delete |

These defaults are placeholders. They are **not** legal retention periods.

- **Flag for review** lists expired records on the retention review screen. An authorized user (with `data.delete`) decides each deletion, gives a reason, and confirms.
- **Delete** removes records automatically when the retention job runs (`npm run retention:run`; see [operations.md](operations.md)). The defaults use it only for low-sensitivity operational data. An administrator *can* set recordings or attachments to Delete, but this should be done only under an approved retention schedule. Closed cases cannot be set to automatic deletion. They can only be flagged for review.
- Deleting a recording or attachment removes the stored file. The metadata row stays, with `deleted_at`, `deleted_by` and `deletion_reason`, so the history still shows that the item existed and why it was removed.
- Every deletion and every deletion attempt, including refused ones, writes an audit event.
- Audit events are not deleted by the retention job.

## Access to sensitive material

- Statement content needs `statement.view` plus access to the case.
- Recordings need `recording.view`.
- Contact details need `party.view_pii`. Without it they are masked.
- The System Administrator role has none of these by default.
- Notification previews, analytics, URLs and the audit log never contain statement content.
