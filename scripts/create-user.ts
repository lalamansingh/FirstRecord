/**
 * Create a user from the command line (e.g. the first Station Administrator).
 *   npm run user:create -- --email a@b.c --name "Full Name" --role station_admin --station CODE
 * The password is read from the FR_NEW_PASSWORD environment variable.
 * Add --no-force-change for a shared evaluation account (e.g. hackathon judges) that should not be forced to change the password.
 */
import "./env";
import { getDb, closeDb, get, insert, newId, now } from "../src/lib/db";
import { hashPassword, passwordPolicyError } from "../src/lib/auth/password";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
getDb();
if (get<{ id: string }>("SELECT id FROM users WHERE email = ?", arg("email") ?? "")) { console.error("A user with this email already exists."); process.exit(1); }
const email = arg("email"), name = arg("name"), roleKey = arg("role") || "station_admin", stationCode = arg("station");
const password = process.env.FR_NEW_PASSWORD || "";
if (!email || !name) { console.error("--email and --name are required"); process.exit(1); }
const pwErr = passwordPolicyError(password);
if (pwErr) { console.error(`FR_NEW_PASSWORD: ${pwErr}`); process.exit(1); }
const role = get<{ id: string }>("SELECT id FROM roles WHERE key = ?", roleKey);
if (!role) { console.error(`Unknown role ${roleKey}. Run db:seed first.`); process.exit(1); }
const station = stationCode ? get<{ id: string }>("SELECT id FROM stations WHERE code = ?", stationCode) : undefined;
if (stationCode && !station) { console.error(`Unknown station ${stationCode}`); process.exit(1); }
const t = now();
const id = newId();
insert("users", { id, email, name, password_hash: hashPassword(password), role_id: role.id, station_id: station?.id ?? null, status: "active", must_change_password: process.argv.includes("--no-force-change") ? 0 : 1, created_at: t, updated_at: t });
insert("audit_events", { id: newId(), actor_id: null, action: "user.created_cli", entity_type: "user", entity_id: id, summary: `User created via CLI with role ${roleKey}`, metadata: "{}", created_at: t });
console.log(`Created ${email} (${roleKey}).`);
closeDb();
