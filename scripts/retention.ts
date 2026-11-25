/**
 * Scheduled maintenance (run daily via cron or a scheduler):
 *   npm run retention:run
 * - Applies retention policies whose action is "delete".
 * - Generates task due/overdue reminders.
 * - Prints counts of items flagged for human retention review.
 */
import "./env";
import { getDb, closeDb } from "../src/lib/db";
import { runAutomaticRetention, flaggedCounts } from "../src/lib/domain/retention";
import { generateTaskReminders } from "../src/lib/domain/notifications";

async function main() {
  getDb();
  const purged = await runAutomaticRetention(null);
  console.log("Automatic retention deletions:", Object.keys(purged).length ? purged : "none configured");
  generateTaskReminders();
  console.log("Task reminders generated.");
  const flagged = flaggedCounts();
  console.log("Items flagged for retention review (require an authorized user):", flagged);
  closeDb();
}

main().catch((e) => {
  console.error("Retention run failed:", (e as Error).message);
  closeDb();
  process.exit(1);
});
