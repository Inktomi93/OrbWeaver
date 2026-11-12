import type { ReadOnlyDb } from "@orb/db";
import { notifications, users } from "@orb/db";
import { sql } from "drizzle-orm";
import { expectTypeOf, test } from "vitest";
import type * as probes from "#server/foundation/observability/debug/inspect/index.ts";

type Probes = typeof probes;
type ProbeDb = { [Name in keyof Probes]: Parameters<Probes[Name]>[0] };

test("every probe the inspect door exports takes the read-only database", () => {
  expectTypeOf<ProbeDb>().toEqualTypeOf<{ [Name in keyof Probes]: ReadOnlyDb }>();
});

test("the read-only database a probe holds cannot write to any table or run raw SQL", () => {
  const probeBody = (db: ReadOnlyDb): void => {
    // @ts-expect-error the read-only database has no insert
    void db.insert(users);
    // @ts-expect-error the read-only database has no update
    void db.update(notifications);
    // @ts-expect-error the read-only database has no delete
    void db.delete(notifications);
    // @ts-expect-error the read-only database has no raw run
    void db.run(sql`DELETE FROM users`);
    // @ts-expect-error the read-only database has no raw all
    void db.all(sql`PRAGMA integrity_check`);
    // @ts-expect-error the read-only database has no transaction
    void db.transaction(async () => await Promise.resolve());
  };
  expectTypeOf(probeBody).parameter(0).toEqualTypeOf<ReadOnlyDb>();
  expectTypeOf<ReadOnlyDb>().toHaveProperty("select");
  expectTypeOf<ReadOnlyDb>().toHaveProperty("query");
});
