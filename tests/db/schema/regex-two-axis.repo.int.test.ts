// The regex two-axis migration: every stored script in the placement-set shape moves onto `targets` and `passes` by
// the mapping the file-boundary lift applies, keeps every other behavior field, carries none of the old keys, and
// parses through the write schema. A row already on the two axes is left byte for byte.
// @subject packages/db/src/migrations/0020_regex-two-axis.sql
import { join } from "node:path";
import { regexScriptBehaviorWriteSchema } from "@orb/contracts/regex";
import type { Db, RegexTwoAxisChangedScript } from "@orb/db";
import { assertReferentialIntegrity, createDb, REGEX_TWO_AXIS_MIGRATION, runMigrations } from "@orb/db";
import { createBoundedRing } from "@orb/kit/bounded-ring";
import { createIdSource, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { RegexDepth, RegexPass, RegexTarget } from "@orb/kit/regex";
import { runBootMigrations } from "@orb/server/entry/boot";
import { DEFAULT_LOG_LEVEL } from "@orb/server/foundation/env/record";
import { createLogger } from "@orb/server/foundation/observability";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";
import { z } from "zod";

const MIGRATION = REGEX_TWO_AXIS_MIGRATION;
/** Room for every line one boot writes over the seeds below. */
const LOG_LINES = 200;

// The fields a boot line carries that this case reads; every other key is left unread.
const bootLineSchema = z.object({
  level: z.string(),
  scriptId: typeIdSchema(ID_PREFIX.regexScript).optional(),
  name: z.string().optional(),
  change: z.string().optional(),
  dropped: z.array(z.string()).optional(),
  after: z.object({ targets: z.array(z.string()), passes: z.array(z.string()) }).optional(),
  moved: z.number().optional(),
  narrowed: z.number().optional(),
});
const OLD_KEYS = ["placement", "markdownOnly", "promptOnly", "historyDepth"] as const;
const FIELDS = { findRegex: "a", replaceString: "b", runOnEdit: true, trimStrings: ["x"], substituteRegex: 1 } as const;

interface Axes {
  readonly targets: readonly RegexTarget[];
  readonly passes: readonly RegexPass[];
  readonly depth?: RegexDepth;
}

// One row per stored shape: SillyTavern-lifted rows read by their flags, editor-written rows (a DISPLAY or
// PROMPT_HISTORY member) by their members, the save reading winning beside a save member and no target widening.
// `change` marks a seed boot must name, and how.
const SHAPES: readonly {
  readonly shape: string;
  readonly change?: RegexTwoAxisChangedScript["change"];
  readonly old: Readonly<Record<string, unknown>>;
  readonly axes: Axes;
}[] = [
  { shape: "neither flag", old: { placement: ["AI_OUTPUT"], markdownOnly: false, promptOnly: false }, axes: { targets: ["AI_OUTPUT"], passes: ["save"] } },
  {
    shape: "prompt only",
    change: "moved",
    old: { placement: ["AI_OUTPUT"], markdownOnly: false, promptOnly: true },
    axes: { targets: ["AI_OUTPUT"], passes: ["prompt"] },
  },
  {
    shape: "display only",
    change: "moved",
    old: { placement: ["AI_OUTPUT"], markdownOnly: true, promptOnly: false },
    axes: { targets: ["AI_OUTPUT"], passes: ["display"] },
  },
  {
    shape: "both flags",
    change: "moved",
    old: { placement: ["USER_INPUT", "AI_OUTPUT"], markdownOnly: true, promptOnly: true },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["display", "prompt"] },
  },
  {
    shape: "world info prompt only",
    change: "moved",
    old: { placement: ["WORLD_INFO"], markdownOnly: false, promptOnly: true },
    axes: { targets: ["WORLD_INFO"], passes: ["prompt"] },
  },
  {
    shape: "display member",
    old: { placement: ["DISPLAY"], markdownOnly: true, promptOnly: false },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT", "REASONING"], passes: ["display"] },
  },
  {
    shape: "history member with a floor of 0",
    old: { placement: ["PROMPT_HISTORY"], markdownOnly: false, promptOnly: true, historyDepth: { min: 0, max: 3 } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["prompt"], depth: { min: -1, max: 3 } },
  },
  {
    shape: "history member over the whole history",
    old: { placement: ["PROMPT_HISTORY"], markdownOnly: false, promptOnly: true, historyDepth: { min: 0, max: null } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["prompt"] },
  },
  {
    shape: "history member beside world info",
    old: { placement: ["WORLD_INFO", "PROMPT_HISTORY"], markdownOnly: false, promptOnly: true, historyDepth: { min: 2, max: null } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO"], passes: ["prompt"], depth: { min: 2, max: null } },
  },
  {
    shape: "save beside display",
    change: "narrowed",
    old: { placement: ["AI_OUTPUT", "DISPLAY"], markdownOnly: false, promptOnly: false },
    axes: { targets: ["AI_OUTPUT"], passes: ["save"] },
  },
  {
    shape: "save beside history",
    change: "narrowed",
    old: { placement: ["AI_OUTPUT", "PROMPT_HISTORY"], markdownOnly: false, promptOnly: true, historyDepth: { min: 2, max: 4 } },
    axes: { targets: ["AI_OUTPUT"], passes: ["save"] },
  },
  {
    shape: "save beside world info and display",
    change: "narrowed",
    old: { placement: ["AI_OUTPUT", "WORLD_INFO", "DISPLAY"], markdownOnly: false, promptOnly: false },
    axes: { targets: ["AI_OUTPUT"], passes: ["save"] },
  },
  {
    shape: "display beside history",
    change: "narrowed",
    old: { placement: ["DISPLAY", "PROMPT_HISTORY"], markdownOnly: false, promptOnly: false, historyDepth: { min: 0, max: null } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["display", "prompt"] },
  },
  {
    shape: "display beside world info",
    change: "narrowed",
    old: { placement: ["DISPLAY", "WORLD_INFO"], markdownOnly: false, promptOnly: false },
    axes: { targets: ["WORLD_INFO"], passes: ["prompt"] },
  },
  {
    shape: "display, history and world info",
    change: "narrowed",
    old: { placement: ["DISPLAY", "PROMPT_HISTORY", "WORLD_INFO"], markdownOnly: false, promptOnly: false, historyDepth: { min: 1, max: 5 } },
    axes: { targets: ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO"], passes: ["display", "prompt"], depth: { min: 1, max: 5 } },
  },
  {
    shape: "neither flag with world info kept",
    old: { placement: ["AI_OUTPUT", "WORLD_INFO"], markdownOnly: false, promptOnly: false },
    axes: { targets: ["AI_OUTPUT", "WORLD_INFO"], passes: ["save"] },
  },
  {
    shape: "two save members in stored order",
    old: { placement: ["REASONING", "USER_INPUT"], markdownOnly: false, promptOnly: false },
    axes: { targets: ["USER_INPUT", "REASONING"], passes: ["save"] },
  },
  // The prompt pass reads no reasoning, so this row keeps its target and reaches nothing.
  {
    shape: "prompt only on reasoning",
    change: "moved",
    old: { placement: ["REASONING"], markdownOnly: false, promptOnly: true },
    axes: { targets: ["REASONING"], passes: ["prompt"] },
  },
  { shape: "already on two axes", old: { targets: ["REASONING"], passes: ["save"] }, axes: { targets: ["REASONING"], passes: ["save"] } },
];

/** One stored script per shape, named by its shape, on a database migrated up to just before 0020. */
async function seedShapes(db: Db, previousChain: string): Promise<string[]> {
  await runMigrations(db, previousChain);
  const ids = createIdSource(createSeededIds().next);
  const owner = await seedUser(db, {}, ids);
  const rowIds = SHAPES.map(() => ids.typeId(ID_PREFIX.regexScript));
  for (const [index, { shape, old }] of SHAPES.entries()) {
    await db.run(
      sql`insert into regex_scripts (id, owner_id, name, behavior) values (${rowIds[index]}, ${owner.id}, ${shape}, ${JSON.stringify({ ...FIELDS, ...old })})`,
    );
  }
  return rowIds;
}

test("the migration moves every placement-set script onto the two axes and leaves a two-axis script as it was", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  const rowIds = await seedShapes(db, previous.path);
  const twoAxisId = rowIds.at(-1);
  const twoAxisBefore = await db.all(sql`select behavior from regex_scripts where id = ${twoAxisId}`);

  await runMigrations(db, SHIPPED_MIGRATIONS);

  const stored = await db.all<{ readonly id: string; readonly behavior: string; readonly oldKeys: number }>(
    sql`select id, behavior, ${sql.raw(OLD_KEYS.map((key) => `(json_type(behavior, '$.${key}') is not null)`).join(" + "))} as oldKeys from regex_scripts`,
  );
  const byId = new Map(stored.map((row) => [row.id, row]));
  const migrated = SHAPES.map(({ shape }, index) => {
    const row = byId.get(rowIds[index] ?? "");
    const parsed = regexScriptBehaviorWriteSchema.safeParse(row === undefined ? null : JSON.parse(row.behavior));
    const { targets, passes, depth, findRegex, replaceString, runOnEdit, trimStrings, substituteRegex } = parsed.data ?? {};
    return {
      shape,
      oldKeys: row?.oldKeys,
      parses: parsed.success,
      axes: { targets, passes, ...(depth === undefined ? {} : { depth }) },
      fields: { findRegex, replaceString, runOnEdit, trimStrings, substituteRegex },
    };
  });

  expect(migrated).toEqual(SHAPES.map(({ shape, axes }) => ({ shape, oldKeys: 0, parses: true, axes, fields: FIELDS })));
  expect(await db.all(sql`select behavior from regex_scripts where id = ${twoAxisId}`)).toEqual(twoAxisBefore);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
});

test("boot names exactly the scripts the rewrite moves or narrows, with the reach each one lost", async ({ importStagingDir }) => {
  await using previous = await migrationsBefore(MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await seedShapes(db, previous.path);
  const ring = createBoundedRing<string>(LOG_LINES);

  await runBootMigrations({
    db,
    logger: createLogger(DEFAULT_LOG_LEVEL, ring),
    databaseUrl: ":memory:",
    backupDir: join(importStagingDir, "backups"),
    migrationsFolder: SHIPPED_MIGRATIONS,
  });

  const lines = ring.recent().map((line) => bootLineSchema.parse(JSON.parse(line)));
  const named = lines.filter((line) => line.level === "warn" && line.scriptId !== undefined);
  expect(named.map(({ name, change }) => ({ name, change })).toSorted((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))).toEqual(
    SHAPES.flatMap(({ shape, change }) => (change === undefined ? [] : [{ name: shape, change }])).toSorted((a, b) => a.name.localeCompare(b.name)),
  );
  // The save reading won: the display pass it also ran on is the reach it lost.
  expect(named.find((line) => line.name === "save beside display")?.dropped).toEqual(["display:USER_INPUT", "display:AI_OUTPUT", "display:REASONING"]);
  // A moved row lost the save pass on its target and gained the prompt pass.
  expect(named.find((line) => line.name === "prompt only")).toMatchObject({
    dropped: ["save:AI_OUTPUT"],
    after: { targets: ["AI_OUTPUT"], passes: ["prompt"] },
  });
  expect(named.find((line) => line.name === "prompt only on reasoning")?.dropped).toEqual(["save:REASONING"]);
  const counted = (change: RegexTwoAxisChangedScript["change"]): number => SHAPES.filter((seed) => seed.change === change).length;
  expect(lines.find((line) => line.moved !== undefined)).toMatchObject({ level: "info", moved: counted("moved"), narrowed: counted("narrowed") });
});
