// preset.int — the presets slice against a real libSQL :memory: db (FK enforcement ON). Covers: the
// owner-scoped round-trip (config JSON parse + the schema_version column default), the system-default
// row (NULL owner, the NIL TypeID sentinel), and the ownerId RESTRICT FK (both a missing owner and a
// delete-blocked owner).

import { DEFAULT_PROMPT_CONFIG, PROMPT_CONFIG_SCHEMA_VERSION, parsePromptConfig } from "@orb/contracts/preset";
import { regexScriptSchema } from "@orb/contracts/regex";
import { presets, users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, isNull } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

// The system-default sentinel = the NIL TypeID. The DOMAIN owns this constant
// (domain/preset/constants.ts, NOT contracts), so the test mirrors it locally — the schema only needs
// owner_id to be nullable for the row to exist.
const SYSTEM_DEFAULT_PRESET_ID = castId<PresetId>("preset_00000000000000000000000000");

test("an owner-scoped preset round-trips (config parses, schema_version defaults to current)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_preset_owner" });
  const id = castId<PresetId>("preset_001");

  await db.insert(presets).values({
    id,
    ownerId,
    name: "My RP preset",
    kind: "roleplay",
    config: DEFAULT_PROMPT_CONFIG,
  });

  const rows = await db.select().from(presets).where(eq(presets.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.ownerId).toBe(ownerId);
  expect(row?.kind).toBe("roleplay");
  // The column defaults to the current PromptConfig version.
  expect(row?.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  // The JSON config read seam parses back to a valid PromptConfig.
  const config = parsePromptConfig(row?.config);
  expect(Array.isArray(config.sections)).toBe(true);
  expect(config.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
});

test("a preset-embedded RegexScript[] round-trips through the config blob (D53)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_preset_regex" });
  const id = castId<PresetId>("preset_regex");

  await db.insert(presets).values({
    id,
    ownerId,
    name: "With regex",
    kind: "roleplay",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      regexScripts: [
        regexScriptSchema.parse({
          id: "rx_1",
          name: "strip stage dirs",
          findRegex: "\\*[^*]+\\*",
          replaceString: "",
          placement: ["AI_OUTPUT"],
          markdownOnly: true,
        }),
      ],
    },
  });

  const rows = await db.select().from(presets).where(eq(presets.id, id));
  const config = parsePromptConfig(rows[0]?.config);
  expect(config.regexScripts).toHaveLength(1);
  expect(config.regexScripts[0]?.id).toBe("rx_1");
  expect(config.regexScripts[0]?.placement).toEqual(["AI_OUTPUT"]);
  expect(config.regexScripts[0]?.markdownOnly).toBe(true);
});

test("the system-default preset stores a NULL owner under the NIL sentinel id", async () => {
  const db = await freshDb();

  await db.insert(presets).values({
    id: SYSTEM_DEFAULT_PRESET_ID,
    ownerId: null,
    name: "System default",
    kind: "system",
    config: DEFAULT_PROMPT_CONFIG,
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
  });

  const rows = await db.select().from(presets).where(isNull(presets.ownerId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(SYSTEM_DEFAULT_PRESET_ID);
  expect(rows[0]?.ownerId).toBeNull();
});

test("the ownerId FK rejects a missing user", async () => {
  const db = await freshDb();

  let caught: unknown;
  try {
    await db.insert(presets).values({
      id: castId<PresetId>("preset_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      name: "Orphan",
      kind: "roleplay",
      config: DEFAULT_PROMPT_CONFIG,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("the ownerId FK is RESTRICT — deleting a user who owns a preset is blocked", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_preset_owner" });
  await db.insert(presets).values({
    id: castId<PresetId>("preset_restrict"),
    ownerId,
    name: "Held",
    kind: "roleplay",
    config: DEFAULT_PROMPT_CONFIG,
  });

  let caught: unknown;
  try {
    await db.delete(users).where(eq(users.id, ownerId));
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});
