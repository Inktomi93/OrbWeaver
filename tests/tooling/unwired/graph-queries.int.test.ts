// The graph's queries and its spelling passes. A query walks the use edges until its seen-set is spent, so a cycle
// ends it, and it answers the same from a dump as from a fresh build; a registry site that names nothing is stale; an
// inline axis is placed against its homes; and a lost read is broken down by where its key came from.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { SyntaxKind } from "@typescript/native/ast";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import type { GraphOptions, QueryAnswer } from "../../../tooling/src/unwired/index.ts";
import { DEFAULT_LIBRARY, FRESH_BUILD, QUERIES, queryGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree, labelsIn, WORLD } from "./_planted.ts";

const A = `${GRAPH_SOURCE}/a.ts`;
const B = `${GRAPH_SOURCE}/b.ts`;
const C = `${GRAPH_SOURCE}/c.ts`;
const PROBE = "tooling/src/probe.ts";
const quiet = (): undefined => undefined;
// A planted template literal type's `${P}`, built so this file's own strings hold no placeholder.
const TEMPLATE_P = ["$", "{P}"].join("");

// `c.ts`, the one entry, runs `top`, which reaches `base` through `b.ts`; `f` and `g` call each other and only a
// tooling file outside the product runs `f`.
const CHAIN = {
  [A]: "export const base = 1;\nexport const f = (): number => g();\nconst g = (): number => f() + base;",
  [B]: 'import { base } from "./a.ts";\nexport const mid = (): number => base;',
  [C]: 'import { mid } from "./b.ts";\nexport const top = (): number => mid();\ntop();',
  "tsconfig.world-browser.json": JSON.stringify({ extends: `./${WORLD}`, include: [PROBE] }),
  [PROBE]: `import { f } from "../../${A}";\nf();`,
};

const shape = (answer: QueryAnswer): readonly unknown[] => {
  switch (answer.query) {
    case "users":
    case "reach":
      return answer.nodes.map(({ label, depth }) => [depth, label]);
    case "impact":
      return [answer.files.map(({ file, product }) => [file, product]), answer.roots];
    case "why":
      return answer.chains.map(({ start, path }) => [start.split(" (")[0], path.map(({ label }) => label)]);
  }
};

test("each query answers every name, ends on a cycle, and answers a dump as it answers a build", { timeout: 120_000 }, async ({ plantedTree, scratch }) => {
  const root = await plantedTree(graphTree(CHAIN, { entries: [C] }));
  const dump = join(scratch, "graph.dump");
  const ask = async (query: (typeof QUERIES)[number], options: GraphOptions): Promise<readonly (readonly unknown[])[]> =>
    (await queryGraph(root, { query, names: ["base", "f"] }, quiet, options)).answers.map(shape);
  expect(await ask("why", { ...FRESH_BUILD, dump })).toEqual([[[C, [`${C}:2 top`, `${B}:2 mid`, `${A}:1 base`]]], [[PROBE, [`${A}:2 f`]]]]);
  expect(await ask("users", FRESH_BUILD)).toEqual([
    [
      [1, `${A}:3 g`],
      [1, `${B}:2 mid`],
      [2, `${A}:2 f`],
      [2, `${C}:2 top`],
      [3, C],
      [3, PROBE],
    ],
    [
      [1, `${A}:3 g`],
      [1, PROBE],
    ],
  ]);
  expect((await ask("impact", FRESH_BUILD))[0]).toEqual([
    [
      [A, true],
      [B, true],
      [C, true],
      [PROBE, false],
    ],
    [`${C} (product)`],
  ]);
  expect((await ask("reach", FRESH_BUILD))[1]).toEqual([
    [1, A],
    [1, `${A}:3 g`],
    [2, `${A}:1 base`],
  ]);
  for (const query of QUERIES) {
    expect(await ask(query, { ...FRESH_BUILD, from: dump })).toEqual(await ask(query, FRESH_BUILD));
  }
});

test("a registry site whose file declares no such name, or whose op has no server domain, is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const rules = "tooling/src/eslint/rules.ts";
  const scan = await graphScan(plantedTree, {
    [A]: "export const base = 1;",
    "packages/server/src/domain/chat/claim.ts": "export const claimStatement = 1;\nexport const emit = (afterStatement: number): number => afterStatement;",
    "tsconfig.world-browser.json": JSON.stringify({ extends: `./${WORLD}`, include: [rules] }),
    [rules]: [
      `const HOME = "${A}";`,
      'export const live = { path: HOME, name: "base" };',
      'export const gone = { path: HOME, name: "removed" };',
      'export const ops = [{ owner: "chat", op: "claimStatement" }, { owner: "chat", op: "afterStatement" }, { owner: "nowhere", op: "claimStatement" }, { owner: "chat", op: "dropped" }];',
    ].join("\n"),
  });
  expect(scan.analysis["registry-stale"].map(({ label, note }) => [label, note])).toEqual([
    [`${rules}:3 ${A} removed`, `${A} declares no removed`],
    [`${rules}:4 nowhere claimStatement`, "no server domain nowhere"],
    [`${rules}:4 chat dropped`, "no server declaration dropped"],
  ]);
});

test("an inline axis re-spells a home, slices one, or repeats with no home; a key list and a one-off are no axis", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(plantedTree, {
    [A]: [
      'export const FOUR = ["w", "x", "y", "z"] as const;',
      'export type Three = "p" | "q" | "r";',
      'export interface Same { readonly kind: "p" | "q" | "r" }',
      'export interface Slice { readonly mode: "w" | "x" | "y" }',
      'export interface Twice { readonly a: "m" | "n" | "o"; readonly b: "m" | "n" | "o" }',
      'export interface Once { readonly c: "s" | "t" | "u" }',
      "export interface Obj { readonly k1: string; readonly k2: string; readonly k3: string }",
      'export type Picked = Pick<Obj, "k1" | "k2" | "k3">;',
      'export const KEYS = ["k1", "k2", "k3"] as const;',
    ].join("\n"),
  });
  const placed = (bucket: "union-re-spells-a-home" | "union-slice-of-a-home" | "union-repeated-no-home"): readonly string[] => labelsIn(scan, bucket, A);
  expect(placed("union-re-spells-a-home")).toEqual(["3 kind [p, q, r]"]);
  expect(placed("union-slice-of-a-home")).toEqual(["4 mode [w, x, y]"]);
  expect(placed("union-repeated-no-home")).toEqual(["5 a [m, n, o]", "5 b [m, n, o]"]);
});

test("explain-lost breaks the lost reads down by key source and slot, and the library-landed reads by library", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const lost = `${GRAPH_SOURCE}/lost.ts`;
  const root = await plantedTree(
    graphTree({
      "node_modules/fakelib/package.json": JSON.stringify({ name: "fakelib", types: "index.d.ts" }),
      "node_modules/fakelib/index.d.ts": "export interface Box { readonly held: number }\nexport declare const box: Box;",
      [lost]: [
        'export const XYZ = ["x", "y", "z"] as const;',
        "declare function make<K extends string>(keys: readonly K[]): { [P in K]: number };",
        'export const fromList = make(["x", "y", "z"]).x;',
        `declare const renamed: { [P in "p" | "q" | "r" as \`get${TEMPLATE_P}\`]: number };`,
        "export const fromTemplate = renamed.getp;",
        'import { box, type Box } from "fakelib";',
        "export const held = box.held;",
        'declare const both: (Box & Record<"k", number>) | undefined;',
        "export const heldOfBoth = both?.held;",
        "export const keyOfBoth = both?.k;",
        "declare const text: string | undefined;",
        "export const size = text?.length;",
      ].join("\n"),
    }),
  );
  const { session } = await queryGraph(root, { query: "users", names: ["XYZ"] }, quiet, { ...FRESH_BUILD, explainLost: true });
  expect(session.lost?.bySource).toEqual({ "named-union": 0, "inline-union": 1, "no-literal-key": 1 });
  expect(session.lost?.unions.map(({ alias, members, reads, homes }) => [alias, members, reads, homes])).toEqual([
    [null, ["x", "y", "z"], 1, [`${lost}:1 XYZ`]],
  ]);
  expect(
    session.lost?.bySlot.map(({ slot, detail, reads, receivers }) => [slot, detail, reads, receivers.map(({ receiver, reads: held }) => [receiver, held])]),
  ).toEqual([["mapped-member", null, 2, [[`__type ${lost}`, 2]]]]);
  // `text?.length`: the string branch stops at the default library's `String` and the undefined branch runs out of
  // types, so the read is the library's, not lost
  expect(session.lost?.library.byLibrary.map(({ library, reads, members }) => [library, reads, members.map(({ member, sample }) => [member, sample])])).toEqual(
    [
      ["fakelib", 2, [["held", `${lost}:7`]]],
      [DEFAULT_LIBRARY, 1, [["length", `${lost}:12`]]],
    ],
  );
  expect((await queryGraph(root, { query: "users", names: ["XYZ"] }, quiet)).session.lost).toBeNull();
});

test("a lost key set is followed to the tree's spelling or to the library that spells it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const hops = `${GRAPH_SOURCE}/hops.ts`;
  const source = [
    'import { env, params } from "fakelib";',
    'import { z } from "zod";',
    "declare function budgets<const K extends string>(bases: Readonly<Record<K, number>>): Readonly<Record<K, number>>;",
    "const CEILINGS = budgets({ ready: 1 });",
    "export const fromCall = CEILINGS.ready;",
    'export const HOSTS = ["m", "n", "o"] as const;',
    "export type Palette<Host extends string> = { readonly hosts: Readonly<Record<Host, number>> } & { readonly tag: string };",
    "declare const palette: Palette<(typeof HOSTS)[number]>;",
    "export const fromHolder = palette.hosts.m;",
    "declare function paletteOf(): Palette<(typeof HOSTS)[number]>;",
    "const inferred = paletteOf();",
    "export const fromInferredHolder = inferred.hosts.o;",
    "declare function seats(): { readonly seat: Record<(typeof HOSTS)[number], number> };",
    "const { seat } = seats();",
    "export const fromBinding = seat.n;",
    'export const PORTS: Readonly<Record<"one" | "two", number>> = { one: 1, two: 2 };',
    "export interface Run { readonly stacks: typeof PORTS }",
    "declare const run: Run;",
    "export const fromQuery = run.stacks.one;",
    'const DEFAULTS: Record<"temp" | "topP", string> = { temp: "t", topP: "p" };',
    'declare const overrides: Partial<Record<"temp" | "topP", string>>;',
    "const merged = { ...DEFAULTS, ...overrides };",
    "export const fromSpread = merged.temp;",
    'export interface Config { readonly output: "narrator" | "per-speaker" | "roster" }',
    'const LABELS: Record<Config["output"], string> = { narrator: "a", "per-speaker": "b", roster: "c" };',
    "export const fromMember = LABELS.narrator;",
    'export const TASKS = ["chat", "embed", "rerank"] as const;',
    "type Task = (typeof TASKS)[number];",
    'type Routable = { [T in Task]: T extends "rerank" ? never : T }[Task];',
    "const ROUTES: Record<Routable, number> = { chat: 1, embed: 2 };",
    "export const fromIndexedMapped = ROUTES.chat;",
    'export const KINDS = ["web", "wiki", "youtube"] as const;',
    "const kindSchema = z.enum(KINDS);",
    'const FAILURE: Record<z.infer<typeof kindSchema>, string> = { web: "a", wiki: "b", youtube: "c" };',
    "export const fromSchema = FAILURE.web;",
    'declare function rowCounts(): Promise<Readonly<Record<"chats" | "cards" | "docs", number>>>;',
    "export const fromAwait = async (): Promise<number> => (await rowCounts()).chats;",
    "export const fromLibraryMember = env.environments.client;",
    'export const fromLibraryType = params("/x").section;',
    "class Plain {}",
    "export const fromPrototype = Plain.prototype;",
  ].join("\n");
  const lineOf = (name: string): number => source.split("\n").findIndex((line) => line.includes(`const ${name} `)) + 1;
  const root = await plantedTree(
    graphTree({
      "node_modules/fakelib/package.json": JSON.stringify({ name: "fakelib", types: "index.d.ts" }),
      "node_modules/fakelib/index.d.ts": [
        'export declare const env: { readonly environments: Record<"client" | "ssr", number> };',
        'export declare function params(path: string): { [K in "section"]: string };',
      ].join("\n"),
      "node_modules/zod/package.json": JSON.stringify({ name: "zod", types: "index.d.ts" }),
      "node_modules/zod/index.d.ts": [
        "export declare namespace z {",
        "  type infer<T> = T extends { readonly out: infer O } ? O : never;",
        "}",
        "export declare const z: { enum<const T extends readonly string[]>(values: T): { readonly out: T[number] } };",
      ].join("\n"),
      [hops]: source,
    }),
  );
  const users = async (name: string): Promise<readonly string[]> =>
    (await queryGraph(root, { query: "users", names: [name] }, quiet)).answers.flatMap((answer) =>
      answer.query === "users" ? answer.nodes.map(({ label }) => label) : [],
    );
  const { session } = await queryGraph(root, { query: "users", names: ["HOSTS"] }, quiet, { ...FRESH_BUILD, explainLost: true });
  expect(session.lost?.total).toBe(0);
  expect(session.lost?.library.byLibrary.find(({ library }) => library === "fakelib")?.members.map(({ member }) => member)).toEqual([
    "client",
    "environments",
    "section",
  ]);
  // the call's object literal property `ready: 1` is the home: an unnamed declaration, labelled by its key
  const reached = (await queryGraph(root, { query: "reach", names: ["fromCall"] }, quiet)).answers.flatMap((answer) =>
    answer.query === "reach" ? answer.nodes.map(({ label }) => label) : [],
  );
  const callLine = "const CEILINGS = budgets({ ready: 1 });";
  const at = source.indexOf(callLine) + callLine.indexOf("{") + 1;
  expect(reached).toContain(`${hops}#${String(at)}-${String(at + " ready: 1".length)}.${String(SyntaxKind.PropertyAssignment)}`);
  expect(await users("HOSTS")).toContain(`${hops}:${lineOf("fromHolder")} fromHolder`);
  expect(await users("Config.output")).toContain(`${hops}:${lineOf("fromMember")} fromMember`);
  expect(await users("KINDS")).toContain(`${hops}:${lineOf("fromSchema")} fromSchema`);
  expect(await users("TASKS")).toContain(`${hops}:${lineOf("fromIndexedMapped")} fromIndexedMapped`);
  expect(await users("HOSTS")).toEqual(
    expect.arrayContaining([`${hops}:${lineOf("fromInferredHolder")} fromInferredHolder`, `${hops}:${lineOf("fromBinding")} fromBinding`]),
  );
  expect(await users("PORTS")).toContain(`${hops}:${lineOf("fromQuery")} fromQuery`);
  expect(await users("DEFAULTS")).toContain(`${hops}:${lineOf("fromSpread")} fromSpread`);
});

test("a query verb with no name to ask about is refused before any world loads", { timeout: 120_000 }, async ({ runCli, scratch }) => {
  await expect(await runCli("unwired", ["graph-why", `--root=${scratch}`])).toExitWith(EXIT.misuse);
  await expect(await runCli("unwired", ["graph", "base", `--root=${scratch}`])).toExitWith(EXIT.misuse);
});

// A chain twice as deep as any walk cap the prototype had: the walks run until their seen-set is spent.
const DEPTH = 12;
const DEEP = `${GRAPH_SOURCE}/deep.ts`;
const step = (at: number): string => `f${String(at)}`;
const DEEP_SOURCE = [
  `export const ${step(DEPTH)} = (): number => 1;`,
  ...Array.from({ length: DEPTH }, (_, at) => `const ${step(DEPTH - 1 - at)} = (): number => ${step(DEPTH - at)}();`),
  `${step(0)}();`,
].join("\n");
// f(n) is declared on line DEPTH - n + 1
const deepLabel = (at: number): string => `${DEEP}:${String(DEPTH - at + 1)} ${step(at)}`;

test("a walk deeper than any fixed cap still reaches its end", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [DEEP]: DEEP_SOURCE }, { entries: [DEEP] }));
  const ask = async (query: (typeof QUERIES)[number], name: string): Promise<readonly unknown[]> =>
    (await queryGraph(root, { query, names: [name] }, quiet)).answers.map(shape)[0] ?? [];
  const steps = Array.from({ length: DEPTH + 1 }, (_, at) => at);
  expect(await ask("why", step(DEPTH))).toEqual([[DEEP, steps.map(deepLabel)]]);
  expect(await ask("reach", step(0))).toEqual([[1, DEEP], ...steps.slice(1).map((at) => [at, deepLabel(at)])]);
});

// The last shapes the real tree lost: a key set naming a const by `typeof`, a generic holder whose spelling is a union
// with null, a member whose value a mapped holder spells, and an interface whose key set is its heritage clause's.
test("a key set is followed through a const query, a nullable holder, a mapped holder's value and an interface's heritage", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const shapes = `${GRAPH_SOURCE}/shapes.ts`;
  const source = [
    'const NONE = "none";',
    'export const STATUSES = ["ok", "bad"] as const;',
    "type Counts = Readonly<Record<(typeof STATUSES)[number] | typeof NONE, number>>;",
    "declare const counts: Counts;",
    "export const fromConstKey = counts.none;",
    "type Tones<Host extends string> = { readonly hosts: Readonly<Record<Host, number>> } & { readonly polarity: string };",
    "declare function tonesOf(): Tones<(typeof STATUSES)[number]> | null;",
    "const tones = tonesOf();",
    "export const fromNullableHolder = tones === null ? 0 : tones.hosts.ok;",
    "type Names = Readonly<Record<(typeof STATUSES)[number], readonly string[]>>;",
    'declare function folders(): { readonly names: Readonly<Record<"held" | "fresh", Names>> };',
    "const { names } = folders();",
    "export const fromMappedValue = names.held.bad;",
    "export interface Caps extends Readonly<Record<(typeof STATUSES)[number], number>> { readonly share: number }",
    "declare function capsOf(): Caps;",
    "const whole = { ...capsOf(), share: 1 };",
    "export const fromHeritage = whole.ok;",
  ].join("\n");
  const lineOf = (name: string): number => source.split("\n").findIndex((line) => line.includes(`const ${name} `)) + 1;
  const root = await plantedTree(graphTree({ [shapes]: source }));
  const users = async (name: string): Promise<readonly string[]> =>
    (await queryGraph(root, { query: "users", names: [name] }, quiet)).answers.flatMap((answer) =>
      answer.query === "users" ? answer.nodes.map(({ label }) => label) : [],
    );
  const { session } = await queryGraph(root, { query: "users", names: ["STATUSES"] }, quiet, { ...FRESH_BUILD, explainLost: true });
  expect(session.lost?.bySlot.map(({ slot, sample }) => `${slot} ${sample}`)).toEqual([]);
  expect(await users("NONE")).toContain(`${shapes}:${lineOf("fromConstKey")} fromConstKey`);
  expect(await users("STATUSES")).toEqual(
    expect.arrayContaining(["fromNullableHolder", "fromMappedValue", "fromHeritage"].map((name) => `${shapes}:${lineOf(name)} ${name}`)),
  );
});
