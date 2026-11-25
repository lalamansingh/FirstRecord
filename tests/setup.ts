/** Per-test-file isolated environment: own SQLite file, storage dir and secrets. */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "firstrecord-test-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
process.env.STORAGE_DIR = path.join(dir, "storage");
process.env.DEMO_MODE = "true";
process.env.SESSION_SECRET = "test-session-secret-" + randomBytes(8).toString("hex");
process.env.STORAGE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.AI_PROVIDER = "demo";
process.env.AI_EXTERNAL_PROCESSING_AUTHORIZED = "false";
