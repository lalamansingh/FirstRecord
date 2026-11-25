# External dependencies that need credentials, integration or approval

Source code alone cannot provide the items below. Until each one is supplied, FirstRecord works without it and **says so in the interface**. It never pretends an integration exists.

| Dependency | Status in FirstRecord | What is needed |
|---|---|---|
| **Official FIR / police records system** (for example a CCTNS-type state system) | **Not integrated.** Cases default to "Local record only". The `official_status` fields (`submitted`, `filed`, reference, confirmation time) exist so that a real integration can record verified responses. | Written authorization from the responsible authority, API access and credentials, the interface specification, and an integration that sets `filed` **only** on a verified confirmation from the authority's system |
| **Identity provider / SSO / MFA** | Local accounts (scrypt, lockout, sessions). SSO/OIDC is not implemented. | An IdP (for example the organization's OIDC or SAML provider), client credentials, role mapping, and MFA policy |
| **AI provider** | Rule-based assistant by default. Anthropic adapter is implemented but stays inactive unless configured **and** authorized. | An API key, written authorization for external processing of personal data, review of the provider's data-retention and training terms, and `AI_EXTERNAL_PROCESSING_AUTHORIZED=true` |
| **Approved legal-provision source** | None. The assistant does not suggest legal sections. | A maintained, approved source for the jurisdiction, plus a feature built on it and legal sign-off |
| **Speech-to-text transcription** | Bundled: on-device Whisper (transformers.js) runs in the browser; audio is not uploaded anywhere. By default the model weights (~80–250 MB, cached) and ONNX runtime files are downloaded from the Hugging Face hub / jsDelivr CDN. Manual transcription with timestamps remains available. | For offline or locked-down networks: self-host model files under `public/models/` and set `NEXT_PUBLIC_WHISPER_LOCAL_MODELS=true` (and self-host the ONNX runtime WASM). Evaluate accuracy on real Hindi and English station audio before relying on it. |
| **Email / SMS notifications** | In-app only. Adapters are integration points (`EMAIL_PROVIDER`, `SMS_PROVIDER`), and nothing is reported as sent. | A provider account and credentials, an approved sender ID or templates, and confirmation that no sensitive content is sent |
| **Malware scanning** | Not configured. Uploads are type-allowlisted and magic-byte checked, and `scan_status` stays `not_scanned`. | A scanning service (for example ClamAV or a cloud scanner) wired into the upload route |
| **Object storage** | Local encrypted filesystem adapter | An S3-compatible bucket with server-side encryption, credentials, and an adapter implementation |
| **Hosting, TLS and backups** | Not provided | Servers or hosting, TLS certificates, a reverse proxy, backup storage, monitoring |
| **Legal review** | Not done | Review of the FIR draft template (it ships as a generic, jurisdiction-neutral template), the consent notice, retention periods, access policy, and data-sharing rules |
| **Translation review** | The Hindi consent notice and interface strings were written for this project | Review by a qualified translator. Add more languages as required. |
| **Security assessment** | Not done | An independent security review or penetration test before handling real records |
