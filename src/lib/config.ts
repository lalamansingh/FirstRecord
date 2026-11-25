/**
 * Environment configuration. Server-only. Secrets are never sent to the client;
 * use `publicConfigStatus()` to describe configuration state in the UI.
 */
import "server-only";

function bool(v: string | undefined, fallback = false) {
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const config = {
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get demoMode() {
    return bool(process.env.DEMO_MODE, false);
  },
  get sessionSecret() {
    const s = process.env.SESSION_SECRET;
    if (!s || s.startsWith("replace-with")) {
      if (process.env.NODE_ENV === "production" && !bool(process.env.DEMO_MODE)) {
        throw new Error("SESSION_SECRET must be set in production");
      }
      return "firstrecord-insecure-development-secret";
    }
    return s;
  },
  get storageDir() {
    return process.env.STORAGE_DIR || "./data/storage";
  },
  get storageKey(): Buffer | null {
    const k = process.env.STORAGE_ENCRYPTION_KEY;
    if (!k || k.startsWith("replace-with")) return null;
    const buf = Buffer.from(k, "base64");
    return buf.length === 32 ? buf : null;
  },
  get appOrigin() {
    return process.env.APP_ORIGIN || "";
  },
  get aiProvider(): "demo" | "anthropic" {
    return process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "demo";
  },
  get aiExternalAuthorized() {
    return bool(process.env.AI_EXTERNAL_PROCESSING_AUTHORIZED, false);
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY || "";
  },
  get aiModel() {
    return process.env.AI_MODEL || "claude-sonnet-5-5";
  },
  get maxUploadBytes() {
    return Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;
  },
  get maxRecordingBytes() {
    return Number(process.env.MAX_RECORDING_MB || 200) * 1024 * 1024;
  },
  get emailProvider() {
    return process.env.EMAIL_PROVIDER || "none";
  },
  get smsProvider() {
    return process.env.SMS_PROVIDER || "none";
  },
};

/** Non-secret description of configuration for admin screens. */
export function publicConfigStatus() {
  const live =
    config.aiProvider === "anthropic" && !!config.anthropicApiKey && config.aiExternalAuthorized;
  return {
    environment: config.isProduction ? "production" : "development",
    demoMode: config.demoMode,
    sessionSecretConfigured: !!process.env.SESSION_SECRET && !process.env.SESSION_SECRET.startsWith("replace-with"),
    storageEncryption: config.storageKey ? "AES-256-GCM (configured)" : "NOT CONFIGURED — files stored unencrypted",
    storageAdapter: "local-filesystem",
    ai: {
      requestedProvider: config.aiProvider,
      effectiveMode: live ? "live" : "demo",
      model: live ? config.aiModel : "rule-based-v1",
      apiKeyConfigured: !!config.anthropicApiKey,
      externalProcessingAuthorized: config.aiExternalAuthorized,
    },
    email: config.emailProvider,
    sms: config.smsProvider,
    malwareScanning: "not configured",
    officialFilingIntegration: "not configured",
    identityProvider: "local accounts (OIDC/SSO integration point not configured)",
  };
}
