// A value handed from one type to a restated twin carries its members across: the sink's reads count for the source
// and the source's writes count for the sink, never the reverse. Each form has a found case beside its wired control.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanFields } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD, ZOD_STUB } from "./_planted.ts";

const scanned = async (plantedTree: (tree: Record<string, string>) => Promise<string>, file: string, lines: readonly string[]): Promise<readonly string[]> => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/a/src/z.ts": ZOD_STUB,
    [`packages/a/src/${file}`]: ['import type { Infer } from "./z.ts";', 'import { z } from "./z.ts";', ...lines].join("\n"),
  });
  const report = scanFields({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  return report.unwired.filter((field) => field.file.endsWith(file)).map(({ home, member, kind }) => `${home}.${member} ${kind}`);
};

test("a conditional spread writes the key it carries", { timeout: 120_000 }, async ({ plantedTree }) => {
  const found = await scanned(plantedTree, "spread.ts", [
    "export const Swipe = z.object({ chatId: z.string(), guided: z.string().optional(), intent: z.string().optional() });",
    'export const verb = (input: Infer<typeof Swipe>): string => input.chatId + (input.guided ?? "") + (input.intent ?? "");',
    'export const fire = (guided: string | undefined): string => verb({ chatId: "c", ...(guided === undefined ? {} : { guided }) });',
  ]);
  expect(found).toEqual(["Swipe.intent never-written"]);
});

test("a helper's returned object writes the keys it spreads into a literal", { timeout: 120_000 }, async ({ plantedTree }) => {
  const found = await scanned(plantedTree, "helper.ts", [
    "export const Dial = z.object({ url: z.string(), key: z.string().optional(), credentialId: z.string().optional(), headers: z.string().optional() });",
    "const dialAuth = (key: string, id: string | null): { readonly key?: string; readonly credentialId?: string } =>",
    '  key !== "" ? { key } : id === null ? {} : { credentialId: id };',
    'export const dial = (input: Infer<typeof Dial>): string => input.url + (input.key ?? "") + (input.credentialId ?? "") + (input.headers ?? "");',
    'export const run = (key: string, id: string | null): string => dial({ url: "u", ...dialAuth(key, id) });',
  ]);
  expect(found).toEqual(["Dial.headers never-written"]);
});

test("a client vars twin of a router input writes its keys through the mutation options", { timeout: 120_000 }, async ({ plantedTree }) => {
  const found = await scanned(plantedTree, "twin.ts", [
    "interface Options<V> { readonly mutationFn?: (vars: V) => Promise<unknown> }",
    "export const Nominate = z.object({ chatId: z.string(), offer: z.string().optional(), note: z.string().optional() });",
    "type Input = Infer<typeof Nominate>;",
    'const verb = async (input: Input): Promise<string> => input.chatId + (input.offer ?? "") + (input.note ?? "");',
    "const router = { nominate: { mutationOptions: (): Options<Input> => ({ mutationFn: verb }) } };",
    "interface NominateVars { readonly chatId: string; readonly offer?: string | undefined; readonly stale?: string }",
    "const entity = <V>(config: { readonly options: (t: typeof router) => Options<V> }): ((vars: V) => void) => (vars) => {",
    "  void config.options(router).mutationFn?.(vars);",
    "};",
    "export const useNominate = entity<NominateVars>({ options: (t) => t.nominate.mutationOptions() });",
    'export const fire = (): void => useNominate({ chatId: "c", offer: "o" });',
  ]);
  expect(found.toSorted()).toEqual(["Nominate.note never-written", "NominateVars.stale unreferenced"]);
});

test("a whole object passed to a narrower parameter is read through it, and only in that direction", { timeout: 120_000 }, async ({ plantedTree }) => {
  const found = await scanned(plantedTree, "handoff.ts", [
    "interface Frame { readonly dt: number; readonly prey: number; readonly idle: number; readonly dropped: number }",
    "interface Scene { readonly dt: number; readonly prey: number; readonly idle: number }",
    "const pose = (scene: Scene): number => scene.dt + scene.prey;",
    "const paint = (frame: Frame): number => pose(frame) + frame.idle;",
    "export const painted = paint({ dt: 1, prey: 2, idle: 3, dropped: 4 });",
  ]);
  expect(found.toSorted()).toEqual(["Frame.dropped never-read", "Scene.idle never-read"]);
});

test("an uncontextual local literal writes the type it is later handed to", { timeout: 120_000 }, async ({ plantedTree }) => {
  const found = await scanned(plantedTree, "local.ts", [
    'export const held: { readonly id: string } = { id: "h" };',
    "interface Image { readonly id: string; readonly hash?: string | undefined; readonly size?: number }",
    'export const seeded: Image = { id: "s" };',
    "const project = (hash: string): { readonly images: Image[] } => {",
    '  const image = { id: "i", hash };',
    "  return { images: [image] };",
    "};",
    'export const shown = project("h").images.map((image) => image.id + (image.hash ?? "") + (image.size ?? 0));',
  ]);
  expect(found).toEqual(["Image.size never-written"]);
});

test("an as const writer object and a ReturnType hop both write what they hand on", { timeout: 120_000 }, async ({ plantedTree }) => {
  const found = await scanned(plantedTree, "writers.ts", [
    "interface Styled { readonly tone?: string; readonly pad?: string; readonly made?: number; readonly gap?: string; readonly seed?: string }",
    'export const seeded: Styled = { seed: "s" };',
    'const writers = { tone: "x" } as const;',
    "const make = () => ({ made: 1 });",
    "type Made = ReturnType<typeof make>;",
    "const made: Made = make();",
    "export const styled: Styled = { ...writers };",
    "export const handed: Styled = made;",
    'export const shown = (styled.tone ?? "") + (styled.pad ?? "") + (handed.made ?? 0) + (handed.gap ?? "") + (seeded.seed ?? "");',
  ]);
  expect(found.toSorted()).toEqual(["Styled.gap never-written", "Styled.pad never-written"]);
});

test("a dotted-path read and a compared serialization read a value's members; a route or thrown serialization only sends them", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/a/src/reflective.ts": [
      "interface Snapshot { readonly mode: string }",
      "interface Detail { readonly note: string }",
      "interface View { readonly status: string; readonly details: readonly Detail[] }",
      "interface Passed { readonly unread: string }",
      "interface Pair { readonly left: string }",
      "interface Failed { readonly code: string }",
      "const nestedValue = (value: unknown, path: string): unknown => (value as Record<string, unknown>)[path];",
      "const log = (value: unknown): void => { void value; };",
      "const c = { json: (value: unknown): unknown => value };",
      'const snapshot: Snapshot = { mode: "m" };',
      'const view: View = { status: "ok", details: [{ note: "n" }] };',
      'const passed: Passed = { unread: "u" };',
      'const pair: Pair = { left: "l" };',
      'const failed: Failed = { code: "c" };',
      'export const sample = nestedValue(snapshot, "mode");',
      "export const sent = c.json(view);",
      "export const same = JSON.stringify(pair) === JSON.stringify(pair);",
      'export const fail = (): never => { throw new Error("failed " + JSON.stringify(failed)); };',
      "log(passed);",
    ].join("\n"),
  });
  const report = scanFields({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const found = report.unwired.map(
    ({ home, member, kind, sent, verdict }) => `${home}.${member} ${kind} ${verdict} ${sent.map((send) => send.split(" ")[0]).join(",")}`,
  );
  expect(found.toSorted()).toEqual([
    "Detail.note never-read ask http",
    "Failed.code never-read ask error",
    "Passed.unread never-read dead ",
    "View.details never-read ask http",
    "View.status never-read ask http",
  ]);
});
