// Policy: platform-spellings — the Node 26 adoption ratchet for four retired spellings.
//
// SLEEP reports a new Promise executor that passes its resolve parameter directly to setTimeout and does
// not use reject; client and UI are carved out because node:timers/promises is unavailable in browsers.
// DEFERRED reports an executor assigning resolve/reject to an outer binding; handing a resolver through a
// call remains the declared escape-analysis limit. SPREAD-SORT reports [...x].sort only when same-file
// syntax proves x is an array; cross-file/inferred types remain the declared under-reach. ESCAPE-MINT
// reports function-valued declarations named escapeRegExp or escapeRegex; nameless regex bodies remain the
// declared limit after the removed body heuristic produced 27 false positives.
//
// The dispatcher supplies each node once. Promise descendants are inverted into invocation-local state
// keyed by their enclosing executor, so the policy performs no private descendant or definition walk.
// Lexical declarations come only through resolveLexicalValueDeclaration and cycles stop by declaration
// identity, with no arbitrary hop cap.
//
// POPULATION PORT: the legacy packages/ predicate maps to @packages across the six product roots. The final
// composite excludes the one-file showcase package added later; it contains no platform-spelling subject.
// Authority is the central ordinary positional waiver. Findings name exact authored positions: Promise for
// sleep/deferred, the array expression for spread-sort, and the declared escape function name.
//
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyProof } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { resolveLexicalValueDeclaration } from "../lib/reference-fact.ts";

const SET_TIMEOUT_CALLEES: ReadonlySet<string> = new Set(["setTimeout", "globalThis.setTimeout", "global.setTimeout", "window.setTimeout"]);
const ESCAPE_NAMES: ReadonlySet<string> = new Set(["escapeRegExp", "escapeRegex"]);
const BROWSER_ROOTS: readonly string[] = ["packages/client/", "packages/ui/"];
const ARRAY_RETURNING_METHODS: ReadonlySet<string> = new Set([
  "map",
  "filter",
  "slice",
  "concat",
  "flat",
  "flatMap",
  "split",
  "toSorted",
  "toReversed",
  "toSpliced",
  "with",
]);
const ARRAY_STATICS: ReadonlySet<string> = new Set(["Object.keys", "Object.values", "Object.entries", "Array.from", "Array.of"]);
const ARRAY_TYPE_NAMES: ReadonlySet<string> = new Set(["Array", "ReadonlyArray"]);

const GROUP_MESSAGE =
  "a superseded pre-node-26 spelling — the node-26 maximal-adoption program (docs/history/design/" +
  "node-26-adoption-program.md §8) ruled the modern spelling is THE spelling and W4 burned the sites down. " +
  "The reported source position identifies one of four arms: a hand-built sleep, an escaped Promise resolver, " +
  "a redundant spread before array sort, or a hand-rolled RegExp escape.";
const FIX =
  'SLEEP: `import { setTimeout } from "node:timers/promises"; await setTimeout(ms)`. DEFERRED: `const { promise, resolve } = Promise.withResolvers<T>()`. SPREAD-SORT: `arr.toSorted(fn)`. ESCAPE: `RegExp.escape(str)`. A deliberate site is waived with `@orb-waive platform-spellings(<position>): <reason>`, where <position> is the reported `Promise`, spread receiver, or escape function name.';

interface PromiseState {
  readonly node: MorphNode;
  readonly executor: MorphNode;
  readonly body: MorphNode;
  readonly params: readonly string[];
  readonly browser: boolean;
  rejectReferenced: boolean;
  sleepCall: boolean;
  deferredCapture: boolean;
}

function promiseState(node: MorphNode, relativePath: string): PromiseState | undefined {
  if (!Node.isNewExpression(node) || node.getExpression().getText() !== "Promise") {
    return;
  }
  const executor = node.getArguments()[0];
  if (executor === undefined || !(Node.isArrowFunction(executor) || Node.isFunctionExpression(executor))) {
    return;
  }
  const params = executor.getParameters().flatMap((parameter) => {
    const name = parameter.getNameNode();
    return Node.isIdentifier(name) ? [name.getText()] : [];
  });
  const body = executor.getBody();
  return {
    node,
    executor,
    body,
    params,
    browser: BROWSER_ROOTS.some((root) => relativePath.startsWith(root)),
    rejectReferenced: false,
    sleepCall: false,
    deferredCapture: false,
  };
}

function enclosingPromiseState(node: MorphNode, states: ReadonlyMap<object, PromiseState>): PromiseState | undefined {
  return node.getFirstAncestor((ancestor) => states.has(ancestor.compilerNode)) === undefined
    ? undefined
    : states.get(node.getFirstAncestor((ancestor) => states.has(ancestor.compilerNode))?.compilerNode ?? {});
}

function isInside(node: MorphNode, container: MorphNode): boolean {
  return node.getStart() >= container.getStart() && node.getEnd() <= container.getEnd();
}

function isArrayTypeNode(type: MorphNode | undefined): boolean {
  if (type === undefined) {
    return false;
  }
  if (Node.isArrayTypeNode(type) || Node.isTupleTypeNode(type)) {
    return true;
  }
  if (Node.isParenthesizedTypeNode(type)) {
    return isArrayTypeNode(type.getTypeNode());
  }
  if (Node.isTypeOperatorTypeNode(type)) {
    return type.getChildren().some(isArrayTypeNode);
  }
  if (Node.isUnionTypeNode(type)) {
    return type.getTypeNodes().every(isArrayTypeNode);
  }
  return Node.isTypeReference(type) && ARRAY_TYPE_NAMES.has(type.getTypeName().getText());
}

function destructuredPropertyTypeNode(declaration: MorphNode): MorphNode | undefined {
  if (!Node.isBindingElement(declaration)) {
    return;
  }
  const pattern = declaration.getParent();
  if (!Node.isObjectBindingPattern(pattern)) {
    return;
  }
  const binder = pattern.getParent();
  if (!(Node.isParameterDeclaration(binder) || Node.isVariableDeclaration(binder))) {
    return;
  }
  const annotation = binder.getTypeNode();
  if (annotation === undefined || !Node.isTypeLiteral(annotation)) {
    return;
  }
  return annotation.getProperty((declaration.getPropertyNameNode() ?? declaration.getNameNode()).getText())?.getTypeNode();
}

function callProvablyReturnsArray(call: MorphNode): boolean {
  if (!Node.isCallExpression(call)) {
    return false;
  }
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) && (ARRAY_STATICS.has(callee.getText()) || ARRAY_RETURNING_METHODS.has(callee.getName()));
}

function identifierProvablyArray(identifier: MorphNode, visited: Set<object>): boolean {
  if (!Node.isIdentifier(identifier)) {
    return false;
  }
  const resolved = resolveLexicalValueDeclaration(identifier);
  if (resolved.kind === "unresolved" || resolved.value.getSourceFile() !== identifier.getSourceFile()) {
    return false;
  }
  const declaration = resolved.value;
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    return isArrayTypeNode(declaration.getTypeNode()) || (initializer !== undefined && provablyArray(initializer, visited));
  }
  if (Node.isParameterDeclaration(declaration)) {
    return isArrayTypeNode(declaration.getTypeNode());
  }
  return isArrayTypeNode(destructuredPropertyTypeNode(declaration));
}

function provablyArray(node: MorphNode, visited: Set<object> = new Set<object>()): boolean {
  const value = unwrapExpression(node);
  if (visited.has(value.compilerNode)) {
    return false;
  }
  visited.add(value.compilerNode);
  if (Node.isArrayLiteralExpression(value)) {
    return true;
  }
  if (Node.isNonNullExpression(value)) {
    return provablyArray(value.getExpression(), visited);
  }
  if (Node.isBinaryExpression(value)) {
    const op = value.getOperatorToken().getKind();
    return (
      (op === SyntaxKind.QuestionQuestionToken || op === SyntaxKind.BarBarToken) &&
      (provablyArray(value.getRight(), visited) || provablyArray(value.getLeft(), visited))
    );
  }
  if (Node.isConditionalExpression(value)) {
    return provablyArray(value.getWhenTrue(), new Set(visited)) && provablyArray(value.getWhenFalse(), new Set(visited));
  }
  return callProvablyReturnsArray(value) || identifierProvablyArray(value, visited);
}

function spreadSortReceiver(node: MorphNode): MorphNode | undefined {
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "sort") {
    return;
  }
  const receiver = callee.getExpression();
  if (!Node.isArrayLiteralExpression(receiver)) {
    return;
  }
  const elements = receiver.getElements();
  const spread = elements.length === 1 ? elements[0] : undefined;
  if (spread === undefined || !Node.isSpreadElement(spread)) {
    return;
  }
  const source = spread.getExpression();
  return provablyArray(source) ? source : undefined;
}

function escapeMintName(node: MorphNode): MorphNode | undefined {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
    const name = node.getNameNode();
    return name !== undefined && ESCAPE_NAMES.has(name.getText()) ? name : undefined;
  }
  if (!(Node.isVariableDeclaration(node) || Node.isPropertyAssignment(node))) {
    return;
  }
  const initializer = node.getInitializer();
  if (initializer === undefined || !(Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
    return;
  }
  const name = node.getNameNode();
  return ESCAPE_NAMES.has(name.getText()) ? name : undefined;
}

interface PlatformProofInput {
  readonly files: string;
  readonly at: string;
  readonly expect?: { readonly count?: number; readonly token?: string; readonly line?: number; readonly messageIncludes?: string };
  readonly why: string;
}

function proof(row: PlatformProofInput): GatePolicyProof {
  return {
    mode: "types",
    files: { [row.at]: row.files },
    ...(row.expect === undefined ? {} : { expect: row.expect }),
    why: row.why,
  };
}

const PLATFORM_MUST_FLAG = [
  {
    files: "export const nap = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));\n",
    at: "packages/server/src/domain/probe-sleep/expr.ts",
    expect: { count: 1, token: "Promise" },
    why: "ARM SLEEP expr-body — the exact hand-roll W4.1 burned across seven production sites; resolve is passed DIRECTLY to setTimeout",
  },
  {
    files: "export function nap(ms: number): Promise<void> {\n  return new Promise((resolve) => {\n    setTimeout(resolve, ms);\n  });\n}\n",
    at: "packages/server/src/domain/probe-sleep/block.ts",
    expect: { count: 1, token: "Promise" },
    why: "ARM SLEEP block-body — the same sleep with a statement body, proving the arm is not expression-body-only",
  },
  {
    files: "export const napA = (ms: number): Promise<void> => new Promise((resolve, reject) => setTimeout(resolve, ms));\n",
    at: "packages/server/src/domain/probe-sleep/unused-reject.ts",
    expect: { count: 1, token: "Promise" },
    why: "THE REGRESSION PIN (verifier-refuted 2026-08-07): a plain sleep declaring an UNUSED second param. The reject-exclusion used to sweep the whole executor, where the param's own DECLARATION name matches — so this exact code returned ZERO findings on the real tree. The sweep now reads the BODY; this row fails the moment anyone widens it back",
  },
  {
    files: "export const napB = (ms: number): Promise<void> => new Promise((resolve, _reject) => {\n  setTimeout(resolve, ms);\n});\n",
    at: "packages/server/src/domain/probe-sleep/unused-reject-underscore.ts",
    expect: { count: 1, token: "Promise" },
    why: "the same degenerate-exclusion hole in its `_reject` spelling with a block body — an underscore-prefixed unused param is the idiom this repo writes, so it is the likelier real-world shape of the miss",
  },
  {
    files: "export const napC = (ms: number): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, ms));\n",
    at: "packages/server/src/domain/probe-sleep/globalthis.ts",
    expect: { count: 1, token: "Promise" },
    why: "BLIND SPOT CLOSED (verifier-flagged): the callee test was an exact-text compare on `setTimeout`, so a `globalThis.`-qualified sleep slipped through. A qualifier does not make a sleep something else",
  },
  {
    files: "export function escapeRegExp(s: string): string {\n  return s;\n}\n",
    at: "packages/server/src/kit/probe-escape/decl.ts",
    expect: { count: 1, messageIncludes: "superseded pre-node-26" },
    why: "ARM ESCAPE-MINT decl — a function DECLARATION named escapeRegExp, the kit export W4.7 deleted",
  },
  {
    files: "export const helpers = {\n  escapeRegExp(s: string): string {\n    return s;\n  },\n};\n",
    at: "packages/server/src/kit/probe-escape/method.ts",
    expect: { count: 1, messageIncludes: "superseded pre-node-26" },
    why: "BLIND SPOT CLOSED (verifier-flagged): a re-mint hiding as an object-literal METHOD — the arm handled only function declarations and variable declarations, so a helpers-bag spelling was invisible",
  },
  {
    files: "export const helpers = {\n  escapeRegex: (s: string): string => s,\n};\n",
    at: "packages/server/src/kit/probe-escape/property.ts",
    expect: { count: 1, messageIncludes: "superseded pre-node-26" },
    why: "the property-assignment twin of the method spelling — a function-VALUED object property is the same re-mint; the arm requires the value to be a function so a plain string property named escapeRegex never matches",
  },
  {
    files: "export const escapeRegex = (s: string): string => s;\n",
    at: "packages/server/src/kit/probe-escape/arrow.ts",
    expect: { count: 1, messageIncludes: "superseded pre-node-26" },
    why: "ARM ESCAPE-MINT decl (arrow) — the `const escapeRegex = (…) =>` local re-mint form (body.ts carried its own copy); the name-binding arm covers both spellings",
  },
  {
    files:
      "export function bridge(): { readonly ready: Promise<void>; readonly wake: () => void } {\n" +
      "  let wake = (): void => undefined;\n" +
      "  const ready = new Promise<void>((resolve) => {\n" +
      "    wake = resolve;\n" +
      "  });\n" +
      "  return { ready, wake };\n" +
      "}\n",
    at: "packages/server/src/domain/probe-deferred/resolve.ts",
    expect: { count: 1, token: "Promise" },
    why: "ARM DEFERRED founding shape — the resolve hand-out W4.5 burned at EIGHT production sites (app-ready, preset fork-choice ask, chat-engine lock-lost barrier, the turn DeltaBridge re-arm ×2, frame-queue wake, local-light orphan guard, compose drain notify). The 'six' this row used to claim was a stale snapshot the header had already corrected",
  },
  {
    files:
      "export function barrier(): Promise<never> {\n" +
      "  let fail!: (err: unknown) => void;\n" +
      "  const lost = new Promise<never>((_resolve, reject) => {\n" +
      "    fail = reject;\n" +
      "  });\n" +
      '  setTimeout(() => fail(new Error("lost")), 1);\n' +
      "  return lost;\n" +
      "}\n",
    at: "packages/server/src/domain/probe-deferred/reject.ts",
    expect: { count: 1, token: "Promise" },
    why: "ARM DEFERRED, the REJECT half with a definite-assignment `let x!` — the chat-engine lock-lost barrier + the local-light orphan guard; proves the arm is not resolve-only and reads past the `!` modifier",
  },
  {
    files:
      "type Row = { readonly rank: number };\n" +
      "export function order(rows: readonly Row[]): readonly Row[] {\n" +
      "  return [...rows].sort((a, b) => a.rank - b.rank);\n" +
      "}\n",
    at: "packages/server/src/domain/probe-spread-sort/annotated.ts",
    expect: { count: 1, messageIncludes: "superseded pre-node-26" },
    why: "ARM SPREAD-SORT founding shape — an ANNOTATED array parameter defensively copied to avoid mutating it; the single commonest of the 21 packages/** sites W4.2 converted",
  },
  {
    files:
      "type Row = { readonly rank: number };\n" +
      "export function order(all: readonly Row[]): readonly Row[] {\n" +
      "  return [...all.filter((r) => r.rank > 0)].sort((a, b) => a.rank - b.rank);\n" +
      "}\n",
    at: "packages/server/src/domain/probe-spread-sort/method.ts",
    expect: { count: 1, messageIncludes: "superseded pre-node-26" },
    why: "ARM SPREAD-SORT via an array-RETURNING built-in — `.filter()` already produced a fresh array, so the spread is a second wasted copy; proves the proof does not depend on a type annotation",
  },
  {
    files:
      'import type { ReactElement } from "react";\n' +
      "type Row = { readonly rank: number };\n" +
      "export function Rows({ rows }: { readonly rows: readonly Row[] }): ReactElement | null {\n" +
      "  const ranked = [...rows].sort((a, b) => a.rank - b.rank);\n" +
      "  return ranked.length === 0 ? null : null;\n" +
      "}\n",
    at: "packages/client/src/features/probe-spread-sort/components/destructured.tsx",
    expect: { count: 1, messageIncludes: "superseded pre-node-26" },
    why: "ARM SPREAD-SORT through the DESTRUCTURED-PROP idiom (`{ rows }: { rows: Row[] }`) — the client's dominant prop shape; without this resolution the arm would go blind on every component, which is how it reaches the rpg-journal / corpus-similarity sites",
  },
] satisfies readonly PlatformProofInput[];

const PLATFORM_MUST_PASS = [
  {
    files:
      "export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {\n" +
      "  return Promise.race([\n" +
      "    work,\n" +
      "    new Promise<T>((_resolve, reject) => {\n" +
      '      setTimeout(() => reject(new Error("timeout")), ms);\n' +
      "    }),\n" +
      "  ]);\n" +
      "}\n",
    at: "packages/server/src/domain/probe-race/index.ts",
    why: "DECLARED DISTINCTION — a timeout-REJECT race REFERENCES reject in its body and passes an ARROW (not the bare resolve) to setTimeout; it is not a sleep and has no node:timers/promises drop-in. NOTE this row passes for TWO independent reasons, which is exactly why it could not see the degenerate-exclusion hole — the unused-param mustFlag rows above are what pin that",
  },
  {
    files:
      "export function armed(ms: number): Promise<void> {\n" +
      "  return new Promise<void>((resolve, reject) => {\n" +
      "    setTimeout(resolve, ms);\n" +
      '    process.on("SIGINT", reject);\n' +
      "  });\n" +
      "}\n",
    at: "packages/server/src/domain/probe-race/armed.ts",
    why: "THE NARROW CASE the fix must not break: setTimeout(resolve, ms) IS present in the bare-resolve form, but reject is genuinely WIRED in the body — so this is a cancellable wait, not a plain sleep, and `node:timers/promises` alone cannot express it. Proves the body-scoped reject sweep still excludes real reject users (the 5 live reject-race sites rely on exactly this)",
  },
  {
    files: "export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));\n",
    at: "packages/client/src/features/auth/lib/route-guards.ts",
    why: "DECLARED LIMIT (client/ui carve-out) — route-guards.ts's browser sleep; node:timers/promises does not exist in a browser bundle (§4.1), so this exact sleep MUST pass under packages/client",
  },
  {
    files: 'import { setTimeout } from "node:timers/promises";\nexport const nap = (ms: number): Promise<void> => setTimeout(ms);\n',
    at: "packages/server/src/domain/probe-ok-sleep/index.ts",
    why: "ARM SLEEP's remedy — the node:timers/promises call; a bare setTimeout(ms) is not a `new Promise`, so it never matches",
  },
  {
    files:
      "export function once(url: string): Promise<Response> {\n" +
      "  return new Promise((resolve, reject) => {\n" +
      "    fetch(url).then(resolve, reject);\n" +
      "  });\n" +
      "}\n",
    at: "packages/server/src/domain/probe-normal-promise/index.ts",
    why: "a NORMAL Promise executor — it CALLS resolve/reject; the SLEEP arm keys on a setTimeout(resolve, …), which is absent here, so it passes",
  },
  {
    files: "export const remedy = (s: string): string => RegExp.escape(s);\n",
    at: "packages/server/src/kit/probe-ok-escape/index.ts",
    why: "ARM ESCAPE-MINT's remedy — the platform RegExp.escape; the binding is not named escapeRegExp/escapeRegex",
  },
  {
    files: 'export const docs = {\n  escapeRegExp: "use RegExp.escape instead",\n};\n',
    at: "packages/server/src/kit/probe-escape/string-prop.ts",
    why: "the function-VALUED fence on the new property/method arms — a property merely NAMED escapeRegExp whose value is a string (a doc/label table) is not a re-mint and must not flag",
  },
  {
    files: "export const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;\nexport const DICE = /^(\\d*)d(\\d+)([+-]\\d+)?$/iu;\n",
    at: "packages/server/src/kit/probe-complex-regex/index.ts",
    why: "DECLARED LIMIT / REGRESSION FENCE — the exact class of regexes the REMOVED char-class heuristic false-flagged (a color validator + dice notation, each enumerating ≥8 metacharacters). The name-only ESCAPE arm never touches regex literals, so these must pass; this row pins that the 27-false-positive heuristic stays gone",
  },
  {
    files:
      'import { setTimeout } from "node:timers/promises";\n' +
      "export function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (v: T) => void } {\n" +
      "  const { promise, resolve } = Promise.withResolvers<T>();\n" +
      "  void setTimeout(1);\n" +
      "  return { promise, resolve };\n" +
      "}\n",
    at: "packages/server/src/domain/probe-ok-deferred/index.ts",
    why: "ARM DEFERRED's remedy — `Promise.withResolvers()` is not a `new Promise`, so the arm can never match its own fix",
  },
  {
    files:
      "export function local(): Promise<void> {\n" +
      "  return new Promise<void>((resolve) => {\n" +
      "    let inner: () => void = (): void => undefined;\n" +
      "    inner = resolve;\n" +
      "    inner();\n" +
      "  });\n" +
      "}\n",
    at: "packages/server/src/domain/probe-deferred-local/index.ts",
    why: "DECLARED DISTINCTION — the assignment TARGET is declared INSIDE the executor, so the resolver never outlives it. That is a local shuffle, not a deferred promise, and `withResolvers` is not its fix",
  },
  {
    files:
      "declare function register(fn: () => void): void;\n" +
      "export function armed(): Promise<void> {\n" +
      "  return new Promise<void>((resolve) => {\n" +
      "    register(resolve);\n" +
      "  });\n" +
      "}\n",
    at: "packages/server/src/domain/probe-deferred-call/index.ts",
    why: "DECLARED LIMIT, not a distinction (verifier-flagged 2026-08-07) — a resolver handed out through a CALL is a REAL deferred promise that `withResolvers` also fixes, but the arm keys on `=` assignment and cannot see it. Closing it needs escape analysis the pure-AST harness cannot do. Pinned as a BASELINE so the blind spot is measured rather than assumed; it is not live today (every remaining packages/** `new Promise` is an inline wrapper), and this row turning RED means someone taught the arm to reach it",
  },
  {
    files:
      "export function counts(m: ReadonlyMap<string, number>): readonly [string, number][] {\n" +
      "  return [...m.entries()].sort((a, b) => b[1] - a[1]);\n" +
      "}\n" +
      "export function unique(xs: readonly string[]): readonly string[] {\n" +
      "  return [...new Set(xs)].sort((a, b) => b.length - a.length);\n" +
      "}\n",
    at: "packages/server/src/domain/probe-spread-keep/index.ts",
    why: "ARM SPREAD-SORT's DECLARED SPLIT — an iterator/Set materialization MUST keep its spread (in-place `.sort` on the fresh array is correct; `toSorted` there is a wasted second copy). These are the 13 packages/** sites W4.2 deliberately did NOT convert",
  },
  {
    files:
      "export function seen(): readonly string[] {\n" +
      "  const bucket = new Set<string>();\n" +
      '  bucket.add("a");\n' +
      "  return [...bucket].sort((a, b) => a.length - b.length);\n" +
      "}\n",
    at: "packages/server/src/domain/probe-spread-set-ident/index.ts",
    why: "ARM SPREAD-SORT precision — a BARE IDENTIFIER holding a Set. The arm resolves the declaration and finds `new Set(…)`, not an array proof, so it stays silent: an identifier spread is never flagged on sight",
  },
  {
    files:
      'import type { EmbedResponse } from "@orb/contracts/embeddings";\n' +
      "export function ordered(response: EmbedResponse): readonly { readonly index?: number }[] {\n" +
      "  return [...response.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));\n" +
      "}\n",
    at: "packages/server/src/domain/probe-spread-crossfile/index.ts",
    why: "DECLARED LIMIT (the harness is PURE-AST — see the header) — a property of a CROSS-PACKAGE type cannot be proven an array without the checker, so this real converted site (openrouter embed/image runners) is UNREACHABLE and passes. Same class: a query `.data`, a `for`-of tuple destructure, a contextually-typed callback param, an awaited port read. A checker-backed arm belongs at push tier",
  },
  {
    files:
      "type Row = { readonly rank: number };\n" +
      "export function order(rows: readonly Row[]): readonly Row[] {\n" +
      "  return rows.toSorted((a, b) => a.rank - b.rank);\n" +
      "}\n",
    at: "packages/server/src/domain/probe-ok-sorted/index.ts",
    why: "ARM SPREAD-SORT's remedy — `toSorted` has no `[...]` receiver, so the arm can never match its own fix",
  },
] satisfies readonly PlatformProofInput[];

export const gate = defineGate({
  id: "platform-spellings",
  family: "platform-spellings",
  authority: "ordinary",
  severity: "error",
  population: "@packages",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: GROUP_MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const states = new Map<object, PromiseState>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.NewExpression],
          visit: (node): void => {
            const state = promiseState(node, ctx.relativePath(node.getSourceFile()));
            if (state !== undefined) {
              states.set(state.executor.compilerNode, state);
            }
          },
        },
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node): void => {
            if (!Node.isIdentifier(node)) {
              return;
            }
            const state = enclosingPromiseState(node, states);
            const reject = state?.params[1];
            if (state !== undefined && reject !== undefined && isInside(node, state.body) && node.getText() === reject) {
              state.rejectReferenced = true;
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const state = enclosingPromiseState(node, states);
            if (state !== undefined) {
              const resolve = state.params[0];
              const first = node.getArguments()[0];
              if (
                resolve !== undefined &&
                SET_TIMEOUT_CALLEES.has(node.getExpression().getText()) &&
                first !== undefined &&
                Node.isIdentifier(first) &&
                first.getText() === resolve
              ) {
                state.sleepCall = true;
              }
            }
            const receiver = spreadSortReceiver(node);
            if (receiver !== undefined) {
              ctx.report.node(receiver);
            }
          },
        },
        {
          kinds: [SyntaxKind.BinaryExpression],
          visit: (node): void => {
            if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
              return;
            }
            const state = enclosingPromiseState(node, states);
            if (state === undefined) {
              return;
            }
            const right = node.getRight();
            if (!(Node.isIdentifier(right) && state.params.includes(right.getText()))) {
              return;
            }
            const left = node.getLeft();
            if (!Node.isIdentifier(left)) {
              state.deferredCapture = true;
              return;
            }
            const declaration = resolveLexicalValueDeclaration(left);
            state.deferredCapture ||= declaration.kind === "unresolved" || !isInside(declaration.value, state.executor);
          },
        },
        {
          kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.VariableDeclaration, SyntaxKind.MethodDeclaration, SyntaxKind.PropertyAssignment],
          visit: (node): void => {
            const name = escapeMintName(node);
            if (name !== undefined) {
              ctx.report.node(name);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const state of states.values()) {
          if (!state.browser && state.sleepCall && !state.rejectReferenced) {
            ctx.report.node(state.node, { token: "Promise", offset: state.node.getText().indexOf("Promise") });
          } else if (state.deferredCapture) {
            ctx.report.node(state.node, { token: "Promise", offset: state.node.getText().indexOf("Promise") });
          }
        }
      },
    };
  },
  mustFlag: PLATFORM_MUST_FLAG.map(proof),
  mustPass: PLATFORM_MUST_PASS.map(proof),
});
