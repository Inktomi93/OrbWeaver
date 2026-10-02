// Typed output objects reject widening; deliberately carried or arbitrary value planes keep their contracts.

import { archetypeSchema, visualArchetypeSchema } from "@orb/contracts/discovery";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { PROSE_SLOT_IDS, proseOverridesSchema } from "@orb/contracts/prose";
import { regexScriptCardSchema } from "@orb/contracts/regex";
import { chatRpgPointerSchema, RPG_PROFILE_FREEFORM, rpgTrackerValueSchema } from "@orb/contracts/rpg";
import type { UserSettingsView } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { themeBackgroundSchema, themeOverrideSchema } from "@orb/contracts/theme";
import type { WorkloadRowAnyKind } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import type { SettingsService } from "@orb/server/domain/settings";
import type { WorkloadService } from "@orb/server/domain/workloads";
import { z } from "zod";
import { appRouter } from "../../../../../packages/server/src/transport/trpc/router.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const OUTPUT_NAMESPACES = ["automation", "character", "chat", "imagery", "preset", "refinery", "rpg", "settings", "workloads", "regex"] as const;

const CARRIED_SCHEMAS = new Set<z.core.$ZodType>([themeOverrideSchema, themeBackgroundSchema, chatRpgPointerSchema]);

function openObjects(schema: z.core.$ZodType, path = "$", active = new Set<z.core.$ZodType>()): string[] {
  if (active.has(schema) || CARRIED_SCHEMAS.has(schema)) {
    return [];
  }
  const next = new Set(active);
  next.add(schema);
  if (schema instanceof z.ZodObject) {
    const own = schema._zod.def.catchall instanceof z.ZodNever ? [] : [path];
    return [
      ...own,
      ...Object.entries(schema.shape).flatMap(([key, child]) => {
        if (!(child instanceof z.ZodType)) {
          throw new Error(`Unreadable schema child ${path}.${key}`);
        }
        return openObjects(child, `${path}.${key}`, next);
      }),
    ];
  }
  if (schema instanceof z.ZodArray) {
    return openObjects(schema.element, `${path}[]`, next);
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.flatMap((child, index) => openObjects(child, `${path}|${index}`, next));
  }
  if (schema instanceof z.ZodRecord) {
    return openObjects(schema.valueType, `${path}[*]`, next);
  }
  if (schema instanceof z.ZodPipe) {
    return [...openObjects(schema.in, path, next), ...openObjects(schema.out, path, next)];
  }
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodLazy
  ) {
    return openObjects(schema.unwrap(), path, next);
  }
  return [];
}

test("corrected mounted typed output closures are strict outside canonical carried-value exceptions", () => {
  const widened = Object.entries(appRouter._def.procedures).flatMap(([route, procedure]) => {
    if (!OUTPUT_NAMESPACES.some((namespace) => route.startsWith(`${namespace}.`))) {
      return [];
    }
    if (!("_def" in procedure)) {
      throw new Error(`Mounted entry is not a procedure: ${route}`);
    }
    if (!("output" in procedure._def)) {
      return [];
    }
    const schema = procedure._def.output;
    if (!(schema instanceof z.ZodType)) {
      return [];
    }
    return openObjects(schema).map((path) => `${route}:${path}`);
  });
  expect(widened).toEqual([]);
});

function unwrapped(schema: z.core.$ZodType): z.core.$ZodType {
  if (schema instanceof z.ZodPipe) {
    return unwrapped(schema.in);
  }
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodReadonly
  ) {
    return unwrapped(schema.unwrap());
  }
  return schema;
}
function schemaChild(schema: z.core.$ZodType, step: string | number): z.core.$ZodType {
  const current = unwrapped(schema);
  if (current instanceof z.ZodArray && step === "[]") {
    return current.element;
  }
  if (current instanceof z.ZodRecord && step === "[*]") {
    return current.valueType;
  }
  if (current instanceof z.ZodUnion && typeof step === "number") {
    const child = current.options[step];
    if (child instanceof z.ZodType) {
      return child;
    }
  }
  if (current instanceof z.ZodObject && typeof step === "string") {
    const child = current.shape[step];
    if (child instanceof z.ZodType) {
      return child;
    }
  }
  throw new Error(`Unreadable schema step ${step}`);
}
function schemaAt(route: string, steps: readonly (string | number)[]): z.ZodType {
  const procedure = Object.entries(appRouter._def.procedures).find(([path]) => path === route)?.[1];
  if (procedure === undefined || !("_def" in procedure)) {
    throw new Error(`No mounted procedure at ${route}`);
  }
  if (!("output" in procedure._def)) {
    throw new Error(`No output parser at ${route}`);
  }
  const schema = procedure._def.output;
  if (!(schema instanceof z.ZodType)) {
    throw new Error(`No Zod output at ${route}`);
  }
  let selected: z.core.$ZodType = schema;
  for (const step of steps) {
    selected = schemaChild(selected, step);
  }
  if (!(selected instanceof z.ZodType)) {
    throw new Error(`No classic output parser at ${route}`);
  }
  return selected;
}

const nestedCases = [
  { route: "character.get", path: ["greetings", "[]"], value: { text: "Hi" } },
  { route: "automation.listRules", path: ["[]", "trigger"], value: { bus: "chat", type: "chatOpened" } },
  { route: "imagery.editImage", path: ["images", "[]", "block"], value: { kind: "markdown", md: "caption" } },
  { route: "imagery.editImage", path: ["images", "[]", "block", 1, "src"], value: { kind: "asset", assetId: mintTypeId(ID_PREFIX.asset) } },
  { route: "rpg.getConfigView", path: ["statProfile"], value: RPG_PROFILE_FREEFORM },
  { route: "rpg.getTrackerView", path: ["actors", "[]", "volatile", "trackerValues", "[*]"], value: rpgTrackerValueSchema.parse({}) },
  { route: "preset.get", path: ["config", "params"], value: DEFAULT_PROMPT_CONFIG.params },
  { route: "preset.get", path: ["config", "sections", "[]", 0, "inject"], value: { depth: 0 } },
  { route: "settings.getUserSettings", path: ["config", "chat"], value: DEFAULT_USER_SETTINGS.chat },
  { route: "settings.getUserSettings", path: ["config", "chat", "autoSwipe"], value: DEFAULT_USER_SETTINGS.chat.autoSwipe },
  { route: "settings.getUserSettings", path: ["config", "chat", "attachmentQuality"], value: DEFAULT_USER_SETTINGS.chat.attachmentQuality },
  { route: "settings.getUserSettings", path: ["config", "groupDefaults"], value: DEFAULT_USER_SETTINGS.groupDefaults },
  { route: "settings.getUserSettings", path: ["config", "prose", "[*]"], value: { text: "a custom instruction", baseVersion: 1 } },
  { route: "preset.get", path: ["config", "prose", "[*]"], value: { text: "a custom instruction", baseVersion: 1 } },
  { route: "refinery.listRuns", path: ["[]", 0, "payload"], value: { overallScore: 7, fieldScores: [], priorityImprovements: [], summary: "score" } },
] satisfies readonly { route: string; path: readonly (string | number)[]; value: object }[];

for (const example of nestedCases) {
  test(`${example.route} ${example.path.join(".")} keeps valid data and refuses a typed field addition`, () => {
    const schema = schemaAt(example.route, example.path);
    expect(schema.parse(example.value)).toEqual(example.value);
    expect(schema.safeParse({ ...example.value, privateTypedField: "secret" }).success).toBe(false);
  });
}

test("mounted carried-background and theme fields keep their ruled healing and stripping", () => {
  const malformed = { kind: "unrecognized", assetId: 7, privateVendorField: "kept elsewhere" };
  expect(schemaAt("chat.setChatBackground", []).parse(malformed)).toEqual(themeBackgroundSchema.parse(malformed));
  const theme = { text: "not-a-color", privateVendorField: "kept elsewhere" };
  expect(schemaAt("character.get", ["themeOverride"]).parse(theme)).toEqual(themeOverrideSchema.parse(theme));
});

test("mounted vendor, custom-model and global JSON value planes remain open", () => {
  const arbitrary = { privateVendorField: { nested: ["authored"] } };
  for (const [route, path] of [
    ["character.get", ["extensions"]],
    ["persona.get", ["metadata"]],
    ["worldInfo.getEntry", ["metadata"]],
    ["refinery.listRuns", ["[]", 1, "payload"]],
    ["refinery.listRuns", ["[]", 1, "payloadConfig", "schema"]],
    ["settings.getGlobalSetting", ["value"]],
  ] satisfies readonly [string, readonly (string | number)[]][]) {
    expect(schemaAt(route, path).parse(arbitrary)).toEqual(arbitrary);
  }
});

test("the real clean-workload caller refuses nested scope additions while poison and raw schedules retain data", async () => {
  const row = {
    id: mintTypeId(ID_PREFIX.workload),
    status: "succeeded",
    mode: "singular",
    lane: "sweep",
    ownerId: null,
    dependsOn: null,
    error: null,
    progress: null,
    scheduledAt: 1,
    createdAt: 1,
    updatedAt: 2,
    kind: "databank-reindex",
    params: { scope: { kind: "owner" } },
    result: null,
    poison: false,
  } satisfies WorkloadRowAnyKind;
  let result: WorkloadRowAnyKind = row;
  const get: WorkloadService["get"] = async () => result;
  const ctx = makeContext({ auth: principal("user"), services: { workloads: { get } } });
  await expect(caller(ctx).workloads.get({ id: row.id })).resolves.toEqual(row);
  const scope = { ...row.params.scope, privateJobSecret: "secret" };
  result = { ...row, params: { scope } };
  await expect(caller(ctx).workloads.get({ id: row.id })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  result = { ...row, params: null, poison: true, result: { arbitraryStoredResult: { retained: true } } };
  await expect(caller(ctx).workloads.get({ id: row.id })).resolves.toEqual(result);
  const schedule = {
    id: mintTypeId(ID_PREFIX.workloadSchedule),
    ownerId: "scheduler",
    kind: row.kind,
    mode: row.mode,
    params: { scope },
    cadence: "daily",
    nextRunAt: 1,
    lastRunAt: null,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
  expect(schemaAt("workloads.listSchedules", ["[]"]).parse(schedule)).toEqual(schedule);
});

test("the real settings caller preserves attachment quality and refuses a typed nested field addition", async () => {
  const auth = principal("user", { userId: newId<UserId>() });
  const quality = { imageDetail: "high", videoMaxResolution: "480" } as const;
  const valid: UserSettingsView = {
    userId: auth.userId,
    schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    config: { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, attachmentQuality: quality } },
    updatedAt: 0,
    configUnreadable: null,
  };
  let result = valid;
  const getUserSettings: SettingsService["getUserSettings"] = async () => result;
  const ctx = makeContext({ auth, services: { settings: { getUserSettings } } });
  await expect(caller(ctx).settings.getUserSettings()).resolves.toEqual(valid);
  const widened = { ...quality, privateTypedField: "secret" };
  result = { ...valid, config: { ...valid.config, chat: { ...valid.config.chat, attachmentQuality: widened } } };
  await expect(caller(ctx).settings.getUserSettings()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
});

test("typed carried regex output validates normalized data without changing foreign input polarity", () => {
  const foreign = { id: "foreign-script", scriptName: "Foreign", findRegex: "x", replaceString: "y", placement: [0], disabled: true };
  const normalized = regexScriptCardSchema.parse(foreign);
  expect(normalized.enabled).toBe(false);
  const schema = schemaAt("character.get", ["regexScripts", "[]"]);
  expect(schema.parse(normalized)).toEqual(normalized);
  expect(schema.safeParse({ ...normalized, privateTypedField: "secret" }).success).toBe(false);
  expect(regexScriptCardSchema.parse(foreign)).toEqual(normalized);
});

test("prose output keeps selected slot keys and bytes while stored parsing retains its per-value healing", () => {
  const key = PROSE_SLOT_IDS[0];
  const stored = { [key]: { text: "custom prose {{input}}", baseVersion: 1 } };
  const widened = { [key]: { ...stored[key], privateTypedField: "secret" } };
  expect(proseOverridesSchema.parse(widened)).toEqual(stored);
  for (const [route, path] of [
    ["preset.get", ["config", "prose"]],
    ["settings.getUserSettings", ["config", "prose"]],
  ] satisfies readonly [string, readonly string[]][]) {
    const schema = schemaAt(route, path);
    expect(schema.parse(stored)).toEqual(stored);
    expect(schema.safeParse(widened).success).toBe(false);
  }
});

test("mounted GM preset output preserves null and native identity while rejecting a foreign row prefix", () => {
  const schema = schemaAt("rpg.getConfigView", ["gmPresetId"]);
  const presetId = mintTypeId(ID_PREFIX.preset);
  expect(schema.parse(null)).toBeNull();
  expect(schema.parse(presetId)).toBe(presetId);
  expect(schema.safeParse(mintTypeId(ID_PREFIX.character)).success).toBe(false);
});

test("non-row provenance and local section keys retain their original output grammars", () => {
  const generation = schemaAt("chat.listMessages", ["messages", "[]", "generationId"]);
  expect(generation.parse("gen-upstream-provider-handle")).toBe("gen-upstream-provider-handle");
  expect(generation.parse(null)).toBeNull();
  const passId = "ab".repeat(32);
  expect(archetypeSchema.shape.passId.parse(passId)).toBe(passId);
  expect(visualArchetypeSchema.shape.passId.parse(passId)).toBe(passId);
  const section = schemaAt("chat.previewAssembly", ["budget", "sections", "[]", "sectionId"]);
  expect(section.parse("imported-local-section")).toBe("imported-local-section");
});
