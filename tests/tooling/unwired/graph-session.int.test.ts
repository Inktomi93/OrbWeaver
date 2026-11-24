// A graph session's options change how the graph is built, read or reported, never what the tree is: a dump read back
// analyses to the fresh build's buckets, an ablation says what one recognizer decides, and the why, trace and profile
// records name the sites and phases they measure.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { deserialize, serialize } from "node:v8";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import type { MemoryPeaks, NodeHeapProfile } from "../../../tooling/src/unwired/graph/profile.ts";
import type { Ablation, GraphOptions, GraphScan, WithSession } from "../../../tooling/src/unwired/index.ts";
import { ABLATIONS, FRESH_BUILD, GRAPH_DUMP_FORMAT, PROFILE_PHASES, scanGraph, trialGraph } from "../../../tooling/src/unwired/index.ts";
import { MERGED_CONFIG } from "../../../tooling/src/unwired/worlds.ts";
import {
  DEAD_CHANNEL_MESSAGES,
  GRAPH_SOURCE,
  graphTree,
  labelsIn,
  libraryModule,
  NODE_TYPES,
  REACT_TYPES,
  tailwindVariants,
  WORLD,
  ZOD_MODULE,
} from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/session.ts`;
const OTHER = `${GRAPH_SOURCE}/other.ts`;
const quiet = (): undefined => undefined;
const SAVED_AT_FAILURE = "heap profile saved at failure: ";
const options = (changes: Partial<GraphOptions>): GraphOptions => ({ ...FRESH_BUILD, ...changes });

// A sent member, a written one, a read one and a parameter-keyed table one caller cannot narrow.
const SESSION = [
  "export interface Tag { readonly name: string; readonly color: string }",
  "declare function json(value: unknown): void;",
  'const tag: Tag = { name: "a", color: "b" };',
  "export const save = (): void => json(tag);",
  "export interface Labels { readonly a: string; readonly b: string }",
  "declare const LABELS: Labels;",
  "const label = (key: keyof Labels): string => LABELS[key];",
  "export const reference = label;",
].join("\n");
const OTHER_SOURCE = 'export interface Note { readonly text: string }\nexport const note: Note = { text: "n" };';

// One planted file per fact a dump carries beyond the use edges and the roles: a function slot's flow, a zod twin, a
// state tuple's parts, a member published through our own global door that tooling reads, and a member the runtime
// calls by name.
const FLOW = `${GRAPH_SOURCE}/flow.ts`;
const TWIN = `${GRAPH_SOURCE}/twin.ts`;
const STATE = `${GRAPH_SOURCE}/state.ts`;
const DOOR = `${GRAPH_SOURCE}/door.ts`;
const UNSEEN = `${GRAPH_SOURCE}/unseen.ts`;
const LISTENER = `${GRAPH_SOURCE}/listener.ts`;
const FACTS = {
  ...ZOD_MODULE,
  ...REACT_TYPES,
  [FLOW]: [
    "export interface Event { readonly id: string; readonly extra: string }",
    "export interface Handlers { readonly on: (event: Event) => void }",
    "export interface Mine { readonly id: string; readonly other: string }",
    "const handle = (mine: Mine): void => void mine.id;",
    "export const handlers: Handlers = { on: handle };",
  ].join("\n"),
  [TWIN]: [
    'import { z } from "zod";',
    "export interface User { readonly name: string; readonly age: number }",
    "export const userSchema = z.strictObject({ name: z.string(), age: z.number() }) satisfies z.ZodType<User>;",
    "export const nameOf = (user: z.infer<typeof userSchema>): string => user.name;",
  ].join("\n"),
  [STATE]: [
    'import { useState } from "react";',
    "export const panel = (): boolean => {",
    "  const [open, setOpen] = useState(false);",
    "  return open;",
    "};",
  ].join("\n"),
  [DOOR]: [
    "export interface Bridge { readonly foo: string; readonly bar: string }",
    "declare global {",
    "  var __orb: Bridge | undefined;",
    "}",
    "export const install = (bridge: Bridge): void => {",
    "  globalThis.__orb = bridge;",
    "};",
  ].join("\n"),
  [UNSEEN]: "export class Doc { toJSON(): object { return {}; } spare(unread: number): void {} }",
  ...NODE_TYPES,
  [LISTENER]:
    '/// <reference types="node" />\nimport type { MessagePort } from "worker_threads";\nexport const listen = (port: MessagePort): void => { port.on("message", () => {}); };',
  "tsconfig.world-browser.json": JSON.stringify({ extends: `./${WORLD}`, include: ["probe.ts"] }),
  "probe.ts": "export const seen = globalThis.__orb?.foo;",
};
const bare = (labels: readonly string[]): readonly string[] => labels.map((label) => label.split("  ")[0] ?? label);

test("a dumped graph read back analyses to the fresh build's buckets; a dump in another format is refused", { timeout: 120_000 }, async ({
  plantedTree,
  scratch,
}) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OTHER]: OTHER_SOURCE, ...FACTS }));
  const dump = join(scratch, "graph.dump");
  const fresh = await scanGraph(root, quiet, options({ dump }));
  // each fact decides a bucket in the fresh build, so a dump that drops one analyses to other buckets
  expect(labelsIn(fresh, "member-write-only", OTHER)).toEqual(["Note.text"]);
  expect(labelsIn(fresh, "member-untouched", FLOW)).toEqual(["Event.extra", "Mine.other"]);
  expect(bare(labelsIn(fresh, "member-untouched", TWIN))).toEqual(["User.age"]);
  expect(labelsIn(fresh, "state-never-set", STATE)).toEqual(["3 setter"]);
  expect(labelsIn(fresh, "member-sent-only", DOOR)).toEqual(["Bridge.bar"]);
  expect(labelsIn(fresh, "member-untouched", UNSEEN)).toEqual(["Doc.spare"]);
  expect(labelsIn(fresh, "binding-unread", UNSEEN)).toEqual(["1 unread"]);
  expect(labelsIn(fresh, "message-receiver-unpaired", LISTENER)).toEqual(["3 worker"]);
  const read = await scanGraph(root, quiet, options({ from: dump }));
  expect(read.analysis).toEqual(fresh.analysis);
  expect(read.session.from).toEqual(fresh.session.dumped);
  const stale = join(scratch, "stale.dump");
  writeFileSync(stale, serialize({ ...deserialize(readFileSync(dump)), format: GRAPH_DUMP_FORMAT + 1 }));
  await expect(scanGraph(root, quiet, options({ from: stale }))).rejects.toThrow(String(GRAPH_DUMP_FORMAT + 1));
});

test("why names the site that gave each role to the asked member and to no other", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION }));
  const scan = await scanGraph(root, quiet, options({ why: [{ kind: "member", owner: "Tag", name: "name" }] }));
  expect(scan.session.why.map(({ member, declared, role, site }) => [member, declared, role, site])).toEqual([
    ["Tag.name", `${FILE}:1`, "write", `${FILE}:3`],
    ["Tag.name", `${FILE}:1`, "escape", `${FILE}:4`],
  ]);
});

// A role no site gives a member, here a read through its zod twin, still shows in the record, with the link and the
// member it came along, at the read itself; a member the record shows no read for would be kept with nothing to show why.
test("why names a role the carry gives, so a member no bucket holds shows the read that keeps it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, ...FACTS }));
  const scan = await scanGraph(root, quiet, options({ why: [{ kind: "member", owner: "User", name: "name" }] }));
  const held = Object.values(scan.analysis).some((findings) => findings.some(({ label }) => label.startsWith(`${TWIN}:User.name`)));
  expect(held).toBe(false);
  expect(scan.session.why.map(({ member, role, site, via }) => [member, role, site, via])).toEqual([
    ["User.name", "read", `${TWIN}:${String(FACTS[TWIN].split("\n").findIndex((line) => line.includes("user.name")) + 1)}`, "carry twin from userSchema.name"],
  ]);
});

// A zod twin pair nothing reads: both halves stay unread, so the type member reports, and a carried role names the
// occurrence that gave it, never a half's own declaration.
const PAIR = `${GRAPH_SOURCE}/pair.ts`;
const PAIR_SOURCE = [
  'import { z } from "zod";',
  "export interface View { readonly chatId: string; readonly spare: string }",
  "export const viewSchema = z.strictObject({",
  "  chatId: z.string(),",
  "  spare: z.string(),",
  "}) satisfies z.ZodType<View>;",
  'export const toView = (): View => ({ chatId: "c", spare: "s" });',
];

test("a zod twin pair nothing reads reports, and a carried role names where it was given", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [PAIR]: PAIR_SOURCE.join("\n"), ...ZOD_MODULE }));
  const scan = await scanGraph(root, quiet, options({ why: [{ kind: "member", owner: null, name: "chatId" }] }));
  expect(labelsIn(scan, "member-write-only", PAIR)).toEqual(["View.chatId", "View.spare"]);
  const written = PAIR_SOURCE.findIndex((line) => line.startsWith("export const toView")) + 1;
  expect(scan.session.why.map(({ member, role, site, via }) => [member, role, site, via])).toEqual([
    ["View.chatId", "write", `${PAIR}:${String(written)}`, expect.stringContaining("recordWrites")],
    ["viewSchema.chatId", "write", `${PAIR}:${String(written)}`, "carry twin from View.chatId"],
  ]);
});

// A value landing in an opaque member slot escapes there: the site is that line, not the file's first token past its
// header, and the two slots one literal fills with the same value give the member one escape at that site. A library
// slot naming the member reads it at the hand-off's own line, and a keyed read and an indexed type name it at theirs.
const OPAQUE = `${GRAPH_SOURCE}/opaque.ts`;
const OPAQUE_SOURCE = [
  "// The header a position-zero site would skip to the import below.",
  'import type { Tag } from "./session.ts";',
  "export interface Box { readonly inner: unknown; readonly other: unknown; readonly tag?: Tag }",
  "export interface Item { readonly kept: string }",
  "declare const item: Item;",
  "export const box: Box = { inner: item, other: item };",
  'import { take } from "lib";',
  "export const sunk = (): void => take(item);",
  'declare const which: "kept";',
  "export const got = item[which];",
  'export type Kept = Item["kept"];',
].join("\n");
const SINK = libraryModule(["export interface Sink { readonly kept: string }", "export declare function take(sink: Sink): void;"]);

test("why names an opaque slot's escape at its own line, once per member, role, site and recorder", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OPAQUE]: OPAQUE_SOURCE, ...SINK }));
  const scan = await scanGraph(root, quiet, options({ why: [{ kind: "member", owner: "Item", name: "kept" }] }));
  const rows = scan.session.why.map(({ member, role, site, via }) => [member, role, site, via.split(" ")[0]]);
  expect(rows).toEqual([
    ["Item.kept", "escape", `${OPAQUE}:6`, "escape"],
    ["Item.kept", "read", `${OPAQUE}:8`, "#memberFlow"],
    ["Item.kept", "read", `${OPAQUE}:10`, "#elementKeys"],
    ["Item.kept", "key", `${OPAQUE}:11`, "#typeKeys"],
  ]);
});

// A read whose key set only the receiver's spelling names: `Record<(typeof HOSTS)[number], …>` keys on the tuple.
const SPELL = `${GRAPH_SOURCE}/spell.ts`;
const SPELL_SOURCE = [
  'const HOSTS = ["m", "n"] as const;',
  "declare const seats: Record<(typeof HOSTS)[number], number>;",
  "export const seat = seats.m;",
].join("\n");

interface AblatedReading {
  readonly reading: (scan: WithSession<GraphScan>) => readonly string[];
  readonly fresh: readonly string[];
  readonly ablated: readonly string[];
}

// What each recognizer decides, as the one reading its ablation moves, fresh then ablated.
const ABLATED: Readonly<Record<Ablation, AblatedReading>> = {
  escape: { reading: (scan) => labelsIn(scan, "member-write-only", FILE), fresh: [], ablated: ["Tag.name", "Tag.color"] },
  "literal-keys": { reading: (scan) => labelsIn(scan, "member-untouched", OTHER), fresh: [], ablated: ["Note.text"] },
  "zod-twins": { reading: (scan) => labelsIn(scan, "member-untouched", TWIN), fresh: ["User.age"], ablated: ["User.name", "User.age"] },
  spelling: {
    reading: (scan) => (scan.session.lost?.bySlot ?? []).map(({ slot, sample }) => `${slot} ${sample}`),
    fresh: [],
    ablated: [`mapped-member ${SPELL}:3`],
  },
};

test("each ablation turns off the one recognizer it names", { timeout: 300_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OTHER]: OTHER_SOURCE, [SPELL]: SPELL_SOURCE, ...FACTS }));
  const fresh = await scanGraph(root, quiet, options({ explainLost: true }));
  for (const ablation of ABLATIONS) {
    const { reading, fresh: before, ablated: after } = ABLATED[ablation];
    expect([ablation, reading(fresh)]).toEqual([ablation, before]);
    const ablated = await scanGraph(root, quiet, options({ explainLost: true, ablate: new Set<Ablation>([ablation]) }));
    expect([ablation, reading(ablated)]).toEqual([ablation, after]);
    expect(ablated.session.ablated).toEqual([ablation]);
  }
});

test("a narrowed walk judges only the files under its prefix", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OTHER]: OTHER_SOURCE }));
  const whole = await scanGraph(root, quiet);
  expect(labelsIn(whole, "member-write-only", OTHER)).toEqual(["Note.text"]);
  const narrowed = await scanGraph(root, quiet, options({ files: FILE }));
  expect(narrowed.files).toBe(1);
  expect(labelsIn(narrowed, "member-write-only", OTHER)).toEqual([]);
  expect(labelsIn(narrowed, "member-sent-only", FILE)).toEqual(["Tag.name", "Tag.color"]);
});

test("the param-key trace names the function whose table a caller reads whole", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION }));
  const lines: string[] = [];
  await scanGraph(root, (line) => lines.push(line), options({ traces: [{ kind: "param-key", file: GRAPH_SOURCE }] }));
  expect(lines.filter((line) => line.includes(`${FILE}:7`) && line.includes("label"))).toHaveLength(1);
  const untraced: string[] = [];
  await scanGraph(root, (line) => untraced.push(line));
  expect(untraced.filter((line) => line.includes(`${FILE}:7`))).toEqual([]);
});

// A recipe whose size axis takes a literal and a call's wide value, which names no value of the axis.
const BUTTON = `${GRAPH_SOURCE}/button.ts`;
const BUTTON_SOURCE = [
  'import { tv } from "tailwind-variants";',
  'const button = tv({ variants: { size: { sm: "s", md: "m" } } });',
  "declare function picked(): string;",
  'export const small = button({ size: "sm" });',
  "export const chosen = button({ size: picked() });",
].join("\n");

test("the axis trace follows one axis's values and the tv trace names each dynamic axis's cause", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ ...tailwindVariants(), [BUTTON]: BUTTON_SOURCE }));
  const traced = async (traces: GraphOptions["traces"]): Promise<readonly string[]> => {
    const lines: string[] = [];
    await scanGraph(root, (line) => lines.push(line), options({ traces }));
    return lines.filter((line) => line.startsWith("trace "));
  };
  expect(await traced([{ kind: "axis", prop: "size" }])).toEqual([
    `trace axis size (${BUTTON}) takes sm`,
    expect.stringMatching(/^trace axis size .* takes (?!sm$)/u),
    `trace axis size (${BUTTON}) selects sm, dynamic`,
  ]);
  expect(await traced([{ kind: "axis", prop: "tone" }])).toEqual([]);
  expect(await traced([{ kind: "tv" }])).toEqual([expect.stringMatching(/^trace tv size .* dynamic: /u)]);
  expect(await traced([])).toEqual([]);
});

// Both processes' peaks: Node's own and the merged program's compiler, which the combined bound adds to Node's. These
// suites run on Linux, where /proc reports another process's memory.
function expectBothPeaks(memory: MemoryPeaks | undefined): void {
  expect(memory?.nodePeakMb).toBeGreaterThan(0);
  const merged = memory?.compilers.find(({ config }) => config === MERGED_CONFIG);
  expect(merged?.startedIn).toBe("open");
  expect(merged?.peakMb).toBeGreaterThan(0);
  // Each figure rounds to a megabyte on its own, so the sum of two rounded peaks can pass the rounded bound by one.
  expect(memory?.combinedBoundMb).toBeGreaterThanOrEqual((memory?.nodePeakMb ?? 0) + (merged?.peakMb ?? 0) - 1);
  expect(memory?.combinedSampledMb).toBeGreaterThan(merged?.peakMb ?? 0);
  expect(memory?.combinedSampledMb).toBeLessThanOrEqual(memory?.combinedBoundMb ?? 0);
}

test("a compiler profile emits every phase, the world's requests, each walked file and the compiler's own samples", { timeout: 240_000 }, async ({
  plantedTree,
  scratch,
}) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OTHER]: OTHER_SOURCE }));
  const compilers = new Map<string, readonly unknown[]>();
  const nodeHeaps = new Map<string, NodeHeapProfile | null>();
  for (const kind of ["heap", "cpu"] as const) {
    const { session } = await scanGraph(root, quiet, options({ profile: { kinds: [kind], dir: join(scratch, kind) } }));
    const profile = session.profile;
    expect(Object.keys(profile?.phases ?? {})).toEqual([...PROFILE_PHASES]);
    expect(profile?.phases.walk).toBeGreaterThan(0);
    expect(profile?.world?.sent).toBeGreaterThan(0);
    expect(profile?.files.map(({ file }) => file).sort()).toEqual([OTHER, FILE].sort());
    expect(profile?.compilers.map((compiler) => compiler.kind)).toEqual([kind]);
    expect(existsSync(profile?.compilers[0]?.path ?? "")).toBe(true);
    compilers.set(kind, profile?.compilers[0]?.summary.entries ?? []);
    nodeHeaps.set(kind, profile?.nodeHeap ?? null);
    expectBothPeaks(profile?.memory);
  }
  // Node's heap profile rides with the compiler's: allocation sites of the live heap, this tooling's own code among them.
  expect(existsSync(nodeHeaps.get("heap")?.path ?? "")).toBe(true);
  expect(nodeHeaps.get("heap")?.summary.entries.some(({ name }) => name.includes("tooling/src/unwired/"))).toBe(true);
  expect(nodeHeaps.get("cpu")).toBeNull();
  // a sampled cpu profile of a planted tree can hold no sample, so only the heap's allocators are asserted
  expect(compilers.get("heap")?.length).toBeGreaterThan(0);
  expect((await scanGraph(root, quiet)).session.profile).toBeNull();
});

test("one run profiles the compiler's cpu and heap together and reports both", { timeout: 240_000 }, async ({ plantedTree, scratch }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OTHER]: OTHER_SOURCE }));
  const { session } = await scanGraph(root, quiet, options({ profile: { kinds: ["wall", "heap", "cpu"], dir: join(scratch, "both") } }));
  expect(session.profile?.compilers.map(({ kind }) => kind)).toEqual(["heap", "cpu"]);
  for (const compiler of session.profile?.compilers ?? []) {
    expect(existsSync(compiler.path)).toBe(true);
  }
});

// The heap profile after the build says nothing of what a long trial grew: a run that throws saves another, from the
// compiler as it stands when the run fails.
test("a run that throws still saves its heap profile", { timeout: 120_000 }, async ({ plantedTree, scratch }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface Row { readonly a: string; readonly b: string }",
        'export const row: Row = { a: "1", b: "2" };',
        "export const a = (): string => row.a;",
      ].join("\n"),
    }),
  );
  const lines: string[] = [];
  const failed = await trialGraph(
    root,
    { buckets: ["member-write-only"], limit: null },
    (line) => {
      lines.push(line);
      if (line.startsWith("trial groups ")) {
        throw new Error("the run broke");
      }
    },
    options({ profile: { kinds: ["heap"], dir: join(scratch, "crash") } }),
  ).then(
    () => null,
    (error: unknown) => error,
  );
  expect((failed as Error).message).toBe("the run broke");
  const saved = lines.find((line) => line.startsWith(SAVED_AT_FAILURE));
  expect(saved).toBeDefined();
  expect(existsSync(saved?.slice(SAVED_AT_FAILURE.length) ?? "")).toBe(true);
});

// The compiler's process dies after the trial's first group: the run's own error is a dead channel, and disposing the
// world then fails on the same channel. That second failure is logged, never the thrown error.
test("a compiler that dies mid-run leaves the run's own error thrown and the failed disposal logged", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface Row { readonly a: string; readonly b: string }",
        'export const row: Row = { a: "1", b: "2" };',
        "export const a = (): string => row.a;",
      ].join("\n"),
    }),
  );
  const lines: string[] = [];
  let killed = false;
  const failed = await trialGraph(root, { buckets: ["member-write-only"], limit: null }, (line) => {
    lines.push(line);
    if (!killed && line.startsWith("trial groups ")) {
      killed = true;
      for (const pid of readFileSync(`/proc/${String(process.pid)}/task/${String(process.pid)}/children`, "utf8")
        .split(" ")
        .filter(Boolean)) {
        process.kill(Number(pid), "SIGKILL");
      }
    }
  }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(killed).toBe(true);
  expect(failed).toBeInstanceOf(Error);
  expect(failed).not.toBeInstanceOf(SuppressedError);
  expect(lines.some((line) => line.includes("did not dispose cleanly"))).toBe(true);
  // The session names how its compiler ended, when the run failed and the step it was in; the compilers its worlds
  // closed themselves are no news.
  expect(lines.filter((line) => line.startsWith("the compiler for "))).toEqual([
    expect.stringMatching(
      new RegExp(
        `^the compiler for ${MERGED_CONFIG.replaceAll(".", String.raw`\.`)} \\(pid \\d+, started in open\\) ended by signal SIGKILL; the run failed at \\d{4}-\\S+Z in work$`,
        "u",
      ),
    ),
  ]);
  // The run's own error is the dead channel the compiler left, not the disposal's. The next write can hit the broken
  // pipe before the read sees end of input, so either is the first observation of the death; nothing else is.
  expect(DEAD_CHANNEL_MESSAGES.some((prefix) => (failed as Error).message.startsWith(prefix))).toBe(true);
});

test("the graph verbs refuse a build's options and a compiler profile on a dump before any world loads", { timeout: 120_000 }, async ({ runCli, scratch }) => {
  const onDump = (flag: string): ReturnType<typeof runCli> => runCli("unwired", ["graph", `--root=${scratch}`, `--from=${join(scratch, "graph.dump")}`, flag]);
  for (const [flag, reason] of [
    ["--ablate=escape", "--ablate act on a build"],
    ["--profile=heap", "--profile=heap profiles the compiler's build"],
    ["--profile=cpu", "--profile=cpu profiles the compiler's build"],
  ] as const) {
    const run = await onDump(flag);
    await expect(run).toExitWith(EXIT.misuse);
    expect(run.stderr).toContain(reason);
  }
  // a wall profile measures the run itself, so it passes the flag check and fails only on the missing dump
  expect((await onDump("--profile=wall")).stderr).not.toContain("profiles the compiler's build");
});
