/**
 * DEVELOPMENT ONLY: print a session cookie for a user so pages can be fetched with curl.
 *   npx tsx --conditions=react-server scripts/dev-session.ts officer.rao@central.example
 *   curl -H "Cookie: fr_session=<token>" http://localhost:3100/cases
 */
import "./env";
import { createHash, randomBytes } from "node:crypto";
import { getDb, get, insert, now, closeDb } from "../src/lib/db";

if (process.env.NODE_ENV === "production") { console.error("Refusing in production"); process.exit(1); }
getDb();
const email = process.argv[2];
const u = get<{ id: string }>("SELECT id FROM users WHERE email = ?", email);
if (!u) { console.error("No such user"); process.exit(1); }
const secret = process.env.SESSION_SECRET && !process.env.SESSION_SECRET.startsWith("replace-with") ? process.env.SESSION_SECRET : "firstrecord-insecure-development-secret";
const token = randomBytes(32).toString("base64url");
const t = now();
insert("sessions", { id: createHash("sha256").update(token + secret).digest("hex"), user_id: u.id, created_at: t, last_seen_at: t, expires_at: new Date(Date.now() + 12 * 3600e3).toISOString(), auth_method: "demo" });
console.log(token);
closeDb();
