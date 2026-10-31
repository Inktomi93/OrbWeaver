// Controlled external execution at the storage edge: a real SQLite trigger refuses a write class, or a table is
// withheld, until lifted. It injects a fault, never seeded state; tests outside the persistence tier never run DDL.

import { createHash } from "node:crypto";
import type { Db } from "@orb/db";
import { getTableName, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

/** The trigger timing events; `columns` narrows an UPDATE to `UPDATE OF <columns>`. */
const REFUSED_WRITES = ["INSERT", "UPDATE", "DELETE"] as const;

interface WriteRefusalSpec {
  readonly table: SQLiteTable;
  readonly event: (typeof REFUSED_WRITES)[number];
  /** The ABORT message the refused statement rejects with. It also names the trigger, so it is unique per refusal. */
  readonly message: string;
  readonly columns?: readonly SQLiteColumn[];
  /** A literal trigger `WHEN` condition over `NEW`/`OLD`; DDL cannot bind parameters. */
  readonly when?: string;
}

interface TriggerSpec {
  readonly table: SQLiteTable;
  readonly event: (typeof REFUSED_WRITES)[number];
  readonly timing: "BEFORE" | "AFTER";
  /** The trigger's name; unique per planted fault. */
  readonly name: string;
  /** The trigger's statements, each ending in `;`. DDL cannot bind parameters, so they are literal SQL. */
  readonly body: string;
  readonly columns?: readonly SQLiteColumn[];
  /** A literal trigger `WHEN` condition over `NEW`/`OLD`. */
  readonly when?: string;
}

/** An armed fault. `lift` restores the database mid-test; disposal lifts it if the test did not. */
export interface DbFault extends AsyncDisposable {
  readonly lift: () => Promise<void>;
}

const TRIGGER_KEY_LENGTH = 16;

// The trigger name is a pure function of the refusal, so two armed refusals never share a name.
function messageKey(message: string): string {
  return createHash("sha256").update(message).digest("hex").slice(0, TRIGGER_KEY_LENGTH);
}

function liftOnce(lift: () => Promise<unknown>): DbFault {
  let lifted: Promise<void> | undefined;
  const once = (): Promise<void> => {
    lifted ??= lift().then(() => undefined);
    return lifted;
  };
  return { lift: once, [Symbol.asyncDispose]: once };
}

/** Plant a trigger that runs `body` around every matching write, until lifted. It injects a fault, never seeded state:
 *  a write refusal is `refuseWrites`; a trigger that corrupts a neighbouring table after a write is planted here. */
export async function plantTrigger(db: Db, spec: TriggerSpec): Promise<DbFault> {
  const table = getTableName(spec.table);
  const trigger = sql.identifier(spec.name);
  const of =
    spec.columns === undefined || spec.columns.length === 0
      ? sql``
      : sql` OF ${sql.join(
          spec.columns.map((column) => sql.identifier(column.name)),
          sql`, `,
        )}`;
  const when = spec.when === undefined ? sql`` : sql` WHEN ${sql.raw(spec.when)}`;
  await db.run(
    sql`CREATE TRIGGER ${trigger} ${sql.raw(spec.timing)} ${sql.raw(spec.event)}${of} ON ${sql.identifier(table)}${when} BEGIN ${sql.raw(spec.body)} END`,
  );
  return liftOnce(() => db.run(sql`DROP TRIGGER IF EXISTS ${trigger}`));
}

/** Arm a `BEFORE <event>` trigger that aborts every matching statement with `message`. */
export function refuseWrites(db: Db, spec: WriteRefusalSpec): Promise<DbFault> {
  return plantTrigger(db, {
    table: spec.table,
    event: spec.event,
    timing: "BEFORE",
    name: `refuse_${getTableName(spec.table)}_${spec.event.toLowerCase()}_${messageKey(spec.message)}`,
    body: `SELECT RAISE(ABORT, '${spec.message.replaceAll("'", "''")}');`,
    ...(spec.columns === undefined ? {} : { columns: spec.columns }),
    ...(spec.when === undefined ? {} : { when: spec.when }),
  });
}

/** Rename `table` away so every statement on it fails with `no such table`, until lifted. */
export async function withheldTable(db: Db, table: SQLiteTable): Promise<DbFault> {
  const name = getTableName(table);
  const withheld = `withheld_${name}`;
  await db.run(sql`ALTER TABLE ${sql.identifier(name)} RENAME TO ${sql.identifier(withheld)}`);
  return liftOnce(() => db.run(sql`ALTER TABLE ${sql.identifier(withheld)} RENAME TO ${sql.identifier(name)}`));
}
