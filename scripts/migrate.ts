import "./env";
import { getDb, runMigrations, closeDb } from "../src/lib/db";

const ran = runMigrations(getDb());
console.log(ran.length ? `Applied migrations: ${ran.join(", ")}` : "Database is up to date.");
closeDb();
