// What reaches a receiver that names no member: a value handed whole to an opaque slot, published to a global, or taken
// by a library's bare type parameter is sent, not read, and its members land in member-sent-only; a slot that names a
// member pairs it, and a library slot naming a field is a receiver reading it.
import { expect, plantedTsconfig, plantLink, test } from "@orb/testkit/tooling";
import { NativeWorld, scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree, JSX_NAMESPACE, LIB, labelsIn, libraryModule, WORLD } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/sends.ts`;
const JSX_FILE = `${GRAPH_SOURCE}/card.tsx`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });

test("an object literal handed to an opaque parameter sends the list it holds; into a typed slot it only pairs", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Tag { readonly name: string; readonly color: string }",
      "export interface Settings { readonly tags: readonly Tag[] }",
      "declare function json(value: unknown): void;",
      "export const save = (settings: Settings): void => json({ tags: settings.tags });",
      "export interface Row { readonly label: string; readonly hidden: string }",
      "export interface Typed { readonly rows: readonly Row[] }",
      "const show = (typed: Typed): string => typed.rows.map((row) => row.label).join();",
      "export const render = (rows: readonly Row[]): string => show({ rows });",
    ]),
  );
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Tag.name", "Tag.color"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Row.hidden"]);
});

test("a value published to our own global escapes through what its members' calls resolve to", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Page { readonly title: string }",
      "export interface Nav { readonly go: () => Promise<Page> }",
      "export interface Door { readonly nav: Nav }",
      "export interface Aside { readonly note: string }",
      "declare global { var __door: Door | undefined }",
      "export const install = (door: Door): void => { globalThis.__door = door; };",
      "export const aside = (value: Aside): string => typeof value;",
    ]),
  );
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Page.title", "Nav.go", "Door.nav"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Aside.note"]);
});

test("script text that reads a published global reads each member on its chain", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Nav { readonly go: () => void; readonly back: () => void }",
      "export interface Door { readonly nav: Nav }",
      "declare global { var __door: Door | undefined }",
      "export const install = (door: Door): void => { globalThis.__door = door; };",
      'export const script = "window.__door.nav.go()";',
    ]),
  );
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Nav.back"]);
});

test("a JSX spread copies its members into the props it fills", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      [JSX_FILE]: [
        JSX_NAMESPACE,
        "export interface Data { readonly a: string; readonly b: string }",
        "export interface CardProps { readonly a: string; readonly b: string }",
        "const Card = (props: CardProps): JSX.Element => <p>{props.a}</p>;",
        "export const show = (data: Data): JSX.Element => <Card {...data} />;",
      ].join("\n"),
    },
    { jsx: true },
  );
  // Data.b fills CardProps.b, which requires it: the one row is the prop's, and the two delete together
  expect(labelsIn(scan, "member-untouched", JSX_FILE)).toEqual(["CardProps.b"]);
});

test("a callback's value returned into an opaque slot escapes after the signature is unwrapped", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Sent { readonly a: string }",
      "export interface Kept { readonly b: string; readonly c: string }",
      "declare function later(make: () => unknown): void;",
      "declare function typed(make: () => Kept): Kept;",
      "export const run = (sent: Sent, kept: Kept): string => { later(() => sent); return typed(() => kept).b; };",
    ]),
  );
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Sent.a"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Kept.c"]);
});

test("a library slot naming a field reads the value's field of that name, at any depth", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule([
      "export interface Options { readonly headers: string; readonly source: { readonly data: string } }",
      "export declare function request(options: Options): void;",
    ]),
    ...source([
      'import { request } from "lib";',
      "export interface MySource { readonly data: string; readonly extra: string }",
      "export interface Mine { readonly headers: string; readonly source: MySource; readonly spare: string }",
      "export const send = (mine: Mine): void => request(mine);",
    ]),
  });
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["MySource.extra", "Mine.spare"]);
});

// The program, not the path, says what a library is: a dependency linked in from outside any node_modules directory is
// still the library its import resolves to, and a workspace package reached through node_modules is still ours.
test("a library linked from outside node_modules is a receiver; a workspace package linked into it is ours", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      "vendor/lib/package.json": JSON.stringify({ name: "lib", types: "index.d.ts" }),
      "vendor/lib/index.d.ts": [
        "export interface Options { readonly headers: string; readonly source: { readonly data: string } }",
        "export declare function request(options: Options): void;",
      ].join("\n"),
      "packages/b/package.json": JSON.stringify({ name: "@orb/b", types: "src/index.ts" }),
      "packages/b/src/index.ts": "export interface Shared { readonly used: string; readonly unread: string }",
      ...source([
        'import { request } from "lib";',
        'import type { Shared } from "@orb/b";',
        "export interface MySource { readonly data: string; readonly extra: string }",
        "export interface Mine { readonly headers: string; readonly source: MySource; readonly spare: string }",
        "export const send = (mine: Mine): void => request(mine);",
        "export const usedOf = (shared: Shared): string => shared.used;",
      ]),
    }),
  );
  plantLink(root, "node_modules/lib", "../vendor/lib", "dir");
  plantLink(root, "node_modules/@orb/b", "../../packages/b", "dir");
  const scan = await scanGraph(root, () => undefined);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["MySource.extra", "Mine.spare"]);
  expect(labelsIn(scan, "member-untouched", "packages/b/src/index.ts")).toEqual(["Shared.unread"]);
});

// A workspace package its importer's world reaches only through node_modules is flagged external by the program, since
// it was resolved from there; the workspace manifest makes it ours. A linked library outside node_modules stays a library.
test("a world keeps a workspace package reached through node_modules and drops a linked library", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/a/src/main.ts": [
      'import type { Shared } from "@orb/b";',
      'import { request } from "lib";',
      "export const go = (shared: Shared): void => request(shared);",
    ].join("\n"),
    "packages/b/package.json": JSON.stringify({ name: "@orb/b", types: "src/index.ts" }),
    "packages/b/src/index.ts": "export interface Shared { readonly used: string }",
    "vendor/lib/package.json": JSON.stringify({ name: "lib", types: "index.d.ts" }),
    "vendor/lib/index.d.ts": "export declare function request(value: object): void;",
  });
  plantLink(root, "node_modules/@orb/b", "../../packages/b", "dir");
  plantLink(root, "node_modules/lib", "../vendor/lib", "dir");
  using world = NativeWorld.open(root, WORLD);
  expect(["packages/a/src/main.ts", "packages/b/src/index.ts", "vendor/lib/index.d.ts"].map((file) => world.has(file))).toEqual([true, true, false]);
});

test("a value taken by a library's bare type parameter is sent; our own generic keeps flowing", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule(["export declare function send<T>(value: T): void;"]),
    ...source([
      'import { send } from "lib";',
      "export interface Reply { readonly a: string }",
      "export interface Own { readonly b: string; readonly c: string }",
      "const mine = <T extends Own>(value: T): string => value.b;",
      "export const reply = (value: Reply, own: Own): string => { send(value); return mine(own); };",
    ]),
  });
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Reply.a"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Own.c"]);
});

// A type parameter an outer declaration binds (a class's, a state setter's `Dispatch<A>`) was fixed where its holder was
// typed, so a value handed in pairs with that instantiation and is read where the holder hands it back. A callable arm of
// the slot (`SetStateAction`'s updater) takes no value that is not a function.
test("a library type parameter its holder binds pairs the value with the holder's instantiation", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule([
      "export interface Box<T> { put(value: T): void; take(): T }",
      "export declare function box<T>(): Box<T>;",
      "export type SetStateAction<S> = S | ((prev: S) => S);",
      "export type Dispatch<A> = (value: A) => void;",
      "export declare function useState<S>(initial: S): [S, Dispatch<SetStateAction<S>>];",
    ]),
    ...source([
      'import { box, useState } from "lib";',
      "export interface Boxed { readonly kept: string; readonly unread: string }",
      "export interface Shown { readonly kept: string; readonly unread: string }",
      "export const boxed = (value: Boxed): string => { const held = box<Boxed>(); held.put(value); return held.take().kept; };",
      'export const useShown = (value: Shown): string => { const [shown, setShown] = useState<Shown | null>(null); setShown(value); return shown?.kept ?? ""; };',
    ]),
  });
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual([]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Boxed.unread", "Shown.unread"]);
});

// The same holds for a value inside a literal argument: `{ value: item }` fills the holder's bound `T`, not a type
// parameter `put` declares, so the value pairs with Held and is read where `take` hands it back. A value under the call's
// own type parameter is still sent whole.
test("a value inside a literal argument typed by a type parameter its holder binds pairs with that instantiation", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule([
      "export interface Shelf<T extends object> { put(entry: { readonly value: T }): void; take(): T }",
      "export declare function shelf<T extends object>(): Shelf<T>;",
      "export declare function stash<V extends object>(entry: { readonly value: V }): void;",
    ]),
    ...source([
      'import { shelf, stash } from "lib";',
      "export interface Held { readonly kept: string; readonly unread: string }",
      "export interface Stashed { readonly unread: string }",
      "export const held = (item: Held): string => { const at = shelf<Held>(); at.put({ value: item }); return at.take().kept; };",
      "export const stashed = (item: Stashed): void => { stash({ value: item }); };",
    ]),
  });
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Stashed.unread"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Held.unread"]);
});

// A library slot typed `unknown` takes a value by identity (open-sends.ts identitySlot), as React compares a dependency
// list, so nothing in the value is read or sent; a library slot that takes keys still sends what it is given.
test("a library slot typed unknown takes a value by identity; a keyed library slot sends it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule([
      "export type DependencyList = readonly unknown[];",
      "export declare function useEffect(effect: () => void, deps?: DependencyList): void;",
      "export declare function same(value: unknown): boolean;",
      "export declare function record(value: object): void;",
    ]),
    ...source([
      'import { record, same, useEffect } from "lib";',
      "export interface Watched { readonly unread: string }",
      "export interface Compared { readonly unread: string }",
      "export interface Logged { readonly unread: string }",
      "export const watch = (value: Watched): void => useEffect(() => undefined, [value]);",
      "export const compare = (value: Compared): boolean => same(value);",
      "export const log = (value: Logged): void => record(value);",
    ]),
  });
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Logged.unread"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Watched.unread", "Compared.unread"]);
});

test("a union value fills a library slot arm by arm", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule([
      "export interface Block { readonly kind: string; readonly text?: string; readonly url?: string }",
      "export declare function post(blocks: readonly Block[]): void;",
    ]),
    ...source([
      'import { post } from "lib";',
      'export interface Text { readonly kind: "text"; readonly text: string; readonly mark: string }',
      'export interface Image { readonly kind: "image"; readonly url: string; readonly alt: string }',
      "export type Content = Text | Image;",
      "export const publish = (content: readonly Content[]): void => post(content);",
    ]),
  });
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Text.mark", "Image.alt"]);
});

test("a value lands in a string-or-list library slot through the list arm", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule(["export interface Part { readonly text: string }", "export declare function say(content: string | readonly Part[]): void;"]),
    ...source([
      'import { say } from "lib";',
      "export interface Piece { readonly text: string; readonly color: string }",
      "export const speak = (pieces: readonly Piece[]): void => say(pieces);",
    ]),
  });
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Piece.color"]);
});

test("a written data attribute is sent, a written aria attribute is read, and an unwritten one stays untouched", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'export interface Props { readonly "data-x"?: string; readonly "aria-label"?: string; readonly "aria-unused"?: string }',
      "declare function element(props: Props): void;",
      'export const draw = (): void => element({ "data-x": "1", "aria-label": "go" });',
    ]),
  );
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Props.data-x"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Props.aria-unused"]);
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual([]);
});

// A literal checked by `satisfies` and handed into an opaque slot leaves as the checked shape: the type's members are
// sent where the value goes, a library or a file through an in-tree helper.
test("a value checked by satisfies and handed into an opaque slot sends the checked type's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule(["export declare function render(value: Readonly<Record<string, unknown>>): string;"], "render"),
    ...source([
      'import { render } from "render";',
      "declare function writeFileSync(path: string, data: string): void;",
      "export interface View { readonly shown: string }",
      "export interface Bundle { readonly saved: number }",
      'export const shown = (): string => render({ shown: "s" } satisfies View);',
      'const download = (payload: unknown): void => writeFileSync("out.json", JSON.stringify(payload));',
      "export const saved = (): void => download({ saved: 1 } satisfies Bundle);",
    ]),
  });
  expect(scan.members.unwired.map(({ key, bucket, sent }) => [key.slice(FILE.length + 1), bucket, sent])).toEqual([
    ["View.shown", "member-sent-only", [`dependency ${FILE}:5 render`]],
    ["Bundle.saved", "member-sent-only", [`file ${FILE}:7`]],
  ]);
});

// An in-tree body that only consumes a value it takes (tests it, voids it), itself or through a helper it calls, drops
// it: nothing receives the value, so it does not escape. A body that returns, stores or passes the value on along any
// path keeps the escape, even beside a drop on another path.
test("a value an in-tree body drops on every path is not sent; one it passes on along any path is", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule(["export declare function json(value: object): string;"]),
    ...source([
      'import { json } from "lib";',
      "export interface Ignored { readonly a: string }",
      "export interface Helped { readonly b: string }",
      "export interface Returned { readonly c: string }",
      "export interface Stored { readonly d: string }",
      "export interface Passed { readonly e: string }",
      "const ignore = (value: unknown): void => { void value; };",
      "const quiet = (value: unknown): void => { if (value === null) { return; } ignore(value); };",
      "const keep = (value: unknown): unknown => { if (value === null) { return undefined; } return value; };",
      "const cache: { held: unknown } = { held: undefined };",
      "const stash = (value: unknown): void => { void value; cache.held = value; };",
      "const forward = (value: unknown): string => (typeof value === 'object' && value !== null ? json(value) : '');",
      'export const run = (): void => { ignore({ a: "a" } satisfies Ignored); quiet({ b: "b" } satisfies Helped); };',
      'export const kept = (): unknown => keep({ c: "c" } satisfies Returned);',
      'export const stashed = (): void => stash({ d: "d" } satisfies Stored);',
      'export const forwarded = (): string => forward({ e: "e" } satisfies Passed);',
    ]),
  });
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["Ignored.a", "Helped.b", "cache.held"]);
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Returned.c", "Stored.d", "Passed.e"]);
});

// A slot with a string index signature names some members and takes the rest as open entries: the members it does not
// name leave with whatever reads the slot, here a library logger through an in-tree sink, nested members too. The member
// it names pairs, so a read of the slot's member reads it.
test("a value's members a string-index slot does not name are sent where the slot's value goes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...libraryModule(["export interface Logger { debug<T extends object>(obj: T, msg?: string): void }"], "pino"),
    ...source([
      'import type { Logger } from "pino";',
      "export interface Trace { readonly built: number }",
      "export interface Entry { readonly event: string; readonly trace: Trace }",
      "export interface LogRecord { readonly event: string; readonly [field: string]: unknown }",
      "const record = (entry: LogRecord, base: Logger): void => base.debug({ memory: true, ...entry }, entry.event);",
      "export const build = (base: Logger): void => {",
      "  const sink = { log: (entry: Entry): void => record(entry, base) };",
      '  sink.log({ event: "e", trace: { built: 1 } });',
      "};",
    ]),
  });
  expect(scan.members.unwired.map(({ key, bucket, sent }) => [key.slice(FILE.length + 1), bucket, sent])).toEqual([
    ["Trace.built", "member-sent-only", [`log ${FILE}:7 pino`]],
    ["Entry.trace", "member-sent-only", [`log ${FILE}:7 pino`]],
  ]);
});
