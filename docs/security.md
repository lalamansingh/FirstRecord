# Security and privacy

This page describes the controls FirstRecord implements in code, the threats they address, and what is still the deployer's responsibility.

## What has NOT been established

Read this first.

- **No independent security audit or penetration test** has been carried out.
- **No certification** of any kind, for example ISO 27001, SOC 2 or a government empanelment.
- **No legal or regulatory compliance review** for any jurisdiction, covering data protection, evidence law, police procedure or records retention.
- **No tamper-proof chain of custody.** The audit log and the immutable-version tables are protected by application-level database triggers. Anyone with direct access to the database file or the server can bypass them. They support operational accountability, not legally certified evidence integrity.
- **No official system integration.** FirstRecord does not connect to any police database or FIR filing system.
- **No production identity provider integration.** Local accounts with scrypt passwords are implemented. SSO/OIDC is an integration point that is not built.

## Threat model (STRIDE)

| Threat | Examples | Controls in FirstRecord | Residual risk / deployer action |
|---|---|---|---|
| **Spoofing** | Stolen passwords, session theft, staff using the demo sign-in | scrypt password hashes. Lockout for 15 minutes after 5 failures. Per-IP rate limit on sign-in. Random 256-bit session tokens, stored only as hashes. `httpOnly`, `SameSite=Lax` and (in production over https) `Secure` cookies. 8-hour idle and 12-hour absolute session expiry. Sessions revoked when an account is suspended. Demo sign-in only when `DEMO_MODE=true`, with a permanent banner. | No MFA. Use SSO with MFA (integration needed) or put the app behind an authenticating proxy. Disable demo mode. |
| **Tampering** | Editing transcripts or drafts after review, altering audit history, CSRF | Immutable `transcript_versions` and `draft_versions`, append-only `audit_events` and `consent_events` (triggers). Server actions use Next.js Origin checking. Route handlers call `assertSameOrigin`. All SQL uses bound parameters. zod validation on every input. AES-GCM authenticated encryption detects changes to stored files. | Database-level bypass is possible for anyone with file access. Restrict server access and take off-host backups. |
| **Repudiation** | "I never viewed or exported that" | An audit event with actor, IP, timestamp and summary for sign-ins, permission and role changes, status changes, assignments, reviews, exports and deletions (including refused attempts). `record_access_events` for views, playback, downloads and exports of sensitive records. | Logs live in the same database. Forward them to a write-once log store for stronger assurance. |
| **Information disclosure** | Staff browsing cases they don't work on, IDOR, content leaking into logs, notifications or analytics | Deny-by-default permissions plus record-level scoping. Inaccessible records return "not found". PII masking without `party.view_pii`. The System Administrator role has no content access. Files are encrypted at rest and served only through checked routes with short-lived, user-bound HMAC tokens. Notification titles, audit summaries and metadata (redacted), analytics and URLs carry no statement content. CSV exports are aggregate-only and need a purpose. Security headers (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`). | The database itself is not encrypted. Use full-disk or volume encryption, protect `.env.local`, and protect backups. |
| **Denial of service** | Upload floods, oversized files | Upload size limits (`MAX_UPLOAD_MB`, `MAX_RECORDING_MB`). Server-action body limit. Sign-in rate limit. | The rate limiter is in-memory and per process. Put a reverse proxy with rate limiting in front. |
| **Elevation of privilege** | A clerk marking a draft reviewed, a user granting themselves a role | Every mutation checks its permission on the server. Role and permission edits need `role.manage` and are audited. Users cannot change their own role. The workflow rejects transitions that are not configured. | Review role definitions after any customization. Keep the number of `role.manage` holders small. |

## Implemented controls (checklist)

- [x] Server-side authentication on every page, action and route
- [x] Least-privilege default roles, configurable permissions, record-level checks
- [x] Input validation (zod) and output encoding (React escapes output by default; no `dangerouslySetInnerHTML` for user content)
- [x] CSRF: Origin checks (server actions built in, route handlers explicit), `SameSite=Lax` cookies
- [x] SQL injection: parameterized queries only. Dynamic column names come only from code, never from input.
- [x] Upload validation: allowlisted MIME types, magic-byte sniffing, size limits, sanitized filenames
- [x] Encrypted file storage (AES-256-GCM) outside the web root
- [x] Expiring, user-bound file tokens. No public file URLs.
- [x] Audit trail and record-access logging, with metadata redacted
- [x] Account lockout, sign-in rate limiting, session expiry and revocation
- [x] Redacted error logging (error name and message only, no payloads)
- [x] Secrets only in environment variables. `.env.example` holds placeholders only.
- [ ] Malware scanning of uploads: integration point only (`scan_status` stays `not_scanned`)
- [ ] MFA / SSO: integration point only
- [ ] Database encryption at rest: deployer responsibility (volume encryption)

## Production deployment checklist

Before handling any real statement:

1. **Approvals:** legal review of templates, consent wording, retention periods and data flows. Organizational authorization to run the system. Hindi (and any other) translations reviewed.
2. **`DEMO_MODE=false`.** Then run `npm run db:seed` on an empty database (it creates no demo users), create the first admin with `npm run user:create`, and replace the demo stations.
3. **Secrets:** generate a unique `SESSION_SECRET` and `STORAGE_ENCRYPTION_KEY`. Store them in a secret manager. **Escrow the encryption key**, because files cannot be recovered without it.
4. **TLS:** serve over HTTPS only, behind a reverse proxy. Set `APP_ORIGIN=https://…` so that cookies are `Secure` and origin checks match.
5. **Host hardening:** a dedicated service account, a restricted file mode on `data/`, full-disk encryption, OS patching, and firewalling so that only the proxy is reachable.
6. **Network access:** restrict access to the station network or a VPN where possible.
7. **AI:** leave `AI_PROVIDER=demo` until external processing is authorized in writing and the provider's data-retention terms have been checked.
8. **Backups:** schedule them, encrypt them, store them off the host, and **test restores** ([operations.md](operations.md)).
9. **Retention job:** schedule `npm run retention:run` daily, and confirm the policies match the approved schedule.
10. **Monitoring:** collect application logs and watch for repeated `auth.login_failed` and `auth.account_locked` events.
11. **Rate limiting and WAF** at the proxy.
12. **Independent security review / penetration test** before go-live.
13. **User training** on the difference between a report received, a statement recorded, a draft prepared, a draft reviewed and an FIR officially filed.
