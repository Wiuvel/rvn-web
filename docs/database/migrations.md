# Миграции базы данных

> **[English version](migrations.en.md)**

## Обзор

Схема БД живёт в **одном месте**: `lib/database/schema.ts` (Drizzle ORM). Поддерживается только Postgres. Через `drizzle-kit` мы считаем diff между TS-схемой и предыдущим snapshot и получаем сырые SQL-файлы в `database/drizzle/`. Миграции коммитятся в git и накатываются на БД небольшим Node-скриптом.

Параллельного `database/schema.sql` больше **нет** — любое изменение проходит через `drizzle-kit generate`, чтобы SQL, который мы деплоим, совпадал с TS, который мы тайпчекаем.

## Структура

```
database/drizzle/
├── 0000_initial.sql                   # авто-сгенерированный DDL (CREATE TABLE, индексы, FK)
├── 0001_legacy_postgres_objects.sql   # ручной DDL, который drizzle-kit не умеет
├── 0002_*.sql                         # будущие diffs от schema.ts
└── meta/
    ├── _journal.json                  # упорядоченный список миграций + теги
    ├── 0000_snapshot.json             # полное состояние схемы после миграции N
    └── 0001_snapshot.json
```

**Вся папка `database/drizzle/` коммитится в git** — включая `meta/`. Snapshots — это **не** артефакт сборки: именно по ним `drizzle-kit generate` считает diff для следующей миграции. Если их удалить или загнать в `.gitignore`, то на другой машине drizzle сгенерирует миграцию «создать всё с нуля», которая разломает уже мигрированную БД.

## Ежедневный flow

1. Меняешь `lib/database/schema.ts` (добавил таблицу, поменял колонку и т.д.).
2. Запускаешь `pnpm run db:generate` (опционально `--name=add_foo_to_bar`).
3. Drizzle Kit создаст новый `<NNNN>_*.sql` и соответствующий `<NNNN>_snapshot.json` в `meta/`.
4. **Прочитай SQL** перед коммитом. drizzle-kit может выдать деструктивные операторы (drop колонки, смена типа с потерей данных). Если что-то выглядит подозрительно — правь SQL руками или разделяй на несколько безопасных миграций. Это официально поддерживается.
5. Коммитишь `lib/database/schema.ts`, новый `<NNNN>_*.sql` и новый `meta/<NNNN>_snapshot.json` одним PR.
6. CI (или ты локально) накатывает миграцию на БД через `pnpm run db:migrate`.

## Кастомные миграции

Часть Postgres-объектов нельзя описать в `schema.ts`:

- расширения (`uuid-ossp`)
- `CHECK`-констрейнты с нетривиальным предикатом
- триггеры и `plpgsql`-функции
- `pg_trgm`-индексы, partial indexes со сложным предикатом и т.д.

Под такие случаи используется **пустая (custom) миграция**:

```bash
pnpm exec drizzle-kit generate --custom --name=enable_pg_trgm
```

Создастся пустой `<NNNN>_<name>.sql`, в который пишешь сырой SQL. drizzle-kit запишет его в `_journal.json` и применит в нужном порядке вместе с авто-миграциями. Последующие `drizzle-kit generate` **не трогают** custom-файлы.

`0001_legacy_postgres_objects.sql` — это ровно такая миграция: в ней лежит триггер-функция `update_updated_at_column`, per-table `BEFORE UPDATE`-триггеры, триггер на `support_tickets.last_message_at`, триггер `check_comment_limit`, RPC-функции `get_last_messages_for_tickets` / `create_ticket_with_message` и CHECK-констрейнты (`status`, `priority`, `role`, `sender_type` и т.д.).

## Что остаётся в schema.ts

| Конструкция              | Источник правды |
|--------------------------|-----------------|
| Таблицы, колонки, defaults| `schema.ts`     |
| Primary keys, foreign keys| `schema.ts`    |
| Индексы (basic + unique) | `schema.ts`     |
| Drizzle `relations()`    | `schema.ts`     |
| TS-типы (inferred)       | `schema.ts`     |
| Extensions (`uuid-ossp`) | `0001_legacy_postgres_objects.sql` |
| CHECK-констрейнты        | `0001_legacy_postgres_objects.sql` |
| Триггеры / функции       | `0001_legacy_postgres_objects.sql` (или будущая custom-миграция) |

Правило: если drizzle-kit может выдать это сам — пиши в `schema.ts`. Если нет — `--custom`-миграция, отдельная под каждое изменение. Никогда не правь авто-миграции руками.

## Скрипты

| Скрипт                 | Что делает |
|------------------------|------------|
| `pnpm run db:generate` | `drizzle-kit generate` — diff `schema.ts` vs последний snapshot, выдаёт `<NNNN>_*.sql` + новый snapshot. БД **не** трогает. |
| `pnpm run db:migrate`  | `node scripts/db-migrate.mjs` — коннектится к `DATABASE_URL`, прогоняет все миграции из `_journal.json`, которых ещё нет в `__drizzle_migrations`. Идемпотентен. |
| `pnpm run db:studio`   | `drizzle-kit studio` — локальный веб-интерфейс для просмотра таблиц. |

`drizzle-kit push` **сознательно не подключён** — он обходит историю миграций и snapshot, и безопасен только для прототипа.

## Применение миграций

`scripts/db-migrate.mjs`:

```js
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: './database/drizzle' });
await client.end();
```

При первом запуске drizzle создаёт служебную таблицу `__drizzle_migrations` и записывает туда хеш каждой применённой миграции. Повторный запуск — no-op, если ничего нового нет.

### Bootstrap существующей БД

Если в БД уже накатана схема (раньше применяли `database/schema.sql` руками), и нужно начать вести миграции с `0000_initial`, помечаешь её применённой **без** прогона DDL:

```sql
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- Берёшь hash + tag из meta/_journal.json для 0000_initial
-- и вставляешь руками:
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (
  '<hash из _journal.json>',
  EXTRACT(EPOCH FROM NOW())::bigint * 1000
);
```

После этого `pnpm run db:migrate` накатит только новые миграции (`0001_*` и далее).

## Почему не используем `drizzle-kit push`

`drizzle-kit push` синкает `schema.ts` напрямую в БД без SQL-файлов. Удобно для прототипа, но:

- нет аудит-лога что и когда изменилось
- нельзя посмотреть SQL до применения в продакшене
- нет истории миграций в git, поэтому два разработчика не смогут смержить ветки со схемой
- расходится с тем, что протипизировано и что задеплоено

Везде, кроме одноразовой локальной БД, используем `db:generate` + `db:migrate`.

## Когда schema.ts и БД разошлись

Если колонка есть в БД, но нет в `schema.ts`, drizzle-kit её **дропнет** при следующем generate. Чтобы это починить:

- Верни колонку в `schema.ts`, чтобы diff стал пустым.
- Или выкини сгенерированную миграцию и запусти `drizzle-kit introspect` — он перегенерит `schema.ts` из живой БД.

Всегда читай diff, который выдаёт `pnpm run db:generate`, перед коммитом.
