import "../../../support/composed-real.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { Db } from "@orb/db";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { sql } from "drizzle-orm";
import { freshCountedDb } from "../../../support/db.ts";
import { principal } from "../../../support/factories/principal.ts";
import { test as base, expect, OWNER_USER_ID } from "../../../support/fixtures.ts";

const test = base.extend<{ db: Db; observed: Awaited<ReturnType<typeof freshCountedDb>> }>({
  observed: async ({}, use) => await use(await freshCountedDb()),
  db: async ({ observed }, use) => await use(observed.db),
});

test("completed real profile import refreshes planner stats before its terminal library fan", async ({
  app,
  db,
  clock,
  ownerCaller,
  importStagingDir,
  observed,
}) => {
  void ownerCaller;
  await app.services.character.create({
    principal: principal(OWNER_USER_ID),
    input: { handle: castId<CharacterHandle>("planner-seed"), name: "Planner seed", description: "Seed" },
  });
  await db.run(sql`ANALYZE`);
  const stats = async (): Promise<string[]> =>
    (await db.all<Record<string, string>>(sql`SELECT stat FROM sqlite_stat1 WHERE tbl = 'characters'`)).map((row) => row["stat"]?.split(" ")[0] ?? "");
  expect(await stats()).toContain("1");
  const token = "collection-responsiveness-profile";
  const profile = join(importStagingDir, OWNER_USER_ID, token, "profile");
  await mkdir(join(profile, "characters"), { recursive: true });
  await writeFile(join(profile, ST_SETTINGS_FILE), "{}");
  for (let index = 0; index < 20; index += 1) {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    await writeFile(
      join(profile, "characters", `planner-${index}.png`),
      writeCardChunk(
        png,
        JSON.stringify({
          spec: "chara_card_v3",
          ["spec_version"]: "3.0",
          data: { name: `Planner import ${index}`, description: `Synthetic description ${index}` },
        }),
      ),
    );
  }
  observed.queries.reset();
  const result = await app.workloadContributions["import-st"].run(
    { userId: OWNER_USER_ID, ownerId: OWNER_USER_ID, now: () => clock.now() },
    { stagedDir: token },
    () => undefined,
    new AbortController().signal,
  );
  expect(result.failed).toBe(0);
  expect(observed.queries.statements().filter((statement) => statement.trim() === "ANALYZE")).toHaveLength(1);
  expect(await app.services.character.count({ principal: principal(OWNER_USER_ID) })).toBe(21);
  expect((await stats()).every((total) => total === "21")).toBe(true);
});
