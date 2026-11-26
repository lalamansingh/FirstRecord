/**
 * First-boot seeding for ephemeral hosts (e.g. Vercel, where the SQLite file
 * lives in /tmp and starts empty on every cold start).
 *
 * Runs only when AUTO_SEED=1. It seeds the fictional demo data (when
 * DEMO_MODE=true), the legal catalogue, and an evaluation account from
 * JUDGE_EMAIL / JUDGE_PASSWORD. Never enable this where data must persist.
 */
import type { DatabaseSync } from "node:sqlite";
import { seedBase, isSeeded } from "@/lib/seed/base";
import { seedDemoContent } from "@/lib/seed/demo-content";
import { seedLegalCatalog } from "@/lib/seed/legal";
import { seedOnlineComplaints } from "@/lib/seed/online";
import { seedUpdates } from "@/lib/seed/updates";
import { hashPassword, passwordPolicyError } from "@/lib/auth/password";

const truthy = (v: string | undefined) => ["1", "true", "yes", "on"].includes((v || "").toLowerCase());

export function autoSeed(db: DatabaseSync, helpers: { tx: <T>(fn: () => T) => T; now: () => string; newId: () => string }) {
  if (!truthy(process.env.AUTO_SEED)) return;
  if (isSeeded()) return;
  const demo = truthy(process.env.DEMO_MODE);
  helpers.tx(() => {
    const base = seedBase({ demoUsers: demo });
    if (demo) {
      seedDemoContent(base);
      seedOnlineComplaints();
      seedUpdates();
    }
  });
  seedLegalCatalog();

  const email = process.env.JUDGE_EMAIL;
  const password = process.env.JUDGE_PASSWORD;
  if (email && password && !passwordPolicyError(password)) {
    const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
    if (!exists) {
      const role = db.prepare("SELECT id FROM roles WHERE key = ?").get(process.env.JUDGE_ROLE || "station_admin") as { id: string } | undefined;
      const station = db.prepare("SELECT id FROM stations WHERE code = ?").get(process.env.JUDGE_STATION || "CNT") as { id: string } | undefined;
      if (role) {
        const t = helpers.now();
        db.prepare(
          "INSERT INTO users (id, email, name, password_hash, role_id, station_id, status, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)",
        ).run(helpers.newId(), email, process.env.JUDGE_NAME || "Hackathon Judges", hashPassword(password), role.id, station?.id ?? null, t, t);
      }
    }
  }
}
