// knob-wire-coverage (#1094) — the per-arm MEMBER READERS' two-sided contract. #934 re-homed arm C's
// IMPORTED-module axis and left every other arm reading local declarations only, so an inherited
// `EffectiveAppConfig` field, a spread `USER_SETTINGS_SECTIONS` member and a spread `appSettingsSchema`
// key were dropped SILENTLY while the byte-equivalent inline spelling RED'd — a denominator that shrinks
// behind a green ✓. Each test below is one half of a PAIR written in ONE tree: the inline member is wired
// and passes, the composed member is the finding, so a reader that drops the composed half fails here and
// nowhere else. Conformance pins the same shapes as descriptor rows; a REFUSAL cannot be a conformance row
// (a throw is a tool error there), so the fail-closed half lives here off `pass.toolErrors`.
import { gate } from "../../../../tooling/src/verify/gates/knob-wire-coverage.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const SETTINGS = "packages/contracts/src/settings/index.ts";
const PRESET = "packages/contracts/src/preset/index.ts";
const METADATA = "packages/server/src/domain/chat/contract/metadata.ts";

function run(files: Readonly<Record<string, string>>): { readonly findings: readonly string[]; readonly toolErrors: readonly string[] } {
  const { project, root } = ctxFor({ ...files });
  const pass = runPass([gate], { root, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  return {
    findings: (pass.gates[0]?.findings ?? []).map((finding) => finding.message ?? ""),
    toolErrors: pass.toolErrors.map((error) => error.message),
  };
}

/** The member keys (`<arm>:<member>`) the gate reported, for a paired inline-vs-composed assertion. */
function keys(files: Readonly<Record<string, string>>): readonly string[] {
  const result = run(files);
  expect(result.toolErrors).toEqual([]);
  return result.findings.flatMap((message) => {
    const match = /knob-wire-coverage\[(?<key>[^\]]+)\]/u.exec(message);
    return match?.groups?.["key"] === undefined ? [] : [match.groups["key"]];
  });
}

function toolErrors(files: Readonly<Record<string, string>>): readonly string[] {
  return run(files).toolErrors;
}

// ── arm A: the interface's RESOLVED type ────────────────────────────────────────────────────────────────

test("an INHERITED EffectiveAppConfig field is a subject, while its consumed inline twin passes", () => {
  const reported = keys({
    [SETTINGS]:
      "export interface GhostBase {\n  inheritedProbe: number;\n}\nexport interface EffectiveAppConfig extends GhostBase {\n  inlineProbe: number;\n}\n",
    "packages/server/src/entry/compose/x.ts":
      'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ inheritedProbe: 1, inlineProbe: 1 });\nexport const use = getEffectiveConfig().inlineProbe;\n',
  });
  expect(reported).toContain("A:inheritedProbe");
  expect(reported).not.toContain("A:inlineProbe");
});

test("an `extends` clause binding no interface REFUSES — inherited fields that cannot be enumerated are not zero fields", () => {
  expect(
    toolErrors({
      [SETTINGS]: "export interface EffectiveAppConfig extends MissingBaseProbe {\n  inlineProbe: number;\n}\n",
      "packages/server/src/entry/compose/x.ts": "export const getEffectiveConfig = 1;\n",
    })[0],
  ).toContain("resolves to no interface declaration");
});

// ── arm B: the section tuple, through lib/tuple-read.ts ─────────────────────────────────────────────────

test("a SPREAD USER_SETTINGS_SECTIONS member is a subject, while its written inline twin passes", () => {
  const reported = keys({
    [SETTINGS]: 'export const SPREAD_PROBE = ["spreadSection"] as const;\nexport const USER_SETTINGS_SECTIONS = [...SPREAD_PROBE, "inlineSection"] as const;\n',
    "packages/client/src/features/x/components/x.tsx":
      'export const updateUserSettingsSection = 1;\nexport const w = { section: "inlineSection", patch: {} };\n',
  });
  expect(reported).toContain("B:spreadSection");
  expect(reported).not.toContain("B:inlineSection");
});

test("a section tuple spreading an identifier nothing binds REFUSES", () => {
  expect(toolErrors({ [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = [...MISSING_PROBE, "inlineSection"] as const;\n' })[0]).toContain(
    "which no local declaration or named import binds",
  );
});

// ── arms B2 / C / E / F: the ONE authored-object member reader ───────────────────────────────────────────

test("a SPREAD appSettingsSchema key is a subject in arms B2 AND C, while its inline twin passes both", () => {
  const reported = keys({
    [SETTINGS]:
      'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nconst SHAPE_PROBE = { spreadAppKey: z.boolean() };\nexport const appSettingsSchema = z.object({ ...SHAPE_PROBE, inlineAppKey: z.boolean() });\n',
    "packages/client/src/features/settings/lib/x.ts": "declare const view: { inlineAppKey?: boolean };\nexport const a = view.inlineAppKey;\n",
  });
  expect(reported).toContain("B2:spreadAppKey");
  expect(reported).toContain("C:spreadAppKey");
  expect(reported).not.toContain("B2:inlineAppKey");
  expect(reported).not.toContain("C:inlineAppKey");
});

test("an IMPORTED appSettingsSchema resolves its keys instead of answering the empty set", () => {
  const reported = keys({
    "packages/contracts/src/settings/base-app.ts": 'import { z } from "zod";\nexport const baseAppSchema = z.object({ importedAppKey: z.boolean() });\n',
    [SETTINGS]:
      'import { baseAppSchema } from "./base-app.ts";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const appSettingsSchema = baseAppSchema;\n',
    "packages/client/src/features/settings/lib/x.ts": "export const somethingElse = 1;\n",
  });
  expect(reported).toContain("B2:importedAppKey");
});

test("a SHORTHAND member names its key", () => {
  const reported = keys({
    [SETTINGS]:
      'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nconst shorthandAppKey = z.boolean();\nexport const appSettingsSchema = z.object({ shorthandAppKey });\n',
    "packages/client/src/features/settings/lib/x.ts": "export const somethingElse = 1;\n",
  });
  expect(reported).toContain("B2:shorthandAppKey");
});

test("a COMPUTED string-literal key names its key, not the bracket text", () => {
  const reported = keys({
    [SETTINGS]:
      'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const appSettingsSchema = z.object({ ["computedAppKey"]: z.boolean() });\n',
    "packages/client/src/features/settings/lib/x.ts": "export const somethingElse = 1;\n",
  });
  expect(reported).toContain("B2:computedAppKey");
});

test("a SPREAD DEFAULT_FORMAT_STRINGS key is a subject, while its read inline twin passes", () => {
  const reported = keys({
    [PRESET]:
      'export const presetSchema = 1;\nconst FORMATS_PROBE = { spreadNudge: "x" } as const;\nexport const DEFAULT_FORMAT_STRINGS = { ...FORMATS_PROBE, inlineNudge: "y" } as const;\n',
    "packages/server/src/domain/chat/x.ts":
      "declare const cfg: { formatStrings?: { inlineNudge?: string } };\nexport const v = cfg.formatStrings?.inlineNudge;\n",
  });
  expect(reported).toContain("E:spreadNudge");
  expect(reported).not.toContain("E:inlineNudge");
});

test("a SPREAD chatMetadataSchema key is a subject on BOTH belts, while its wired inline twin passes", () => {
  const reported = keys({
    [METADATA]:
      'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst META_PROBE = { spreadMeta: z.number() };\nconst chatMetadataSchema = z.object({ ...META_PROBE, inlineMeta: z.number() }).loose();\nexport const s = chatMetadataSchema;\n',
    "packages/server/src/domain/chat/verbs/x.ts": "export const write = { inlineMeta: 1 };\n",
    "packages/server/src/domain/chat/engine/x.ts": "declare const meta: { inlineMeta?: number };\nexport const r = meta.inlineMeta;\n",
  });
  expect(reported).toContain("F:spreadMeta:write");
  expect(reported).toContain("F:spreadMeta:read");
  expect(reported).not.toContain("F:inlineMeta:write");
  expect(reported).not.toContain("F:inlineMeta:read");
});

// ── the refusals (a throw is a conformance TOOL error, so these can only be pinned here) ─────────────────

const APP_SETTINGS_HEAD = 'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\n';

function appSettings(initializer: string, extra = ""): Record<string, string> {
  return { [SETTINGS]: `${APP_SETTINGS_HEAD}${extra}export const appSettingsSchema = ${initializer};\n` };
}

test("a spread of an identifier nothing binds REFUSES", () => {
  expect(toolErrors(appSettings("z.object({ ...MISSING_PROBE })"))[0]).toContain("resolves to no local declaration or named import");
});

test("a spread contributing ZERO members REFUSES — an empty contribution is the silent-shrink shape", () => {
  expect(toolErrors(appSettings("z.object({ ...EMPTY_PROBE })", "const EMPTY_PROBE = {};\n"))[0]).toContain("contributed zero members");
});

test("a schema composition CYCLE refuses instead of recursing", () => {
  expect(toolErrors(appSettings("FIRST_PROBE", "const FIRST_PROBE = SECOND_PROBE;\nconst SECOND_PROBE = FIRST_PROBE;\n"))[0]).toContain("composition cycle");
});

test("a key-CHANGING schema method REFUSES — a narrowed key set is not the declared one", () => {
  expect(toolErrors(appSettings("z.object({ a: z.boolean() }).pick({ a: true })"))[0]).toContain("unsupported appSettingsSchema schema method .pick()");
});

test("a builder this reader cannot model REFUSES rather than answering the empty set", () => {
  expect(toolErrors(appSettings("buildAppSettings()"))[0]).toContain("unsupported appSettingsSchema expression");
});

test("a METHOD member REFUSES — a member kind the reader cannot answer must never be dropped", () => {
  expect(toolErrors(appSettings('z.object({ probe() { return "x"; } })'))[0]).toContain("unsupported appSettingsSchema member kind MethodDeclaration");
});

test("a GETTER member refuses by its own kind", () => {
  expect(toolErrors(appSettings('z.object({ get probe() { return "x"; } })'))[0]).toContain("unsupported appSettingsSchema member kind GetAccessor");
});

test("a COMPUTED key that is not a string literal REFUSES — a key this reader cannot name matches no wire", () => {
  expect(toolErrors(appSettings("z.object({ [probeKey]: z.boolean() })"))[0]).toContain("computed appSettingsSchema key");
});

// ── arm C's imported semantic-source manifest ───────────────────────────────────────────────────────────

test("a userSettingsSchema that composes no `appearance` property REFUSES — the manifest edge is unreachable", () => {
  expect(
    toolErrors({
      [SETTINGS]:
        'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const userSettingsSchema = z.object({ schemaVersion: z.number() });\n',
    })[0],
  ).toContain('composes no "appearance" property');
});

test("a userSettingsSchema composing `appearance` as a SHORTHAND refuses — a shorthand names no source", () => {
  expect(
    toolErrors({
      [SETTINGS]:
        'import { z } from "zod";\nimport { appearanceSettingsSchema } from "./appearance.ts";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nconst appearance = appearanceSettingsSchema;\nexport const userSettingsSchema = z.object({ appearance });\n',
      "packages/contracts/src/settings/appearance.ts":
        'import { z } from "zod";\nexport const appearanceSettingsSchema = z.object({ leafProbe: z.number() });\n',
    })[0],
  ).toContain("carries no readable schema expression");
});
