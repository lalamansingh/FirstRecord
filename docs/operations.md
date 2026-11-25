# Operations: backup, recovery, migrations, retention

## What holds state

| Item | Location | Notes |
|---|---|---|
| Database | `DATABASE_PATH` (default `./data/firstrecord.db`, plus `-wal` and `-shm` files) | SQLite in WAL mode |
| Recordings and attachments | `STORAGE_DIR` (default `./data/storage`) | Encrypted with `STORAGE_ENCRYPTION_KEY` |
| Secrets | `.env.local` or your secret manager | `SESSION_SECRET`, `STORAGE_ENCRYPTION_KEY`, provider keys |

All three are needed for a complete restore. **Without `STORAGE_ENCRYPTION_KEY`, the stored files cannot be decrypted.** Keep the key in escrow, separately from the backups.

## Backups

Use SQLite's online backup. Copying the `.db` file while the app runs can produce an inconsistent copy, because of WAL.

```bash
# Consistent online snapshot of the database
sqlite3 data/firstrecord.db ".backup '/backups/firstrecord-$(date +%F).db'"
sqlite3 /backups/firstrecord-$(date +%F).db "PRAGMA integrity_check;"   # expect: ok

# Storage directory (files are already encrypted, but encrypt the archive too)
tar -czf - data/storage | gpg --encrypt -r backup@example.org > /backups/storage-$(date +%F).tgz.gpg
```

Recommendations:

- Back up daily at least, and keep copies off the host.
- Encrypt the database backup (`gpg` or similar). The database itself is not encrypted, and it contains statement text and contact details.
- Keep backups according to the approved retention schedule. A deletion in the live system does not reach older backups, so document how backups expire.
- **Test a restore** at least every quarter.

## Restore

1. Stop the application.
2. Restore the database file to `DATABASE_PATH`, and delete any stale `-wal` and `-shm` files next to it.
3. Restore `STORAGE_DIR`.
4. Make sure `STORAGE_ENCRYPTION_KEY` and `SESSION_SECRET` match the ones the backup was made with. A different `SESSION_SECRET` only signs everyone out. A different storage key makes the files unreadable.
5. Start the application. Pending migrations apply automatically.
6. Spot-check that a recording plays and an attachment downloads.

## Migrations

- Migrations live in `src/lib/db/migrations.ts`. Each one runs once, inside a transaction, and is recorded in `schema_migrations`.
- They run automatically when the app first opens the database. You can also run them explicitly with `npm run db:migrate`.
- **Never edit a released migration.** Add a new one with the next ID.
- Take a backup before deploying a release that contains migrations.

## Scheduled jobs

```cron
# Daily at 02:30: apply retention policies and send task reminders
30 2 * * *  cd /srv/firstrecord && npm run retention:run >> /var/log/firstrecord-retention.log 2>&1
```

`retention:run` deletes records whose policy is `delete`. By default that means notifications and expired sessions, plus recordings or attachments only if an administrator has set their policy to `delete`. Each automatic purge is audited. It prints counts of the items flagged for authorized review, and does not delete those. Closed cases are never deleted automatically. Due-soon and overdue task reminders are also generated whenever pages load.

## Running in production

```bash
npm ci
npm run build
NODE_ENV=production npm start   # listens on :3000; put a TLS reverse proxy in front
```

- Run it as an unprivileged service (systemd or a container) with a restart policy.
- Run **one** application process per database. SQLite with WAL handles concurrent reads well and serializes writes. The in-memory rate limiter is per process.
- A health check is available by fetching `/login` (expect 200).

## Scaling and moving to a managed database

SQLite suits a single station or a small group on one server. For many stations, high availability, or centralized hosting:

- Move to a managed relational database such as PostgreSQL. The schema is plain SQL that ports almost directly: `TEXT` timestamps become `timestamptz`, the JSON text columns become `jsonb`, and the triggers are rewritten in PL/pgSQL.
- Replace `src/lib/db/index.ts` with a driver for the new database. Domain code uses only `all`, `get`, `run`, `insert`, `update` and `tx`. These are synchronous today and would have to become async.
- Move files to object storage by implementing `StorageAdapter`.
- Put sessions and rate limiting in a shared store (for example Redis) when running several app instances.
