import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LibSqlWrap } from "@orb/db";
import { closeDb, createDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { sql } from "drizzle-orm";
import { vi } from "vitest";

for (const storage of ["memory", "file"]) {
  for (const failureAt of ["wrap", "execute"]) {
    test(`failed ${failureAt} closes its acquired ${storage} client and preserves the failure`, async ({ importStagingDir }) => {
      const url = storage === "memory" ? ":memory:" : pathToFileURL(join(importStagingDir, "source.db")).href;
      const failure = new Error("initialization refused");
      let acquired: Parameters<LibSqlWrap>[0] | undefined;
      let closes = 0;
      try {
        await expect(
          createDb(url, (base) => {
            acquired = base;
            const close = base.close.bind(base);
            vi.spyOn(base, "close").mockImplementation(() => {
              closes += 1;
              close();
            });
            if (failureAt === "wrap") {
              throw failure;
            }
            vi.spyOn(base, "execute").mockRejectedValueOnce(failure);
            return base;
          }),
        ).rejects.toBe(failure);
        expect(closes).toBe(1);
        expect(acquired?.closed).toBe(true);
        if (acquired === undefined) {
          throw new Error("client acquisition was not reached");
        }
        await expect(acquired.execute("SELECT 1")).rejects.toMatchObject({ code: "CLIENT_CLOSED" });
      } finally {
        acquired?.close();
      }
    });
  }
}

test("successful initialization transfers ownership to the returned handle", async () => {
  let acquired: Parameters<LibSqlWrap>[0] | undefined;
  let closes = 0;
  const db = await createDb(":memory:", (base) => {
    acquired = base;
    const close = base.close.bind(base);
    vi.spyOn(base, "close").mockImplementation(() => {
      closes += 1;
      close();
    });
    return base;
  });
  try {
    expect(closes).toBe(0);
    expect(acquired?.closed).toBe(false);
    await db.run(sql`PRAGMA user_version=37`);
    expect(await db.get(sql`PRAGMA user_version`)).toEqual({ ["user_version"]: 37 });
  } finally {
    closeDb(db);
  }
  expect(closes).toBe(1);
  expect(acquired?.closed).toBe(true);
});

test("failed construction does not close an independently borrowed handle", async () => {
  const borrowed = await createDb(":memory:");
  const failure = new Error("separate construction refused");
  let acquired: Parameters<LibSqlWrap>[0] | undefined;
  try {
    await borrowed.run(sql`PRAGMA user_version=83`);
    await expect(
      createDb(":memory:", (base) => {
        acquired = base;
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await borrowed.get(sql`PRAGMA user_version`)).toEqual({ ["user_version"]: 83 });
    expect(acquired?.closed).toBe(true);
  } finally {
    acquired?.close();
    closeDb(borrowed);
  }
});
