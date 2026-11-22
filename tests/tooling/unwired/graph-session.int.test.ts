// A graph session's options change how the graph is built, read or reported, never what the tree is: a dump read back
// analyses to the fresh build's buckets, an ablation says what one recognizer decides, and the why, trace and profile
// records name the sites and phases they measure.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deserialize, serialize } from "node:v8";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import type { Ablation, GraphOptions } from "../../../tooling/src/unwired/index.ts";
import { FRESH_BUILD, GRAPH_DUMP_FORMAT, PROFILE_PHASES, scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, labelsIn } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/session.ts`;
const OTHER = `${GRAPH_SOURCE}/other.ts`;
const quiet = (): undefined => undefined;
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

test("a dumped graph read back analyses to the fresh build's buckets; a dump in another format is refused", { timeout: 120_000 }, async ({
  plantedTree,
  scratch,
}) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OTHER]: OTHER_SOURCE }));
  const dump = join(scratch, "graph.dump");
  const fresh = await scanGraph(root, quiet, options({ dump }));
  expect(labelsIn(fresh, "member-write-only", OTHER)).toEqual(["Note.text"]);
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

test("ablating escape turns a member only sent into one only written", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION }));
  const sent = await scanGraph(root, quiet);
  expect(labelsIn(sent, "member-sent-only", FILE)).toEqual(["Tag.name", "Tag.color"]);
  const ablated = await scanGraph(root, quiet, options({ ablate: new Set<Ablation>(["escape"]) }));
  expect(labelsIn(ablated, "member-sent-only", FILE)).toEqual([]);
  expect(labelsIn(ablated, "member-write-only", FILE)).toEqual(["Tag.name", "Tag.color"]);
  expect(ablated.session.ablated).toEqual(["escape"]);
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

test("a heap profile emits every phase, the world's requests, each walked file and the compiler's allocators", { timeout: 120_000 }, async ({
  plantedTree,
  scratch,
}) => {
  const root = await plantedTree(graphTree({ [FILE]: SESSION, [OTHER]: OTHER_SOURCE }));
  const { session } = await scanGraph(root, quiet, options({ profile: { kind: "heap", dir: join(scratch, "profile") } }));
  const profile = session.profile;
  expect(Object.keys(profile?.phases ?? {})).toEqual([...PROFILE_PHASES]);
  expect(profile?.phases.walk).toBeGreaterThan(0);
  expect(profile?.world?.sent).toBeGreaterThan(0);
  expect(profile?.files.map(({ file }) => file).sort()).toEqual([OTHER, FILE].sort());
  expect(profile?.compiler?.summary.entries.length).toBeGreaterThan(0);
  expect((await scanGraph(root, quiet)).session.profile).toBeNull();
});

test("the graph verbs refuse a build's options on a dump before any world loads", async ({ runCli, scratch }) => {
  const run = await runCli("unwired", ["graph", `--root=${scratch}`, `--from=${join(scratch, "graph.dump")}`, "--ablate=escape"]);
  await expect(run).toExitWith(EXIT.misuse);
});
