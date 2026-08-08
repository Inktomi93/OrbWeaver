// Gate: platform-spellings — the anti-backslide ratchet for the Node 21→26 maximal-adoption program §8
// (docs/design/node-26-adoption-program.md). Each ACTIVE arm is a RULED ADOPT/AVOID whose modern spelling
// W4 already burned down; the gate keeps the old spelling from creeping back through a copy-paste or an
// agent's pre-node-26 muscle memory. Both active arms land at ZERO on the tree — a LIVE-verified zero: the
// arm inventory was established by RUNNING the gate (node scripts/check/report.ts), not by ast-grep sweeps,
// which returned false negatives here for want of positive controls (and surfaced the 7 §4.5 captures below).
//
// ARM SLEEP (§4.1) — `new Promise((resolve) => setTimeout(resolve, ms))` (expr- or block-body) → the
//   `setTimeout` of `node:timers/promises`. The tell is precise: the executor passes its RESOLVE param
//   DIRECTLY as the timer callback, and its BODY never references reject. A timeout-REJECT race
//   (`setTimeout(() => reject(…), ms)`) is NOT a sleep — it passes an arrow, not the bare resolve identifier,
//   and references reject in the body — so it is never flagged (mustPass). The reject test reads the BODY,
//   not the executor: a param's own DECLARATION name is a descendant of the arrow, so an executor-wide sweep
//   made the exclusion DEGENERATE and silently passed every sleep with an unused second param — found by a
//   fresh verifier, 2026-08-07, planted receipt `(resolve, reject) => setTimeout(resolve, ms)` → 0 findings.
//   The callee test accepts the `globalThis.`/`window.`/`global.` qualified spellings too: a qualifier does
//   not make a sleep something else. CARVE-OUT `packages/{client,ui}`: those bundle to the BROWSER, where
//   `node:timers/promises` does not exist (route-guards.ts's `wait` is the sanctioned browser sleep, §4.1);
//   flagging it would demand a fix that does not exist, so the arm skips client/ui paths.
//
// ARM ESCAPE-MINT (§4.7) — a hand-rolled `RegExp.escape` re-mint, detected by NAME in every home a re-mint
//   can take: a function declaration, a `const … = (…) =>`/function expression, an object-literal or class
//   METHOD, and an object-literal property holding a function.
//   `RegExp.escape` is browser-baseline and a strict superset of every hand-roll; the kit `escapeRegExp` and
//   its duplicates were deleted in W4. DECLARED LIMIT: the arm is NAME-based only. An earlier char-class
//   heuristic ("a regex enumerating ≥8 metacharacters") was BUILT AND REMOVED — measured, it produced 27
//   FALSE POSITIVES on legitimate regexes (color validators, dice notation, markdown fences, a slash-command
//   parser): a real nameless escape-all class is not reliably separable from a complex regex by literal
//   shape. Every real re-mint on this tree was NAMED, so the name arm catches the whole live class at zero;
//   a nameless inline `.replace(/[.*+?…]/g, "\\$&")` (none exist in packages/**) is the accepted blind spot.
//
// TWO ARMS ARE DEFERRED, NOT DROPPED — each awaits its un-landed W4 sub-wave (both verified live at
// authoring, so the gate cannot enforce them green yet):
//   • DEFERRED→withResolvers (§4.5): a `new Promise` capturing its resolve/reject into an OUTER binding →
//     `Promise.withResolvers()`. W4.5 never landed — 7 live production captures remain (chat engine
//     lock-lost barrier, turn arrival re-arm, frame-queue, orphan guard, compose notify, app-ready). The
//     detection is sound (it found all 7, zero FP); the arm is added when the W4.5 burn-down lands.
//   • SPREAD-SORT (§4.2): `[...x].sort(fn)` → `x.toSorted(fn)`. W4.2 never landed (~40 live sites), and the
//     split of an array defensive-copy (→ toSorted) from an iterator materialization (`[...m.entries()]
//     .sort()`, KEEP) is genuinely TYPE-AWARE — §8 itself records "the gate cannot type." Added when W4.2
//     lands.
//
// SCOPE: `packages/**` only — tests/ and scripts/ are OUT, matching the LANDED `zod-modern-spellings`
//   precedent (a test may plant an old spelling DELIBERATELY as a fixture) and §8's own §4.1, which
//   explicitly sanctions "a tests/** scope decision." This exclusion is deliberate-and-precedented.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const PROMISE = "Promise";
/** Both spellings of the ambient timer — a `globalThis.` qualifier does not make a sleep something else. */
const SET_TIMEOUT_CALLEES: ReadonlySet<string> = new Set(["setTimeout", "globalThis.setTimeout", "global.setTimeout", "window.setTimeout"]);
const ESCAPE_NAMES: ReadonlySet<string> = new Set(["escapeRegExp", "escapeRegex"]);
const SCAN_PREFIX = "packages/";
const BROWSER_ROOTS: readonly string[] = ["packages/client/", "packages/ui/"];
const LEADING_SLASH_RE = /^\/+/u;

const SLEEP_MESSAGE =
  "a hand-rolled sleep `new Promise((resolve) => setTimeout(resolve, ms))` — import `setTimeout` from " +
  "`node:timers/promises` and `await setTimeout(ms)` (node-26 adoption program §4.1). A timeout-REJECT race " +
  "is a different construct and is never flagged.";

const ESCAPE_MESSAGE =
  "a hand-rolled RegExp-escape re-mint — use the platform `RegExp.escape(str)` (node-26 adoption program " +
  "§4.7). It is browser-baseline and a strict superset of every hand-roll; the kit `escapeRegExp` and its " +
  "duplicates were deleted in W4.";

const GROUP_MESSAGE =
  "a superseded pre-node-26 spelling — the node-26 maximal-adoption program (docs/design/" +
  "node-26-adoption-program.md §8) ruled the modern spelling is THE spelling and W4 burned the sites down. " +
  "`new Promise(setTimeout)` sleeps → `node:timers/promises` setTimeout (§4.1); a hand-rolled RegExp escape " +
  "(a function named escapeRegExp/escapeRegex) → `RegExp.escape` (§4.7).";

const FIX =
  'SLEEP: `import { setTimeout } from "node:timers/promises"; await setTimeout(ms)`. ESCAPE: `RegExp.escape(str)` — delete the hand-rolled escapeRegExp.';

function repoRel(path: string): string {
  const idx = path.indexOf(`/${SCAN_PREFIX}`);
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
}

function isBrowserPath(rel: string): boolean {
  return BROWSER_ROOTS.some((root) => rel.startsWith(root));
}

/** The executor (first arg) of `new Promise(<executor>)` when it is an arrow/function with ≥1 parameter. */
function promiseExecutor(node: Node): Node | undefined {
  if (!node.isKind(SyntaxKind.NewExpression) || node.getExpression().getText() !== PROMISE) {
    return;
  }
  const executor = node.getArguments()[0];
  if (executor === undefined || !(executor.isKind(SyntaxKind.ArrowFunction) || executor.isKind(SyntaxKind.FunctionExpression))) {
    return;
  }
  return executor.getParameters().length > 0 ? executor : undefined;
}

function paramNames(executor: Node): readonly string[] {
  if (!(executor.isKind(SyntaxKind.ArrowFunction) || executor.isKind(SyntaxKind.FunctionExpression))) {
    return [];
  }
  return executor.getParameters().flatMap((p) => {
    const name = p.getNameNode();
    return name.isKind(SyntaxKind.Identifier) ? [name.getText()] : [];
  });
}

/** The executor's BODY — a Block for a statement body, the expression itself for a concise-body arrow.
 *  Only ArrowFunction/FunctionExpression reach here (promiseExecutor's fence), both of which always have one. */
function executorBody(executor: Node): Node | undefined {
  if (!(executor.isKind(SyntaxKind.ArrowFunction) || executor.isKind(SyntaxKind.FunctionExpression))) {
    return;
  }
  return executor.getBody();
}

/** Every CallExpression in a body, INCLUDING the body itself: a concise-body arrow's body IS the
 *  `setTimeout(resolve, ms)` call, and `getDescendantsOfKind` excludes the node it is called on — so a
 *  descendants-only sweep would miss the single most common sleep spelling. */
function callsInBody(body: Node): readonly CallExpression[] {
  const nested = body.getDescendantsOfKind(SyntaxKind.CallExpression);
  return body.isKind(SyntaxKind.CallExpression) ? [body, ...nested] : nested;
}

/** ARM SLEEP: the executor passes its resolve param DIRECTLY to `setTimeout` and never references reject.
 *  The reject sweep reads the executor's BODY, never the executor itself: a parameter's own DECLARATION name
 *  node is a descendant of the arrow/function, so an `executor`-wide `Identifier` sweep matches `reject`
 *  merely because `(resolve, reject)` was WRITTEN — which made this exclusion degenerate and silently passed
 *  every plain sleep carrying an unused second param (`(resolve, reject)`, `(resolve, _reject)`). Measured on
 *  ts-morph: for `(resolve, reject) => setTimeout(resolve, ms)` the executor sweep yields
 *  ["resolve","reject","setTimeout","resolve","ms"] but the BODY sweep yields ["setTimeout","resolve","ms"];
 *  a genuine reject-race's body still contains `reject`, so the real races keep passing. Both body shapes are
 *  covered — an expression-body arrow's body is the CallExpression, a block body is the Block. */
function isSleepPromise(node: Node): boolean {
  const executor = promiseExecutor(node);
  if (executor === undefined) {
    return false;
  }
  const names = paramNames(executor);
  const resolveName = names[0];
  if (resolveName === undefined) {
    return false;
  }
  const body = executorBody(executor);
  if (body === undefined) {
    return false;
  }
  const rejectName = names[1];
  const identsInBody = body.getDescendantsOfKind(SyntaxKind.Identifier).map((i) => i.getText());
  if (rejectName !== undefined && identsInBody.includes(rejectName)) {
    return false; // reject is REFERENCED in the body → a timeout-reject race, not a sleep
  }
  return callsInBody(body).some((call) => {
    if (!SET_TIMEOUT_CALLEES.has(call.getExpression().getText())) {
      return false;
    }
    const first = call.getArguments()[0];
    if (first === undefined || !first.isKind(SyntaxKind.Identifier)) {
      return false;
    }
    return first.getText() === resolveName;
  });
}

/** ARM ESCAPE-MINT: a FUNCTION-valued binding named `escapeRegExp`/`escapeRegex`, in every home a re-mint can
 *  take — a function declaration, a `const … = (…) =>`, an object-literal or class METHOD, and an
 *  object-literal property holding a function. Returns its name node (so the finding anchors on the name). */
function escapeMintName(node: Node): Node | undefined {
  // Declarations that ARE a function by construction — the name alone decides.
  if (node.isKind(SyntaxKind.FunctionDeclaration) || node.isKind(SyntaxKind.MethodDeclaration)) {
    return escapeNamed(node.getNameNode());
  }
  // Bindings that merely HOLD a value — the value must be a function (a string named escapeRegExp is a
  // doc/label entry, not a re-mint).
  if (!(node.isKind(SyntaxKind.VariableDeclaration) || node.isKind(SyntaxKind.PropertyAssignment))) {
    return;
  }
  return isFunctionValued(node.getInitializer()) ? escapeNamed(node.getNameNode()) : undefined;
}

/** The name node, iff it spells one of the banned re-mint names. */
function escapeNamed(nameNode: Node | undefined): Node | undefined {
  return nameNode !== undefined && ESCAPE_NAMES.has(nameNode.getText()) ? nameNode : undefined;
}

function isFunctionValued(node: Node | undefined): boolean {
  return node !== undefined && (node.isKind(SyntaxKind.ArrowFunction) || node.isKind(SyntaxKind.FunctionExpression));
}

function report(node: Node, rel: string, message: string, ctx: GateRunCtx): void {
  ctx.report({ file: rel, line: node.getStartLineNumber(), column: 0, message });
}

export const gate: GateDescriptor = {
  name: "platform-spellings",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — docs/design/node-26-adoption-program.md §8",
  status: "active",
  scopeSafety: "incremental-safe", // per-file, syntactic verdicts — no cross-file state
  message: GROUP_MESSAGE,
  fix: FIX,
  // Scanned home, tests/scripts OUT — the zod-modern-spellings precedent + §8 §4.1 (see the header).
  scanRoot: (p) => p.includes(SCAN_PREFIX),
  kinds: [
    SyntaxKind.NewExpression,
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.VariableDeclaration,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.PropertyAssignment,
  ],

  visit: (node, sf, ctx) => {
    const rel = repoRel(sf.getFilePath());
    if (node.isKind(SyntaxKind.NewExpression)) {
      if (!isBrowserPath(rel) && isSleepPromise(node)) {
        report(node, rel, SLEEP_MESSAGE, ctx);
      }
      return;
    }
    const nameNode = escapeMintName(node);
    if (nameNode !== undefined) {
      report(nameNode, rel, ESCAPE_MESSAGE, ctx);
    }
  },

  mustFlag: [
    {
      files: "export const nap = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));\n",
      at: "packages/server/src/domain/probe-sleep/expr.ts",
      expect: { count: 1, messageIncludes: "node:timers/promises" },
      why: "ARM SLEEP expr-body — the exact hand-roll W4.1 burned across seven production sites; resolve is passed DIRECTLY to setTimeout",
    },
    {
      files: "export function nap(ms: number): Promise<void> {\n  return new Promise((resolve) => {\n    setTimeout(resolve, ms);\n  });\n}\n",
      at: "packages/server/src/domain/probe-sleep/block.ts",
      expect: { count: 1 },
      why: "ARM SLEEP block-body — the same sleep with a statement body, proving the arm is not expression-body-only",
    },
    {
      files: "export const napA = (ms: number): Promise<void> => new Promise((resolve, reject) => setTimeout(resolve, ms));\n",
      at: "packages/server/src/domain/probe-sleep/unused-reject.ts",
      expect: { count: 1, messageIncludes: "node:timers/promises" },
      why: "THE REGRESSION PIN (verifier-refuted 2026-08-07): a plain sleep declaring an UNUSED second param. The reject-exclusion used to sweep the whole executor, where the param's own DECLARATION name matches — so this exact code returned ZERO findings on the real tree. The sweep now reads the BODY; this row fails the moment anyone widens it back",
    },
    {
      files: "export const napB = (ms: number): Promise<void> => new Promise((resolve, _reject) => {\n  setTimeout(resolve, ms);\n});\n",
      at: "packages/server/src/domain/probe-sleep/unused-reject-underscore.ts",
      expect: { count: 1 },
      why: "the same degenerate-exclusion hole in its `_reject` spelling with a block body — an underscore-prefixed unused param is the idiom this repo writes, so it is the likelier real-world shape of the miss",
    },
    {
      files: "export const napC = (ms: number): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, ms));\n",
      at: "packages/server/src/domain/probe-sleep/globalthis.ts",
      expect: { count: 1 },
      why: "BLIND SPOT CLOSED (verifier-flagged): the callee test was an exact-text compare on `setTimeout`, so a `globalThis.`-qualified sleep slipped through. A qualifier does not make a sleep something else",
    },
    {
      files: "export function escapeRegExp(s: string): string {\n  return s;\n}\n",
      at: "packages/server/src/kit/probe-escape/decl.ts",
      expect: { count: 1, messageIncludes: "RegExp.escape" },
      why: "ARM ESCAPE-MINT decl — a function DECLARATION named escapeRegExp, the kit export W4.7 deleted",
    },
    {
      files: "export const helpers = {\n  escapeRegExp(s: string): string {\n    return s;\n  },\n};\n",
      at: "packages/server/src/kit/probe-escape/method.ts",
      expect: { count: 1 },
      why: "BLIND SPOT CLOSED (verifier-flagged): a re-mint hiding as an object-literal METHOD — the arm handled only function declarations and variable declarations, so a helpers-bag spelling was invisible",
    },
    {
      files: "export const helpers = {\n  escapeRegex: (s: string): string => s,\n};\n",
      at: "packages/server/src/kit/probe-escape/property.ts",
      expect: { count: 1 },
      why: "the property-assignment twin of the method spelling — a function-VALUED object property is the same re-mint; the arm requires the value to be a function so a plain string property named escapeRegex never matches",
    },
    {
      files: "export const escapeRegex = (s: string): string => s;\n",
      at: "packages/server/src/kit/probe-escape/arrow.ts",
      expect: { count: 1 },
      why: "ARM ESCAPE-MINT decl (arrow) — the `const escapeRegex = (…) =>` local re-mint form (body.ts carried its own copy); the name-binding arm covers both spellings",
    },
  ],
  mustPass: [
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
  ],
};
