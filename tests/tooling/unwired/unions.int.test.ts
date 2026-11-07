// `pnpm unwired unions` reports a tuple member no production literal builds into its union, with the branches, checks
// and Record keys that name it, and apart a tuple only a z.enum parse or a membership guard builds. A same-text literal
// in a plain string slot and an enumerated tuple are controls.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanUnions } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD } from "./_planted.ts";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/mode.ts": [
    'export const MODES = ["on", "off", "auto"] as const;',
    "export type Mode = (typeof MODES)[number];",
    "export function level(mode: Mode): number {",
    "  switch (mode) {",
    '    case "on":',
    "      return 1;",
    '    case "auto":',
    "      return 3;",
    "    default:",
    "      return 0;",
    "  }",
    "}",
    'export const LABEL: Record<Mode, string> = { on: "On", off: "Off", auto: "Auto" };',
    'export const isAuto = (mode: Mode): boolean => mode === "auto";',
    'export const TARGETS = ["x64", "arm64"] as const;',
    "export const isTarget = (value: string): boolean => (TARGETS as readonly string[]).includes(value);",
    "export const log = (line: string): string => line;",
    'export const picked: Mode = "off";',
    'export const levels = [level("on"), log("auto")];',
    'export const SIZES = ["s", "m"] as const;',
    "export const all = SIZES.map((size) => size.toUpperCase());",
  ].join("\n"),
  // A model's structured output fills this vocabulary through a parse, so no literal builds `warm` or `cold`.
  "packages/a/src/tone.ts": [
    "const z = { enum: <const T extends readonly string[]>(values: T): T => values };",
    'export const TONES = ["warm", "cold"] as const;',
    "export type Tone = (typeof TONES)[number];",
    "export const toneSchema = z.enum(TONES);",
    'export const isWarm = (tone: Tone): boolean => tone === "warm";',
  ].join("\n"),
};

test("the unions scan reports an unbuilt member with its dead branch, check and key, marks a parsed vocabulary apart, and skips an enumerated tuple", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanUnions({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ kind, home, member, cases, checks, keys }) => ({ kind, home, member, cases, checks, keys }))).toEqual([
    {
      kind: "unbuilt",
      home: "MODES",
      member: "auto",
      cases: ["packages/a/src/mode.ts:7"],
      checks: ["packages/a/src/mode.ts:14"],
      keys: ["packages/a/src/mode.ts:13"],
    },
    { kind: "parsed", home: "TARGETS", member: "x64", cases: [], checks: [], keys: [] },
    { kind: "parsed", home: "TARGETS", member: "arm64", cases: [], checks: [], keys: [] },
    { kind: "parsed", home: "TONES", member: "warm", cases: [], checks: ["packages/a/src/tone.ts:5"], keys: [] },
    { kind: "parsed", home: "TONES", member: "cold", cases: [], checks: [], keys: [] },
  ]);
  expect(report.enumerated).toEqual(["packages/a/src/mode.ts:SIZES"]);
  expect(report.disagreements).toEqual([]);
});

// Construction evidence belongs to the vocabulary whose slot it lands in. `KINDS_A` and `KINDS_B` share the text
// `shared`; only `KINDS_B`'s slot is ever built with it. The remaining tuples are controls that must clear: a slot
// that unions two vocabularies builds `dual` in both, and a slot derived from one tuple builds its own member.
const SHARED_TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/shared.ts": [
    'export const KINDS_A = ["alpha", "shared"] as const;',
    "export type KindA = (typeof KINDS_A)[number];",
    'export const KINDS_B = ["beta", "shared"] as const;',
    "export type KindB = (typeof KINDS_B)[number];",
    "export const takeA = (kind: KindA): KindA => kind;",
    "export const takeB = (kind: KindB): KindB => kind;",
    'export const builtA = takeA("alpha");',
    'export const builtB = [takeB("beta"), takeB("shared")];',
  ].join("\n"),
  "packages/a/src/dual.ts": [
    'export const KINDS_P = ["p", "dual"] as const;',
    'export const KINDS_Q = ["q", "dual"] as const;',
    "type Either = (typeof KINDS_P)[number] | (typeof KINDS_Q)[number];",
    "export const takeEither = (kind: Either): Either => kind;",
    'export const builtDual = [takeEither("dual"), takeEither("p"), takeEither("q")];',
  ].join("\n"),
  "packages/a/src/narrow.ts": [
    'export const KINDS_R = ["r", "narrow", "other"] as const;',
    "type Narrow = Exclude<(typeof KINDS_R)[number], 'other'>;",
    "export const takeNarrow = (kind: Narrow): Narrow => kind;",
    "export const takeR = (kind: (typeof KINDS_R)[number]): string => kind;",
    'export const builtR = [takeNarrow("r"), takeNarrow("narrow"), takeR("other")];',
  ].join("\n"),
};

test("the unions scan keeps construction evidence with its own vocabulary: a shared text built only in another tuple's slot stays unbuilt", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const root = await plantedTree(SHARED_TREE);
  const report = scanUnions({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ kind, home, member }) => ({ kind, home, member }))).toEqual([{ kind: "unbuilt", home: "KINDS_A", member: "shared" }]);
  expect(report.disagreements).toEqual([]);
});

// A slot belongs to a tuple by what its declaration spells, never by which literals its type happens to hold: a
// one-member union, a discriminated union and an independent subset tuple all hold a tuple's texts without being it.
const ORIGIN_TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/derived.ts": [
    'export const KINDS_V = ["v1", "v2", "v3"] as const;',
    "export type KindV = (typeof KINDS_V)[number];",
    'type Mixed = Exclude<KindV, "v3"> | "extra";',
    "export const takeMixed = (kind: Mixed): Mixed => kind;",
    'export const builtMixed = [takeMixed("v1"), takeMixed("v2"), takeMixed("extra")];',
  ].join("\n"),
  "packages/a/src/foreign.ts": [
    'export const KINDS_S = ["open", "mid"] as const;',
    "export type KindS = (typeof KINDS_S)[number];",
    "export const takeS = (kind: KindS): KindS => kind;",
    'export const builtS = takeS("mid");',
    'interface Evt { readonly kind: "open" }',
    'export const evt: Evt = { kind: "open" };',
    'export const KINDS_D = ["dopen", "dmid"] as const;',
    "export type KindD = (typeof KINDS_D)[number];",
    "export const takeD = (kind: KindD): KindD => kind;",
    'export const builtD = takeD("dmid");',
    'type Ev = { readonly t: "dopen"; readonly a: number } | { readonly t: "dclose"; readonly b: number };',
    'export const ev: Ev = { t: "dopen", a: 1 };',
  ].join("\n"),
  "packages/a/src/subset.ts": [
    'export const KINDS_T = ["a1", "b1", "c1"] as const;',
    "export type KindT = (typeof KINDS_T)[number];",
    'export const KINDS_U = ["a1", "b1"] as const;',
    "export type KindU = (typeof KINDS_U)[number];",
    "export const takeT = (kind: KindT): KindT => kind;",
    "export const takeU = (kind: KindU): KindU => kind;",
    'export const builtSubset = [takeU("a1"), takeU("b1"), takeT("c1")];',
  ].join("\n"),
  // A library signature declares `push`'s parameter, so the slot's tuple cannot be read and it rules no tuple out.
  "packages/a/src/unread.ts": [
    'export const KINDS_W = ["w1", "w2"] as const;',
    "export type KindW = (typeof KINDS_W)[number];",
    "export const bag: KindW[] = [];",
    'bag.push("w1");',
  ].join("\n"),
  // `gshared` is KINDS_H's: the Record key and the equality below read H's slot, so neither is evidence about G.
  "packages/a/src/records.ts": [
    'export const KINDS_G = ["gshared", "gown"] as const;',
    "export type KindG = (typeof KINDS_G)[number];",
    'export const KINDS_H = ["gshared", "hown"] as const;',
    "export type KindH = (typeof KINDS_H)[number];",
    "export const takeG = (kind: KindG): KindG => kind;",
    "export const takeH = (kind: KindH): KindH => kind;",
    'export const builtG = takeG("gown");',
    'export const builtH = [takeH("gshared"), takeH("hown")];',
    'export const LABELS: Record<KindH, string> = { gshared: "G", hown: "H" };',
    'export const isShared = (kind: KindH): boolean => kind === "gshared";',
  ].join("\n"),
};

test("the unions scan reads a slot's tuple from its declaration, so derived slots clear and foreign ones do not", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const root = await plantedTree(ORIGIN_TREE);
  const report = scanUnions({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const found = report.unwired
    .map(({ home, member, checks, keys }) => ({ home, member, checks, keys }))
    .toSorted((a, b) => `${a.home}.${a.member}`.localeCompare(`${b.home}.${b.member}`));
  expect(found).toEqual([
    { home: "KINDS_D", member: "dopen", checks: [], keys: [] },
    { home: "KINDS_G", member: "gshared", checks: [], keys: [] },
    { home: "KINDS_S", member: "open", checks: [], keys: [] },
    { home: "KINDS_T", member: "a1", checks: [], keys: [] },
    { home: "KINDS_T", member: "b1", checks: [], keys: [] },
    { home: "KINDS_V", member: "v3", checks: [], keys: [] },
    { home: "KINDS_W", member: "w2", checks: [], keys: [] },
  ]);
  expect(report.disagreements).toEqual([]);
});

// Slots whose type is not an annotation on the tuple, copied from the real tree. A construction through one of them
// builds the member, so the scan must not call it unbuilt: a schema-inferred property (`z.infer` of a `z.object`
// written from `z.enum(TUPLE)`), and a generated table whose `satisfies` type is generic over the tuples.
const SCHEMA_TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  // A library, outside the production sources, as zod is in the real tree.
  "packages/a/lib/zod.ts": [
    "export interface ZodType<T> { readonly output?: T; optional(): ZodType<T | undefined>; nullable(): ZodType<T | null> }",
    "const schema = <T>(): ZodType<T> => ({ optional: () => schema<T | undefined>(), nullable: () => schema<T | null>() });",
    "type Out<S> = { [K in keyof S]: S[K] extends ZodType<infer V> ? V : never };",
    "export const z = {",
    "  enum: <const T extends readonly [string, ...string[]]>(_values: T): ZodType<T[number]> => schema<T[number]>(),",
    "  array: <T>(_item: ZodType<T>): ZodType<T[]> => schema<T[]>(),",
    "  object: <S extends Record<string, ZodType<unknown>>>(_shape: S): ZodType<Out<S>> => schema<Out<S>>(),",
    "};",
    "export declare namespace z {",
    "  type infer<T> = T extends ZodType<infer V> ? V : never;",
    "}",
  ].join("\n"),
  "packages/a/src/capability.ts": [
    'import { z } from "../lib/zod.ts";',
    'export const OFF_MODES = ["disabled", "between-tools"] as const;',
    'export const STAGES = ["penalties", "dry", "xtc"] as const;',
    "const offModeSchema = z.enum(OFF_MODES);",
    "const stageSchema = z.enum(STAGES);",
    "export const entrySchema = z.object({ offMode: offModeSchema.optional(), order: z.array(stageSchema).optional() });",
    "export type Entry = z.infer<typeof entrySchema>;",
  ].join("\n"),
  "packages/a/src/curated.ts": [
    'import type { Entry } from "./capability.ts";',
    'export const ENTRY: Entry = { offMode: "between-tools", order: ["penalties", "dry"] };',
  ].join("\n"),
  // An interface slot typed through an indexed access on an inferred schema type, and a return type spelled the same way.
  "packages/a/src/probes.ts": [
    'import { z } from "../lib/zod.ts";',
    'const SERVERS = ["alpha", "beta"] as const;',
    'const PROVENANCES = ["fresh", "request"] as const;',
    "const detectedSchema = z.object({ server: z.enum(SERVERS).nullable() });",
    "export type Detected = z.infer<typeof detectedSchema>;",
    'export interface Probe { readonly server: NonNullable<Detected["server"]> }',
    'export const PROBES = [{ server: "alpha" }] as const satisfies readonly Probe[];',
    "const policySchema = z.object({ provenance: z.enum(PROVENANCES) });",
    "export type Policy = z.infer<typeof policySchema>;",
    'export const provenanceOf = (): Policy["provenance"] => "fresh";',
    // An unannotated constant carries its text to the slot it is read into; one that is only compared, or read into an
    // unrelated slot, builds nothing.
    'const MODES = ["quick", "deep"] as const;',
    "type Mode = (typeof MODES)[number];",
    "const takeMode = (mode: Mode): Mode => mode;",
    'const SWEEP = "quick";',
    "export const swept = takeMode(SWEEP);",
    'const LABEL = "deep";',
    "export const label: string = LABEL;",
    'const GHOST = "tooled";',
    "export const isGhost = (cause: string): boolean => cause === GHOST;",
    // The slot is a member read off an interface, and off one arm of a union of interfaces.
    'const CAUSES = ["denied", "unsupported", "tooled"] as const;',
    "type Cause = (typeof CAUSES)[number];",
    'interface Deny { readonly kind: "deny"; readonly cause: Cause }',
    'interface Other { readonly kind: "other"; readonly note: string }',
    "type Outcome = Deny | Other;",
    'export const deny = (cause: Deny["cause"]): Deny => ({ kind: "deny", cause });',
    'export const refused = deny("denied");',
    'export const causeOf = (): Extract<Outcome, { kind: "deny" }>["cause"] => "unsupported";',
  ].join("\n"),
  "packages/a/src/tones.ts": [
    'export const ROLES = ["solid", "solid-hover", "tint"] as const;',
    "export type Role = (typeof ROLES)[number];",
    'export const HOSTS = ["background", "card"] as const;',
    "export type Host = (typeof HOSTS)[number];",
    "interface Floor<R extends string, H extends string> { readonly role?: R; readonly host?: H }",
    "type Recipes<R extends string, H extends string> = Readonly<Record<R, { readonly floor: readonly Floor<R, H>[] }>>;",
    "export const RECIPES = {",
    '  "solid": { floor: [] },',
    '  "solid-hover": { floor: [{ role: "solid" }] },',
    '  "tint": { floor: [{ host: "card" }] },',
    "} as const satisfies Recipes<Role, Host>;",
  ].join("\n"),
};

test("the unions scan reads a schema-inferred slot and a generic generated table through to the tuples they are written from", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const root = await plantedTree(SCHEMA_TREE);
  const report = scanUnions({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const found = report.unwired.map(({ home, member }) => `${home}.${member}`).toSorted((a, b) => a.localeCompare(b));
  // between-tools, penalties and dry are built through the schema; ROLES.solid and HOSTS.card through the table; alpha
  // and fresh through an indexed access on an inferred type; denied and unsupported through one on an interface.
  expect(found).toEqual([
    "CAUSES.tooled",
    "HOSTS.background",
    "MODES.deep",
    "OFF_MODES.disabled",
    "PROVENANCES.request",
    "ROLES.solid-hover",
    "ROLES.tint",
    "SERVERS.beta",
    "STAGES.xtc",
  ]);
  expect(report.disagreements).toEqual([]);
});
