// `pnpm unwired removed-keys`: a deletion branch's removed contract keys that a sender outside the server still writes.
// `z.object` strips an unknown key silently and an `as const` writer passes the compiler, so the check reads every
// sender the resolver places. A sender is a write the resolver places on the shape the key was removed from, or a key
// of a loose object (`Record<string, unknown>`) that flows into one of our tRPC procedures or our own HTTP routes. A
// key on another declared member is someone else's field; a key the resolver cannot place is listed, never failed on.
// The worlds load from the working tree, so `head` must be the checked-out commit.

import type { CallExpression, Expression, Identifier, Node, SourceFile } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isConditionalExpression,
  isElementAccessExpression,
  isIdentifier,
  isInterfaceDeclaration,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isStringLiteral,
  isTemplateExpression,
  isTypeAliasDeclaration,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, NodeHandle, Type } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import ts from "typescript";
import { execGit } from "../floor/git/git.ts";
import { TEST_WORLDS } from "../floor/testing/test-worlds.ts";
import type { KeyResolution } from "./key-resolver.ts";
import { resolveKeys } from "./key-resolver.ts";
import { gitGrep } from "./literal-hits.ts";
import type { PropertyName } from "./native.ts";
import { constituents, declarationKeys, homeFiles, isPropertyName, NativeWorld } from "./native.ts";
import { packageWorlds } from "./worlds.ts";

/** Where a removed key is declared: the contracts and the server's transport. */
const CONTRACT_PATHS = ["packages/contracts/src", "packages/server/src/transport"] as const;

const RECEIVERS = ["client", "plugins", "e2e"] as const;
/** The senders a stripped key fails silently in. */
type Receiver = (typeof RECEIVERS)[number];

const RECEIVER_PATHS: Readonly<Record<Receiver, readonly string[]>> = {
  client: ["packages/client"],
  plugins: ["packages/showcase-plugins", "packages/plugin-sdk", "packages/plugin-toolchain"],
  e2e: ["tests/e2e"],
};

const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/u;
const PARSED = /\.[cm]?tsx?$/u;
// `git cat-file --batch` prints each blob after this mark and its request, so the split needs no byte counts.
const BLOB_MARK = /^@@B (\S+)$/mu;
const BLOB_FORMAT = "--batch=@@B %(rest)";
// Every contract file of a wide deletion fits one batch read.
const BLOB_BUFFER = 268_435_456;

// A tRPC client call: its callee chain names the procedure, `trpc.chat.send.mutate(input)` sends to `chat.send`.
const TRPC_CALLS: ReadonlySet<string> = new Set(["mutate", "mutateAsync", "query", "subscribe"]);
// A `fetch` whose URL is a path on our own origin sends its body to our routes; an absolute URL leaves the repo.
const FETCH = "fetch";
const SERIALIZE = "JSON.stringify";
const OWN_ROUTE = /^\//u;
const OUTSIDE_WORLDS = "outside every world";
// A string with the key's text that sits in no key slot: a plain value, listed for a person.
const NO_KEY_POSITION = "no key position";

/** One site in a receiver: the receiver, `file:line` and the line's text. */
interface Hit {
  readonly receiver: Receiver;
  readonly at: string;
  readonly text: string;
}

/** One key the branch removes, the shapes it was removed from, and what the resolver made of every site naming it. */
interface RemovedKey {
  readonly key: string;
  /** The declarations that dropped it, `file:Home`. */
  readonly homes: readonly string[];
  /** Writes the resolver places on a shape that dropped the key. */
  readonly senders: readonly Hit[];
  /** Keys of a loose object that flows into one of our procedures or routes, with that destination. */
  readonly loose: readonly (Hit & { readonly destination: string })[];
  /** Sites the resolver could not place, or an open slot bound outside the repo, with the reason. */
  readonly unresolved: readonly (Hit & { readonly reason: string })[];
  /** Sites the resolver places on another declared member: a same-named field of another shape. */
  readonly other: number;
}

/** What the check found between `base` and `head`. */
export interface RemovedKeysReport {
  readonly base: string;
  readonly head: string;
  /** Files searched in each receiver at `head`. */
  readonly scanned: Readonly<Record<Receiver, number>>;
  readonly removed: readonly RemovedKey[];
  /** True when a removed key has a sender or a loose sender. */
  readonly failed: boolean;
}

/** The repository, the revisions to compare, and the worlds that hold the senders (every package and test world by
 *  default). */
export interface RemovedKeysOptions {
  readonly root: string;
  readonly base: string;
  readonly head: string;
  readonly worlds?: readonly string[];
}

// The declaration a key sits in, by its name: an interface, a type alias or a schema's variable.
function homeOf(node: ts.Node): string | null {
  for (let at: ts.Node = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if ((ts.isInterfaceDeclaration(at) || ts.isTypeAliasDeclaration(at) || ts.isVariableDeclaration(at)) && ts.isIdentifier(at.name)) {
      return at.name.text;
    }
  }
  return null;
}

// How many times a file declares each key in each home: an interface or type member, a schema or literal key, a
// shorthand. The parser sees a key wherever it sits, a one-line `z.object({ a: … })` included.
function declaredKeys(file: string, text: string): ReadonlyMap<string, number> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const into = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    const named = ts.isPropertySignature(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) ? node.name : undefined;
    const home = named === undefined ? null : homeOf(node);
    if (named !== undefined && home !== null && (ts.isIdentifier(named) || ts.isStringLiteral(named))) {
      const pair = JSON.stringify([home, named.text]);
      into.set(pair, (into.get(pair) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return into;
}

// Each file's text at `rev`, one batch read. A file the rev lacks (added or deleted on the branch) declares nothing, and
// is left out of the request because `cat-file` answers it with an unmarked `missing` line.
function blobsAt(root: string, rev: string, files: readonly string[]): ReadonlyMap<string, string> {
  if (files.length === 0) {
    return new Map();
  }
  const present = execGit(root, ["ls-tree", "-r", "--name-only", rev, "--", ...files])
    .split("\n")
    .filter(Boolean);
  const input = present.map((file) => `${rev}:${file} ${file}\n`).join("");
  const parts = execGit(root, ["cat-file", BLOB_FORMAT], { input, maxBuffer: BLOB_BUFFER }).split(BLOB_MARK);
  const found = new Map<string, string>();
  for (let at = 1; at < parts.length; at += 2) {
    found.set(parts[at] ?? "", parts[at + 1] ?? "");
  }
  return found;
}

function keyCounts(root: string, rev: string, files: readonly string[]): ReadonlyMap<string, ReadonlyMap<string, number>> {
  return new Map([...blobsAt(root, rev, files)].map(([file, text]) => [file, declaredKeys(file, text)]));
}

/** A removed key's home at `head`: the file and the declaration name that dropped it. */
interface Home {
  readonly file: string;
  readonly name: string;
}

// The keys some changed contract declaration names fewer times at `head` than at the merge base, by declaration: a key
// reformatted or moved inside one declaration is still there, and a key moved to another declaration is removed from
// its old home, since a sender of the old home's procedure now sends a stripped key.
function removedKeys(root: string, base: string, head: string): ReadonlyMap<string, readonly Home[]> {
  const files = execGit(root, ["diff", "--name-only", "--no-renames", `${base}...${head}`, "--", ...CONTRACT_PATHS])
    .split("\n")
    .filter((file) => PARSED.test(file));
  const fork = execGit(root, ["merge-base", base, head]).trim();
  const after = keyCounts(root, head, files);
  const removed = new Map<string, Home[]>();
  for (const [file, before] of keyCounts(root, fork, files)) {
    for (const [pair, count] of before) {
      const [name, key] = JSON.parse(pair) as [string, string];
      if ((after.get(file)?.get(pair) ?? 0) < count) {
        removed.set(key, [...(removed.get(key) ?? []), { file, name }]);
      }
    }
  }
  return new Map([...removed].sort(([a], [b]) => a.localeCompare(b)));
}

const receiverOf = (file: string): Receiver | null =>
  RECEIVERS.find((receiver) => RECEIVER_PATHS[receiver].some((path) => file === path || file.startsWith(`${path}/`))) ?? null;

// The span of each removed home's declaration at `head` in a world's parse.
function homeSpans(world: NativeWorld, homes: readonly Home[]): readonly { readonly file: string; readonly pos: number; readonly end: number }[] {
  return homes.flatMap(({ file, name }) => {
    const source = world.source(file);
    const spans: { readonly file: string; readonly pos: number; readonly end: number }[] = [];
    const visit = (node: Node): void => {
      const named =
        (isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isVariableDeclaration(node)) && isIdentifier(node.name) && node.name.text === name;
      if (named) {
        spans.push({ file, pos: node.pos, end: node.end });
      }
      node.forEachChild(visit);
    };
    source?.forEachChild(visit);
    return spans;
  });
}

// Whether any of the handles is declared inside one of the spans.
function* declaredIn(world: NativeWorld, handles: readonly NodeHandle[], spans: ReturnType<typeof homeSpans>): APIRequestGenerator<boolean> {
  const inTree = handles.filter((handle) => world.fileOf(handle) !== null);
  const nodes = yield* all(...inTree.map((handle) => handle.resolve.gen()));
  return nodes.some(
    (node, at) =>
      node !== undefined && spans.some((span) => span.file === world.fileOf(inTree[at] as NodeHandle) && node.pos >= span.pos && node.end <= span.end),
  );
}

// Whether a holder type is the shape the key was removed from: the type itself, or any of its members, is declared in
// the home. A zod schema's inferred type has no declaration of its own; its members are the schema's keys.
function* holdsHome(world: NativeWorld, holder: Type, spans: ReturnType<typeof homeSpans>): APIRequestGenerator<boolean> {
  const handles: NodeHandle[] = [];
  for (const member of yield* constituents(holder)) {
    const [symbol, alias, properties] = yield* all(member.getSymbol.gen(), member.getAliasSymbol.gen(), world.checker.getPropertiesOfType.gen(member));
    handles.push(...(symbol?.declarations ?? []), ...(alias?.declarations ?? []), ...properties.flatMap((property) => property.declarations));
  }
  return yield* declaredIn(world, handles, spans);
}

/** What one site comes to. */
type Verdict =
  | { readonly kind: "sender" }
  | { readonly kind: "other" }
  | { readonly kind: "loose"; readonly destination: string }
  | { readonly kind: "unresolved"; readonly reason: string };

// --- Loose objects ------------------------------------------------------------------------------------------------

// Through parentheses and assertions to the expression a value is.
function outerOf(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at.parent) || isAsExpression(at.parent) || isSatisfiesExpression(at.parent) || isNonNullExpression(at.parent)) {
    at = at.parent;
  }
  return at;
}

// The procedure or own route a value is handed to, climbing through literals that carry it: a property value, a
// shorthand, a spread, an array element, a conditional branch and a JSON serialization. Null for any other end.
function destinationOf(value: Node): string | null {
  let at = outerOf(value);
  for (;;) {
    const { parent } = at;
    if (isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isSpreadAssignment(parent)) {
      at = outerOf(parent.parent);
    } else if (isObjectLiteralExpression(parent) || isArrayLiteralExpression(parent) || isConditionalExpression(parent)) {
      at = outerOf(parent);
    } else if (isCallExpression(parent) && parent.expression.getText() === SERIALIZE) {
      at = outerOf(parent);
    } else {
      return isCallExpression(parent) ? callDestination(parent, at) : null;
    }
  }
}

function callDestination(call: CallExpression, argument: Node): string | null {
  const callee = call.expression;
  if (isPropertyAccessExpression(callee) && TRPC_CALLS.has(callee.name.text)) {
    const chain: string[] = [];
    let at: Expression = callee.expression;
    while (isPropertyAccessExpression(at)) {
      chain.unshift(at.name.text);
      at = at.expression;
    }
    return chain.length === 0 ? null : `trpc ${chain.join(".")}`;
  }
  const path = urlPrefix(call.arguments[0]);
  return isIdentifier(callee) && callee.text === FETCH && call.arguments.indexOf(argument as Expression) > 0 && path !== null && OWN_ROUTE.test(path)
    ? `http ${path}`
    : null;
}

// The text a URL argument starts with: a literal's whole text, a template's head.
function urlPrefix(url: Node | undefined): string | null {
  if (url !== undefined && (isStringLiteral(url) || isNoSubstitutionTemplateLiteral(url))) {
    return url.text;
  }
  return url !== undefined && isTemplateExpression(url) ? url.head.text : null;
}

// The value a loose key is a key of: its object literal, or the receiver of an element or property write.
function looseValue(node: Node): Node | null {
  const { parent } = node;
  if ((isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent)) && isObjectLiteralExpression(parent.parent)) {
    return parent.parent;
  }
  return isElementAccessExpression(parent) || isPropertyAccessExpression(parent) ? parent.expression : null;
}

// The identifier a value is bound to, when the value is a variable's initializer or names one.
function boundName(value: Node): Identifier | null {
  if (isIdentifier(value)) {
    return value;
  }
  const outer = outerOf(value);
  return isVariableDeclaration(outer.parent) && outer.parent.initializer === outer && isIdentifier(outer.parent.name) ? outer.parent.name : null;
}

// Where each loose value goes: straight from the literal, or from any use of the variable it is bound to in its file.
function looseDestinations(world: NativeWorld, values: readonly Node[]): readonly (string | null)[] {
  const bound = values.map(boundName);
  const symbols = world.symbolsAt(bound.flatMap((name) => (name === null ? [] : [name])));
  let next = 0;
  const keys = bound.map((name) => (name === null ? [] : (symbols[next++]?.declarations ?? []).flatMap((handle) => `${handle.path}#${handle.index}`)));
  const uses = bound.map((name) => (name === null ? [] : identifiersNamed(name.getSourceFile(), name.text).filter((use) => use !== name)));
  const plain = uses.flat().filter((use) => !isShorthandPropertyAssignment(use.parent));
  const shorthand = uses.flat().filter((use) => isShorthandPropertyAssignment(use.parent));
  const plainKeys = new Map(world.symbolsAt(plain).map((symbol, at) => [plain[at], symbol === undefined ? [] : declarationKeys(symbol)] as const));
  const shorthandKeys = new Map(
    world
      .shorthandValues(shorthand.map((use) => use.parent))
      .map((symbol, at) => [shorthand[at], symbol === undefined ? [] : declarationKeys(symbol)] as const),
  );
  return values.map((value, at) => {
    const own = keys[at] ?? [];
    const reaching = (uses[at] ?? []).filter((use) => (plainKeys.get(use) ?? shorthandKeys.get(use) ?? []).some((key) => own.includes(key)));
    const found = [value, ...reaching].map(destinationOf).find((destination) => destination !== null);
    return found ?? null;
  });
}

function identifiersNamed(source: SourceFile, text: string): readonly Node[] {
  const found: Node[] = [];
  const visit = (node: Node): void => {
    if (isIdentifier(node) && node.text === text) {
      found.push(node);
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}

// --- The check ----------------------------------------------------------------------------------------------------

// Each candidate's verdict: placed on the removed home, placed elsewhere, loose into our server, or unplaced.
function verdicts(world: NativeWorld, candidates: readonly Node[], homesOf: (node: Node) => readonly Home[]): readonly Verdict[] {
  const resolutions = resolveKeys(
    world,
    candidates.map((node) => ({ node })),
  );
  const spans = candidates.map((node) => homeSpans(world, homesOf(node)));
  const placed = world.batch(
    resolutions.map(function* (resolution, at): APIRequestGenerator<boolean> {
      const span = spans[at] ?? [];
      if (resolution === null || resolution.outcome === "open") {
        return false;
      }
      if (resolution.outcome === "members") {
        return yield* declaredIn(
          world,
          resolution.members.flatMap((member) => member.declarations),
          span,
        );
      }
      return (yield* all(...resolution.holders.map((holder) => holdsHome(world, holder, span)))).some(Boolean);
    }),
  );
  const open = resolutions.flatMap((resolution, at) => (resolution?.outcome === "open" ? [at] : []));
  const values = open.map((at) => looseValue(candidates[at] as Node));
  const reached = looseDestinations(
    world,
    values.flatMap((value) => (value === null ? [] : [value])),
  );
  const looseAt = new Map<number, string | null>();
  let next = 0;
  for (const [index, at] of open.entries()) {
    looseAt.set(at, values[index] === null ? null : (reached[next++] ?? null));
  }
  return resolutions.map((resolution, at) => verdictOf(resolution, placed[at] === true, looseAt.get(at) ?? null));
}

function verdictOf(resolution: KeyResolution | null, placed: boolean, loose: string | null): Verdict {
  if (placed) {
    return { kind: "sender" };
  }
  if (resolution === null) {
    return { kind: "unresolved", reason: NO_KEY_POSITION };
  }
  if (resolution.outcome === "members") {
    return { kind: "other" };
  }
  if (resolution.outcome === "open") {
    return loose === null ? { kind: "unresolved", reason: "open slot sent outside the repo" } : { kind: "loose", destination: loose };
  }
  return { kind: "unresolved", reason: resolution.reason };
}

function hitOf(world: NativeWorld, node: Node, receiver: Receiver): Hit {
  const source = node.getSourceFile();
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  const site = world.siteOf(node);
  return { receiver, at: `${site.file}:${String(line + 1)}`, text: (source.text.split("\n")[line] ?? "").trim() };
}

interface Tally {
  readonly senders: Hit[];
  readonly loose: (Hit & { readonly destination: string })[];
  readonly unresolved: (Hit & { readonly reason: string })[];
  other: number;
}

// Every name or string key in a world's receiver files that spells a removed key, with its verdict.
function scanWorld(world: NativeWorld, files: readonly string[], removed: ReadonlyMap<string, readonly Home[]>, tallies: ReadonlyMap<string, Tally>): void {
  const candidates: PropertyName[] = [];
  for (const file of files) {
    const visit = (node: Node): void => {
      if (isPropertyName(node) && removed.has(node.text)) {
        candidates.push(node);
      }
      node.forEachChild(visit);
    };
    world.source(file)?.forEachChild(visit);
  }
  const found = verdicts(world, candidates, (node) => removed.get((node as PropertyName).text) ?? []);
  for (const [at, node] of candidates.entries()) {
    const tally = tallies.get(node.text);
    const receiver = receiverOf(world.siteOf(node).file);
    const verdict = found[at];
    if (tally === undefined || receiver === null || verdict === undefined) {
      continue;
    }
    // A property-position identifier that is no key (a local binding of the same name) answers null and is no site.
    if (!(verdict.kind === "unresolved" && verdict.reason === NO_KEY_POSITION && isIdentifier(node))) {
      record(tally, hitOf(world, node, receiver), verdict);
    }
  }
}

function record(tally: Tally, hit: Hit, verdict: Verdict): void {
  if (verdict.kind === "sender") {
    tally.senders.push(hit);
  } else if (verdict.kind === "loose") {
    tally.loose.push({ ...hit, destination: verdict.destination });
  } else if (verdict.kind === "unresolved") {
    tally.unresolved.push({ ...hit, reason: verdict.reason });
  } else {
    tally.other += 1;
  }
}

// Resolve every receiver site in each world that homes it; the receiver files the worlds hold.
function scanWorlds(
  root: string,
  configs: readonly string[],
  removed: ReadonlyMap<string, readonly Home[]>,
  tallies: ReadonlyMap<string, Tally>,
): ReadonlySet<string> {
  const homes = homeFiles(configs, NativeWorld.fileLists(root, configs));
  const held = new Set<string>();
  for (const config of configs) {
    const files = [...(homes.get(config) ?? [])].filter((file) => receiverOf(file) !== null);
    for (const file of files) {
      held.add(file);
    }
    if (files.length > 0) {
      using world = NativeWorld.open(root, config);
      scanWorld(world, files, removed, tallies);
    }
  }
  return held;
}

// A receiver file no world holds (a JSON fixture, a script outside every program) is searched as text and listed.
function outsideWorlds(
  { root, head, held }: { readonly root: string; readonly head: string; readonly held: ReadonlySet<string> },
  tallies: ReadonlyMap<string, Tally>,
): void {
  for (const [key, tally] of tallies) {
    for (const receiver of RECEIVERS) {
      for (const { file, line, text } of gitGrep(root, head, ["-w", "-F", key], RECEIVER_PATHS[receiver])) {
        if (!(held.has(file) || COMMENT_LINE.test(text))) {
          tally.unresolved.push({ receiver, at: `${file}:${String(line)}`, text: text.trim(), reason: OUTSIDE_WORLDS });
        }
      }
    }
  }
}

/** Compare `head` with its merge base against `base`, and resolve every receiver site at `head` that names a removed key. */
export function checkRemovedKeys(options: RemovedKeysOptions): RemovedKeysReport {
  const { root, base, head } = options;
  if (execGit(root, ["rev-parse", head]).trim() !== execGit(root, ["rev-parse", "HEAD"]).trim()) {
    throw new Error(`removed-keys resolves senders in the checked-out tree: check out ${head} first`);
  }
  const receiverFiles = RECEIVERS.map(
    (receiver) =>
      [
        receiver,
        execGit(root, ["ls-tree", "-r", "--name-only", head, "--", ...RECEIVER_PATHS[receiver]])
          .split("\n")
          .filter(Boolean),
      ] as const,
  );
  const scanned = Object.fromEntries(receiverFiles.map(([receiver, files]) => [receiver, files.length])) as Record<Receiver, number>;
  const removed = removedKeys(root, base, head);
  const tallies = new Map<string, Tally>([...removed.keys()].map((key) => [key, { senders: [], loose: [], unresolved: [], other: 0 }]));
  const held = removed.size === 0 ? new Set<string>() : scanWorlds(root, options.worlds ?? [...packageWorlds(root), ...TEST_WORLDS], removed, tallies);
  outsideWorlds({ root, head, held }, tallies);
  const entries = [...removed].map(
    ([key, from]): RemovedKey => ({ key, homes: from.map(({ file, name }) => `${file}:${name}`), ...(tallies.get(key) as Tally) }),
  );
  return { base, head, scanned, removed: entries, failed: entries.some((entry) => entry.senders.length > 0 || entry.loose.length > 0) };
}
