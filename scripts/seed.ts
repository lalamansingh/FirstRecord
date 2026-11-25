/**
 * Seed the database.
 *   npm run db:seed          — seed if empty (demo users only when DEMO_MODE=true)
 *   npm run db:reset         — WIPE ALL DATA and reseed (refused unless DEMO_MODE=true)
 */
import "./env";
import { getDb, closeDb, tx } from "../src/lib/db";
import { seedBase, wipeAll, isSeeded, DEMO_PASSWORD } from "../src/lib/seed/base";
import { seedDemoContent } from "../src/lib/seed/demo-content";
import { seedLegalCatalog } from "../src/lib/seed/legal";
import { seedOnlineComplaints } from "../src/lib/seed/online";
import { seedUpdates } from "../src/lib/seed/updates";

const reset = process.argv.includes("--reset");
const demo = ["1", "true", "yes", "on"].includes((process.env.DEMO_MODE || "").toLowerCase());
getDb();

if (reset) {
  if (!demo) {
    console.error("Refusing to reset: DEMO_MODE is not enabled. Reset destroys all data.");
    process.exit(1);
  }
  wipeAll();
  console.log("All data wiped.");
}

if (isSeeded()) {
  console.log("Database already seeded. Use `npm run db:reset` (demo mode only) to start over.");
} else {
  tx(() => {
    const base = seedBase({ demoUsers: demo });
    if (demo) {
      const r = seedDemoContent(base);
      console.log(`Seeded fictional demo content: ${r.cases} cases, ${r.tasks} tasks.`);
      seedOnlineComplaints();
      seedUpdates();
      console.log(`Sample accounts password (store it safely; not shown in the app): ${DEMO_PASSWORD}`);
    } else {
      console.log("Seeded reference data (roles, workflows, templates). Create the first admin with `npm run user:create`.");
    }
  });
}
// Reference catalog of legal provisions (idempotent; keeps admin edits).
seedLegalCatalog();
closeDb();
