// `pnpm unwired unions` reports a tuple member no production literal builds into its union, with the branches, checks
// and Record keys that name it, and in its own list, with the site that parses outside input in, a tuple only a z.enum
// parse or a membership guard builds. A same-text literal
// in a plain string slot and an enumerated tuple are controls.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { JudgedEntry, UnionsReport } from "../../../tooling/src/unwired/index.ts";
import { unionsGraph } from "../../../tooling/src/unwired/index.ts";
import { graphTree, JUDGED_WORK, judgedExpected, judgedOutcome, LIB, plantJudged } from "./_planted.ts";

type Report = UnionsReport;

// The unions scan over a graph session of a planted tree.
async function scanUnions(
  plantedTree: (tree: Record<string, string>) => Promise<string>,
  files: Readonly<Record<string, string>>,
  judged: readonly JudgedEntry[] = [],
): Promise<Report> {
  return await unionsGraph(await plantedTree(graphTree(files)), { deliberate: [], judged }, () => undefined);
}

const TREE = {
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

// snap uses the product as its user does: a literal it writes into a product tuple's slot builds the member, and its own
// tuples are never judged. Any other tooling literal builds nothing.
const DRIVEN = {
  "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tooling" }] }),
  "tooling/tsconfig.json": plantedTsconfig({ lib: LIB, include: ["src"] }),
  "packages/a/src/view.ts": [
    'export const VIEWS = ["grid", "list", "table"] as const;',
    "export type View = (typeof VIEWS)[number];",
    "export const show = (view: View): View => view;",
    'export const shown = show("grid");',
  ].join("\n"),
  "tooling/src/snap/drive.ts": [
    'import { show } from "../../../packages/a/src/view.ts";',
    'export const driven = show("list");',
    'export const PACES = ["fast", "slow"] as const;',
  ].join("\n"),
  "tooling/src/other/drive.ts": ['import { show } from "../../../packages/a/src/view.ts";', 'export const other = show("table");'].join("\n"),
};

test("a snap literal builds a product member, a snap tuple is not judged, and another tooling literal builds nothing", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await scanUnions(plantedTree, DRIVEN);
  expect(report.unwired.map(({ home, member }) => `${home}.${member}`)).toEqual(["VIEWS.table"]);
});

test("the unions scan reports an unbuilt member with its dead branch, check and key, marks a parsed vocabulary apart, and skips an enumerated tuple", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, TREE);
  expect(report.unwired.map(({ kind, home, member, cases, checks, keys }) => ({ kind, home, member, cases, checks, keys }))).toEqual([
    {
      kind: "unbuilt",
      home: "MODES",
      member: "auto",
      cases: ["packages/a/src/mode.ts:7"],
      checks: ["packages/a/src/mode.ts:14"],
      keys: ["packages/a/src/mode.ts:13"],
    },
  ]);
  expect(report.parsed.map(({ home, member, checks, sources }) => ({ home, member, checks, sources }))).toEqual([
    { home: "TARGETS", member: "x64", checks: [], sources: ["membership test packages/a/src/mode.ts:16"] },
    { home: "TARGETS", member: "arm64", checks: [], sources: ["membership test packages/a/src/mode.ts:16"] },
    { home: "TONES", member: "warm", checks: ["packages/a/src/tone.ts:5"], sources: ["z.enum packages/a/src/tone.ts:4"] },
    { home: "TONES", member: "cold", checks: [], sources: ["z.enum packages/a/src/tone.ts:4"] },
  ]);
  expect(report.enumerated).toEqual(["packages/a/src/mode.ts:SIZES"]);
});

// A tuple element read from a constant is the member its type names: `CODE.clamped` is `knob_clamped`, which nothing
// builds, and `CODE.dropped` is `knob_dropped`, which a literal builds in the tuple's slot. `LOOSE` is the control: an
// element typed `string` names no member, so the tuple stays out and its `loose` is never judged.
const CONSTANT_TREE = {
  "packages/a/src/codes.ts": 'export const CODE = { dropped: "knob_dropped", clamped: "knob_clamped", spare: "knob_spare" } as const;',
  "packages/a/src/kinds.ts": [
    'import { CODE } from "./codes.ts";',
    "export const KINDS = [",
    "  CODE.dropped,",
    "  CODE.clamped,",
    '  "own",',
    "] as const;",
    "export type Kind = (typeof KINDS)[number];",
    "export const take = (kind: Kind): Kind => kind;",
    'export const built = [take("knob_dropped"), take("own")];',
    'export const title: string = "t";',
    'export const LOOSE = [title, "loose"] as const;',
    "export const takeLoose = (kind: (typeof LOOSE)[number]): string => kind;",
  ].join("\n"),
};

test("the unions scan reads a tuple element built from a constant as the literal its type names, and still skips a tuple with a string-typed element", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, CONSTANT_TREE);
  expect(report.unwired.map(({ kind, home, member, file, line }) => ({ kind, home, member, file, line }))).toEqual([
    { kind: "unbuilt", home: "KINDS", member: "knob_clamped", file: "packages/a/src/kinds.ts", line: 4 },
  ]);
  expect(report.scanned).toBe(1);
});

// Construction evidence belongs to the vocabulary whose slot it lands in. `KINDS_A` and `KINDS_B` share the text
// `shared`; only `KINDS_B`'s slot is ever built with it. The remaining tuples are controls that must clear: a slot
// that unions two vocabularies builds `dual` in both, and a slot derived from one tuple builds its own member.
const SHARED_TREE = {
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
  const report = await scanUnions(plantedTree, SHARED_TREE);
  expect(report.unwired.map(({ kind, home, member }) => ({ kind, home, member }))).toEqual([{ kind: "unbuilt", home: "KINDS_A", member: "shared" }]);
});

// A slot belongs to a tuple by what its declaration spells, never by which literals its type happens to hold: a
// one-member union, a discriminated union and an independent subset tuple all hold a tuple's texts without being it.
const ORIGIN_TREE = {
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
  const report = await scanUnions(plantedTree, ORIGIN_TREE);
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
});

// Slots whose type is not an annotation on the tuple, copied from the real tree. A construction through one of them
// builds the member, so the scan must not call it unbuilt: a schema-inferred property (`z.infer` of a `z.object`
// written from `z.enum(TUPLE)`), and a generated table whose `satisfies` type is generic over the tuples.
const SCHEMA_TREE = {
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
  const report = await scanUnions(plantedTree, SCHEMA_TREE);
  const listed = (rows: Report["unwired"]): string[] => rows.map(({ home, member }) => `${home}.${member}`).toSorted((a, b) => a.localeCompare(b));
  // between-tools, penalties and dry are built through the schema; ROLES.solid and HOSTS.card through the table; alpha
  // and fresh through an indexed access on an inferred type; denied and unsupported through one on an interface.
  expect(listed(report.unwired)).toEqual(["CAUSES.tooled", "HOSTS.background", "MODES.deep", "ROLES.solid-hover", "ROLES.tint"]);
  expect(listed(report.parsed)).toEqual(["OFF_MODES.disabled", "PROVENANCES.request", "SERVERS.beta", "STAGES.xtc"]);
});

// A literal type that re-spells a member builds it once the scan links that type to the tuple: the tuple `satisfies` a
// type that writes it, or a value typed by it feeds the tuple's slot as an element-access key or an argument. Each
// tuple keeps one member nothing builds, and `Ev` in the ORIGIN tree above stays the unlinked control.
const LINKED_TREE = {
  "packages/a/src/events.ts": [
    // A generic member type beside the discriminant: the link reads past its type parameter.
    "type Brand<T, B extends string> = T & { readonly brand: B };",
    'interface Made { readonly type: "made"; readonly id: Brand<number, "made-id"> }',
    'type Gone = { readonly type: "gone"; readonly id: number };',
    "type Ev = Made | Gone;",
    'export const EVENT_TYPES = ["made", "gone"] as const satisfies readonly Ev["type"][];',
    "export const emit = (event: Ev): Ev => event;",
    'export const made = emit({ type: "made", id: 1 });',
  ].join("\n"),
  "packages/a/src/spans.ts": [
    'type Span = { readonly kind: "text"; readonly t: string } | { readonly kind: "dice"; readonly n: number };',
    'const SPAN_KINDS = ["text", "dice", "unused"] as const;',
    "type SpanKind = (typeof SPAN_KINDS)[number];",
    "const POLICY: Record<SpanKind, number> = { text: 1, dice: 2, unused: 3 };",
    "export const policyOf = (span: Span): number => POLICY[span.kind];",
    'export const spans: readonly Span[] = [{ kind: "text", t: "a" }, { kind: "dice", n: 2 }];',
  ].join("\n"),
  "packages/a/src/phases.ts": [
    'const PHASES = ["recalling", "recalled", "skipped"] as const;',
    "type Phase = (typeof PHASES)[number];",
    'type Recall = { readonly type: "recall"; readonly phase: "recalling" } | { readonly type: "recall"; readonly phase: "recalled" };',
    "const shown: Phase[] = [];",
    "export const setPhase = (phase: Phase): number => shown.push(phase);",
    "export const apply = (event: Recall): number => setPhase(event.phase);",
    'export const opened = (emit: (event: Recall) => void): void => emit({ type: "recall", phase: "recalling" });',
    'export const closed = (emit: (event: Recall) => void): void => emit({ type: "recall", phase: "recalled" });',
  ].join("\n"),
};

test("the unions scan builds a member through a literal type the tuple satisfies or whose value feeds the tuple's slot", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, LINKED_TREE);
  const found = report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`).toSorted((a, b) => a.localeCompare(b));
  expect(found).toEqual(["unbuilt EVENT_TYPES.gone", "unbuilt PHASES.skipped", "unbuilt SPAN_KINDS.unused"]);
});

// Production uses a member without a literal in the tuple's slot: a `Record` entry read by name, a switch that hands
// the narrowed value on, an enumerated subset handed whole into the parent's slot, and a module-private constant whose
// property or spread reaches the slot. Each tuple keeps one member nothing builds; `LOOSE` is exported, so its literal
// reaches no readable slot and builds nothing.
const UNSPELLED_TREE = {
  "packages/a/src/floors.ts": [
    'const STAGES = ["warm", "cold", "idle"] as const;',
    "type Stage = (typeof STAGES)[number];",
    "const FLOOR = { warm: 1, cold: 2, idle: 3 } as const satisfies Record<Stage, number>;",
    'export const floors = [FLOOR.warm, FLOOR["cold"]];',
  ].join("\n"),
  "packages/a/src/adjust.ts": [
    'const CODES = ["a_dropped", "b_dropped", "c_kept"] as const;',
    "type Code = (typeof CODES)[number];",
    'const ADJUSTMENTS = ["a_dropped", "b_dropped", "z_never"] as const;',
    "type Adjustment = (typeof ADJUSTMENTS)[number];",
    "export const takeCode = (code: Code): Code => code;",
    'export const codes = [takeCode("a_dropped"), takeCode("b_dropped"), takeCode("c_kept")];',
    "export function adjust(code: Code): { readonly adjustment: Adjustment } | null {",
    "  switch (code) {",
    '    case "a_dropped":',
    '    case "b_dropped":',
    "      return { adjustment: code };",
    "    default:",
    "      return null;",
    "  }",
    "}",
  ].join("\n"),
  "packages/a/src/sources.ts": [
    'const SOURCES = ["global", "theme", "inline", "dead"] as const;',
    "type Source = (typeof SOURCES)[number];",
    "interface Expect { readonly sources: readonly Source[] }",
    'const THEMED = ["theme", "inline"] as const satisfies readonly Source[];',
    'export const EXPECT: readonly Expect[] = [{ sources: THEMED }, { sources: ["global"] }];',
  ].join("\n"),
  "packages/a/src/carriers.ts": [
    'const PLANES = ["root", "grid", "shell", "scope", "unused_plane"] as const;',
    "type Plane = (typeof PLANES)[number];",
    "interface Carrier { readonly carriers: readonly Plane[]; readonly owner: string }",
    'const ROOT = { carriers: ["root"] } as const;',
    'export const CARRIERS: readonly Carrier[] = [{ owner: "a", ...ROOT }];',
    'const GRID = { carriers: ["grid"] } as const;',
    "export const gridPlanes: readonly Plane[] = GRID.carriers;",
    'export const LOOSE = { carriers: ["unused_plane"] } as const;',
    // A mapped type's key types the slot: it ranges over the tuple and no caller instantiates it.
    "type Pairing = { readonly [P in Plane]: { readonly carriers: readonly [P, ...Plane[]] } }[Plane];",
    'type Manifest = { readonly [K in "a" | "b" | "c"]: Pairing & { readonly owner: string } };',
    'const SHELL = { carriers: ["shell"] } as const;',
    "const SHELL_OWNED = { ...SHELL, x: 1 } as const;",
    'const SCOPE = { carriers: ["scope"] } as const;',
    'export const MANIFEST = { a: { owner: "o", ...SHELL_OWNED }, b: { owner: "o", ...SCOPE }, c: { owner: "o", carriers: ["root"] } } as const satisfies Manifest;',
  ].join("\n"),
};

test("the unions scan builds a member a Record entry read, a switch pass-through, an enumerated subset or a constant's property reaches", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, UNSPELLED_TREE);
  const found = report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`).toSorted((a, b) => a.localeCompare(b));
  expect(found).toEqual(["unbuilt ADJUSTMENTS.z_never", "unbuilt PLANES.unused_plane", "unbuilt SOURCES.dead", "unbuilt STAGES.idle"]);
  expect(report.enumerated).toEqual(["packages/a/src/sources.ts:THEMED"]);
});

// A tuple a lib key selection names lists property keys, never values: it is listed apart and none of its members is
// judged. `MODES` beside it is a value vocabulary and keeps its unbuilt member.
const KEYS_TREE = {
  "packages/a/src/props.ts": [
    "interface Props { readonly size: number; readonly tone: string; readonly label: string }",
    'const LOOK = ["size", "tone"] as const;',
    "type LookKey = (typeof LOOK)[number];",
    "export type Rest = Omit<Props, LookKey>;",
    'const PICKED = ["label", "tone"] as const;',
    'export type Picked = Pick<Props, Exclude<(typeof PICKED)[number], "tone">>;',
    'const JSON_FIELDS = ["tone"] as const;',
    "type JsonField = (typeof JSON_FIELDS)[number];",
    "export type Stored = Pick<Props, Exclude<keyof Props, JsonField>> & Record<JsonField, string>;",
    'const MODES = ["x", "y"] as const;',
    "type Mode = (typeof MODES)[number];",
    'export const mode: Mode = "x";',
  ].join("\n"),
};

test("the unions scan lists a tuple a Pick, Omit or keyof filter names as a key list and judges none of its members", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, KEYS_TREE);
  expect(report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`)).toEqual(["unbuilt MODES.y"]);
  expect(report.keyLists).toEqual(["packages/a/src/props.ts:JSON_FIELDS", "packages/a/src/props.ts:LOOK", "packages/a/src/props.ts:PICKED"]);
});

// A type guard that narrows a raw string into the tuple lets outside input produce any member, so its members sort as
// parsed. A guard over an in-tree union narrows nothing from outside: `SHAPES` stays unbuilt.
const GUARD_TREE = {
  "packages/a/src/cli.ts": [
    'const COMMANDS = ["build", "pack"] as const;',
    "type Command = (typeof COMMANDS)[number];",
    "function isCommand(value: string | undefined): value is Command {",
    '  return value === "build" || value === "pack";',
    "}",
    "export const run = (argv: string | undefined): Command | null => (isCommand(argv) ? argv : null);",
    'const SHAPES = ["round", "square"] as const;',
    "type Shape = (typeof SHAPES)[number];",
    "type Drawn = { readonly shape: Shape } | { readonly other: true };",
    'export const isShaped = (node: Drawn): node is { readonly shape: Shape } => "shape" in node;',
  ].join("\n"),
};

test("the unions scan sorts a tuple a type guard narrows raw input into as parsed, and not one an in-tree guard narrows", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, GUARD_TREE);
  expect(report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`)).toEqual(["unbuilt SHAPES.round", "unbuilt SHAPES.square"]);
  expect(report.parsed.map(({ home, member, sources }) => `${home}.${member} ${sources.join(",")}`)).toEqual([
    "COMMANDS.build type guard packages/a/src/cli.ts:3",
    "COMMANDS.pack type guard packages/a/src/cli.ts:3",
  ]);
});

// The credit rules link only what the slot holds. A literal type of a sibling property is another vocabulary, whether the
// tuple satisfies an indexed access of the type or a property feeds its slot; and a switch over a value already typed by
// the tuple hands on nothing production built. Each tuple keeps the member only those forms reach.
const NARROW_TREE = {
  "packages/a/src/kinds.ts": [
    'export const KINDS = ["live", "legacy"] as const;',
    "export type Kind = (typeof KINDS)[number];",
    "export const take = (kind: Kind): Kind => kind;",
    'export const built = take("live");',
    "export function route(kind: Kind): Kind {",
    "  switch (kind) {",
    '    case "legacy":',
    "      return take(kind);",
    "    default:",
    "      return kind;",
    "  }",
    "}",
  ].join("\n"),
  "packages/a/src/jobs.ts": [
    'interface Job { readonly phase: "queued" | "done"; readonly result: "done" | "failed" }',
    'export const PHASES = ["queued", "done"] as const satisfies readonly Job["phase"][];',
    "export type Phase = (typeof PHASES)[number];",
    "export const takePhase = (phase: Phase): Phase => phase;",
    'export const queued = takePhase("queued");',
    'export const outcome: Job["result"] = "done";',
    'export const job: Job = { phase: "queued", result: "done" };',
  ].join("\n"),
  "packages/a/src/faces.ts": [
    'export const SPAN_KINDS = ["text", "dice"] as const;',
    "export type SpanKind = (typeof SPAN_KINDS)[number];",
    "export const takeKind = (kind: SpanKind): SpanKind => kind;",
    'interface Span { readonly kind: "text" | "dice"; readonly face: "dice" | "coin" }',
    "export const feed = (span: Span): SpanKind => takeKind(span.kind);",
    'export const t: Span = { kind: "text", face: "coin" };',
    'export const face: Span["face"] = "dice";',
  ].join("\n"),
};

test("the unions scan credits no member through a sibling property's literal types or a switch over the tuple's own type", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, NARROW_TREE);
  const found = report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`).toSorted((a, b) => a.localeCompare(b));
  expect(found).toEqual(["unbuilt KINDS.legacy", "unbuilt PHASES.done", "unbuilt SPAN_KINDS.dice"]);
});

// A literal handed whole into its slot through a `??` fallback builds the member there, even when the callee is
// overloaded: `unexpected` reaches the constructor's `kind` only as the right operand. `stale` is the twin: the same
// fallback into a plain `string` slot builds nothing, so it still reports.
const FALLBACK_TREE = {
  "packages/a/src/refused.ts": [
    'const KINDS = ["signedOut", "redirected", "unexpected", "stale"] as const;',
    "type Kind = (typeof KINDS)[number];",
    "class Refused {",
    "  readonly kind: Kind;",
    '  constructor(kind: Exclude<Kind, "redirected">, note: string);',
    '  constructor(kind: Extract<Kind, "redirected">, note: string, to: string);',
    "  constructor(kind: Kind, note: string) {",
    '    this.kind = note === "" ? kind : kind;',
    "  }",
    "}",
    'const KIND_OF: ReadonlyMap<number, Exclude<Kind, "redirected" | "unexpected" | "stale">> = new Map();',
    'export const refuse = (status: number): Refused => new Refused(KIND_OF.get(status) ?? "unexpected", "n");',
    'export const signedOut = (): Refused => new Refused("signedOut", "n");',
    'export const redirected = (): Refused => new Refused("redirected", "n", "u");',
    'export const note = (text: string | undefined): string => text ?? "stale";',
  ].join("\n"),
};

test("the unions scan builds a member a `??` fallback hands into its slot, and not one it hands into a string slot", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, FALLBACK_TREE);
  expect(report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`)).toEqual(["unbuilt KINDS.stale"]);
});

// A generic call infers its type parameter from the literal itself, so the slot the checker reports is the literal's
// own type. The vocabulary is the type parameter's constraint: `book` lands in `Knob.entity` through `define`'s
// constraint, and a library column whose name parameter extends `string` holds no tuple, so it builds neither
// `iteration` nor `card`. `quick` and `shelf` are controls: a constraint spelled from the tuple builds the one, and a
// descriptor typed by its own type parameter the other.
const INFERRED_TREE = {
  // A library, outside the production sources, as drizzle is in the real tree.
  "packages/a/lib/db.ts": "export declare function integer<TName extends string>(name: TName): { readonly name: TName };",
  "packages/a/src/presets.ts": [
    'const ENTITY_KINDS = ["book", "card", "shelf"] as const;',
    "type EntityKind = (typeof ENTITY_KINDS)[number];",
    'interface Knob { readonly kind: "entityRef"; readonly entity: EntityKind; readonly label: string }',
    "type KnobSchema = Readonly<Record<string, Knob>>;",
    "interface Def<T extends KnobSchema = KnobSchema> { readonly name: string; readonly knobs: T }",
    "const define = <T extends KnobSchema>(def: Def<T>): Def<T> => def;",
    'export const PRESET = define({ name: "p", knobs: { bookId: { kind: "entityRef", entity: "book", label: "Book" } } });',
    // The descriptor's own type parameter types the property, so the slot is read no further and rules no tuple out.
    'interface RefKnob<E extends EntityKind = EntityKind> { readonly kind: "ref"; readonly entity: E }',
    "const defineRefs = <const T extends Readonly<Record<string, RefKnob>>>(knobs: T): T => knobs;",
    'export const REFS = defineRefs({ shelfId: { kind: "ref", entity: "shelf" } });',
  ].join("\n"),
  "packages/a/src/modes.ts": [
    'import { integer } from "../lib/db.ts";',
    'const MODES = ["full", "iteration", "quick"] as const;',
    "type Mode = (typeof MODES)[number];",
    "export const take = (mode: Mode): Mode => mode;",
    "export const pick = <const M extends Mode>(mode: M): M => mode;",
    'export const built = [take("full"), pick("quick")];',
    'export const columns = [integer("iteration"), integer("card")];',
  ].join("\n"),
};

test("the unions scan reads a slot a generic call infers from the literal through the type parameter's constraint", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, INFERRED_TREE);
  const found = report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`).toSorted((a, b) => a.localeCompare(b));
  expect(found).toEqual(["unbuilt ENTITY_KINDS.card", "unbuilt MODES.iteration"]);
});

// A module-private constant spread into rows a `.map` callback returns, and the whole array `satisfies` the row type
// written from a schema: `breakpoint` reaches `turns.format` there. `control` is the twin: only a callback whose callee
// returns a count carries it, so nothing builds it.
const MAPPED_TREE = {
  "packages/a/src/rows.ts": [
    'const FORMATS = ["control", "breakpoint"] as const;',
    "type Format = (typeof FORMATS)[number];",
    "interface Turns { readonly format?: Format; readonly on: boolean }",
    'interface Row { readonly provider: "x" | "y"; readonly turns: Turns }',
    'const EXPLICIT = { format: "breakpoint", on: true } as const;',
    "export const ROWS = [",
    '  ...(["x", "y"] as const).map((provider) => ({ provider, turns: EXPLICIT }) as const),',
    "] as const satisfies readonly Row[];",
    // The twin: this callee returns no list of the callback's type parameter, so the callback's value reaches no slot.
    'const HIDDEN = { format: "control", on: false } as const;',
    "const count = <U>(make: () => U): number => (make() === undefined ? 0 : 1);",
    "export const counted = count(() => ({ turns: HIDDEN }));",
  ].join("\n"),
};

test("the unions scan follows a constant a mapped row carries into the slot the array satisfies", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, MAPPED_TREE);
  expect(report.unwired.map(({ kind, home, member }) => `${kind} ${home}.${member}`)).toEqual(["unbuilt FORMATS.control"]);
});

// Two rows the unions judge confirmed as true findings, in their shapes: a member only a `Record` annotated with the
// tuple's type keys (`opening`), and a member no manifest row lists while a second vocabulary spells the same text
// (`dynamic`). Neither is built, and each keeps its key.
const TRUE_TREE = {
  "packages/a/src/turns.ts": [
    'const TURN_KINDS = ["send", "swipe", "opening"] as const;',
    "export type TurnKind = (typeof TURN_KINDS)[number];",
    "export interface Turn { readonly kind: TurnKind }",
    "export const OPENS_TAIL: Readonly<Record<TurnKind, boolean>> = { send: false, swipe: true, opening: true };",
    'export const turns: readonly Turn[] = [{ kind: "send" }, { kind: "swipe" }];',
  ].join("\n"),
  "packages/a/src/cascade.ts": [
    'const CASCADE_SOURCES = ["client-global", "dynamic", "inline"] as const;',
    "type CascadeSource = (typeof CASCADE_SOURCES)[number];",
    "interface Cascade { readonly selector: string; readonly sources: readonly CascadeSource[] }",
    'export const ROWS: readonly Cascade[] = [{ selector: "a", sources: ["client-global"] }, { selector: "b", sources: ["inline"] }];',
    'export const OBSERVED = ["dynamic", "inline"] as const;',
    "export const observe = (source: (typeof OBSERVED)[number]): string => source;",
    'export const seen = [observe("dynamic"), observe("inline")];',
  ].join("\n"),
};

test("the unions scan still reports the members the judge confirmed unbuilt: a Record-keyed-only member and one only a second vocabulary builds", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const report = await scanUnions(plantedTree, TRUE_TREE);
  expect(report.unwired.map(({ kind, home, member, keys }) => ({ kind, home, member, keys }))).toEqual([
    { kind: "unbuilt", home: "CASCADE_SOURCES", member: "dynamic", keys: [] },
    { kind: "unbuilt", home: "TURN_KINDS", member: "opening", keys: ["packages/a/src/turns.ts:4"] },
  ]);
});

// A row whose fix an open item owns reports apart, with its item; an entry whose item is done or whose row no longer
// reports is stale, and the done item's row reports as unwired again.
test("a judged row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = { ...ORIGIN_TREE, ...JUDGED_WORK };
  const judged = plantJudged(await scanUnions(plantedTree, files), "KINDS_D.dopen", "KINDS_G.gshared");
  expect(judgedOutcome(await scanUnions(plantedTree, files, judged), "KINDS_D.dopen", "KINDS_G.gshared")).toEqual(
    judgedExpected("KINDS_D.dopen", "KINDS_G.gshared"),
  );
});
