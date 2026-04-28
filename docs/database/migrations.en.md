# Database Migrations

> **[Русская версия](migrations.md)**

## Overview

The database schema lives in **one place**: `lib/database/schema.ts` (Drizzle ORM). Postgres is the only supported dialect. We use `drizzle-kit` to diff the TS schema against the previous snapshot and emit raw SQL into `database/drizzle/`. Migrations are checked into git and applied to the running database with a small Node runner.

There is **no parallel `database/schema.sql`** anymore — every change goes through `drizzle-kit generate` so the SQL we ship matches the TS we type-check.

## Layout

```
database/drizzle/
├── 0000_initial.sql                   # auto-generated DDL (CREATE TABLE, indexes, FKs)
├── 0001_legacy_postgres_objects.sql   # hand-written DDL drizzle-kit cannot emit
├── 0002_*.sql                         # future diffs against schema.ts
└── meta/
    ├── _journal.json                  # ordered list of migrations + tags
    ├── 0000_snapshot.json             # full schema state after migration N
    └── 0001_snapshot.json
```

**All of `database/drizzle/` is committed to git** — including `meta/`. The snapshots are not a build artifact: they are what `drizzle-kit generate` diffs against to compute the next migration. If you delete or `.gitignore` them, the next run on another machine will produce a "create everything from scratch" migration that destroys an already-migrated DB.

## Daily flow

1. Edit `lib/database/schema.ts` (add table, change column, etc.).
2. Run `pnpm run db:generate` (optionally `--name=add_foo_to_bar`).
3. Drizzle Kit produces a new `<NNNN>_*.sql` plus a matching `<NNNN>_snapshot.json` under `meta/`.
4. **Read the generated SQL** before committing. drizzle-kit can occasionally produce destructive statements (column drops, type changes that imply data loss). If something looks wrong, edit the SQL by hand or split into multiple safer migrations — this is officially supported.
5. Commit `lib/database/schema.ts`, the new `<NNNN>_*.sql`, and the new `meta/<NNNN>_snapshot.json` together as one PR.
6. CI (or you locally) runs `pnpm run db:migrate` against the database to apply the new migration.

## Custom migrations

Some Postgres objects can't be expressed in `schema.ts`:

- extensions (`uuid-ossp`)
- `CHECK` constraints with non-trivial predicates
- triggers and `plpgsql` functions
- `pg_trgm` indexes, partial indexes with complex predicates, etc.

For those use a **custom (empty) migration**:

```bash
pnpm exec drizzle-kit generate --custom --name=enable_pg_trgm
```

This creates an empty `<NNNN>_<name>.sql` you can fill with raw SQL. drizzle-kit records it in `_journal.json` and runs it in order alongside auto-generated migrations. Subsequent `drizzle-kit generate` runs **do not touch** custom files.

`0001_legacy_postgres_objects.sql` is exactly such a migration: it carries the `update_updated_at_column` trigger function, per-table `BEFORE UPDATE` triggers, the `support_tickets.last_message_at` bump trigger, the `check_comment_limit` trigger, the `get_last_messages_for_tickets` / `create_ticket_with_message` RPC functions, and CHECK constraints (`status`, `priority`, `role`, `sender_type`, etc.).

## What stays in schema.ts

| Construct                | Source of truth |
|--------------------------|-----------------|
| Tables, columns, defaults| `schema.ts`     |
| Primary keys, foreign keys| `schema.ts`    |
| Indexes (basic + unique) | `schema.ts`     |
| Drizzle `relations()`    | `schema.ts`     |
| Inferred TS types        | `schema.ts`     |
| Extensions (`uuid-ossp`) | `0001_legacy_postgres_objects.sql` |
| CHECK constraints        | `0001_legacy_postgres_objects.sql` |
| Triggers / functions     | `0001_legacy_postgres_objects.sql` (or a future custom migration) |

Rule of thumb: if drizzle-kit can emit it, put it in `schema.ts`. Otherwise put it in a custom migration and re-run `--custom` for each new piece — never edit auto-generated migrations.

## Scripts

| Script            | What it does |
|-------------------|--------------|
| `pnpm run db:generate` | `drizzle-kit generate` — diff `schema.ts` vs latest snapshot, emit `<NNNN>_*.sql` + new snapshot. Does **not** touch the DB. |
| `pnpm run db:migrate`  | `node scripts/db-migrate.mjs` — connects to `DATABASE_URL`, runs every migration in `_journal.json` order that isn't yet recorded in `__drizzle_migrations`. Idempotent. |
| `pnpm run db:studio`   | `drizzle-kit studio` — local web UI to inspect tables. |

`drizzle-kit push` is **intentionally not exposed** — it bypasses the migration history and snapshot and is only safe for prototyping.

## Applying migrations

`scripts/db-migrate.mjs`:

```js
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: './database/drizzle' });
await client.end();
```

Drizzle creates a `__drizzle_migrations` table on first run and records each applied migration's hash there. Re-running the script is a no-op when nothing is pending.

### Bootstrapping an existing database

If the DB already contains the schema (legacy `database/schema.sql` was applied by hand) and you want to start tracking migrations from `0000_initial`, mark it as applied **without** running its DDL:

```sql
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- Read meta/_journal.json for the actual hash + tag of 0000_initial,
-- then insert the row manually:
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (
  '<hash from _journal.json>',
  EXTRACT(EPOCH FROM NOW())::bigint * 1000
);
```

After that, `pnpm run db:migrate` will only run new migrations (`0001_*` onward).

## Why we don't use `drizzle-kit push`

`drizzle-kit push` syncs `schema.ts` directly to the DB without producing an SQL file. It is convenient for early prototyping but:

- there is no audit log of what changed and when
- there is no way to review the SQL before it runs in production
- there is no migration history in git, so two devs can't merge schema branches
- it has its own divergence between what's typed and what's deployed

For any environment that isn't a throwaway local DB we use `db:generate` + `db:migrate`.

## When schema.ts and the DB diverge

If a column exists in the DB but not in `schema.ts`, drizzle-kit will **drop it** the next time you generate. To recover, either:

- Add the column back to `schema.ts` so the diff is empty, or
- Discard the generated migration and run `drizzle-kit introspect` to regenerate `schema.ts` from the live DB.

Always read the diff `pnpm run db:generate` produces before committing.
