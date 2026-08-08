// Gate: platform-spellings — the anti-backslide ratchet for the Node 21→26 maximal-adoption program §8
// (docs/design/node-26-adoption-program.md). Each ACTIVE arm is a RULED ADOPT/AVOID whose modern spelling
// W4 already burned down; the gate keeps the old spelling from creeping back through a copy-paste or an
// agent's pre-node-26 muscle memory. Both active arms land at ZERO on the tree — a LIVE-verified zero: the
// arm inventory was established by RUNNING the gate (node scripts/check/report.ts), not by ast-grep sweeps,
// which returned false negatives here for want of positive controls (and surfaced the 7 §4.5 captures below).
//
// ARM SLEEP (§4.1) — `new Promise((resolve) => setTimeout(resolve, ms))` (expr- or block-body) → the
//   `setTimeout` of `node:timers/promises`. The tell is precise: the executor passes its RESOLVE param
//   DIRECTLY as the timer callback and never references reject. A timeout-REJECT race (`setTimeout(() =>
//   reject(…), ms)`) is NOT a sleep — it passes an arrow, not the bare resolve identifier, and wires reject
//   — so it is never flagged (mustPass). CARVE-OUT `packages/{client,ui}`: those bundle to the BROWSER,
//   where `node:timers/promises` does not exist (route-guards.ts's `wait` is the sanctioned browser sleep,
//   §4.1); flagging it would demand a fix that does not exist, so the arm skips client/ui paths.
//
// ARM ESCAPE-MINT (§4.7) — a hand-rolled `RegExp.escape` re-mint, detected by NAME: a binding declared as
//   `escapeRegExp`/`escapeRegex` (function declaration OR `const … = (…) =>`/function expression).
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
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const PROMISE = "Promise";
const SET_TIMEOUT = "setTimeout";
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

/** ARM SLEEP: the executor passes its resolve param DIRECTLY to `setTimeout` and never references reject. */
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
  const rejectName = names[1];
  const identsInBody = executor.getDescendantsOfKind(SyntaxKind.Identifier).map((i) => i.getText());
  if (rejectName !== undefined && identsInBody.includes(rejectName)) {
    return false; // reject is wired → a timeout-reject race, not a sleep
  }
  return executor.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    if (call.getExpression().getText() !== SET_TIMEOUT) {
      return false;
    }
    const first = call.getArguments()[0];
    if (first === undefined || !first.isKind(SyntaxKind.Identifier)) {
      return false;
    }
    return first.getText() === resolveName;
  });
}

/** ARM ESCAPE-MINT: a binding named `escapeRegExp`/`escapeRegex` that is a function. Returns its name node. */
function escapeMintName(node: Node): Node | undefined {
  if (node.isKind(SyntaxKind.FunctionDeclaration)) {
    const nameNode = node.getNameNode();
    return nameNode !== undefined && ESCAPE_NAMES.has(nameNode.getText()) ? nameNode : undefined;
  }
  if (!(node.isKind(SyntaxKind.VariableDeclaration) && ESCAPE_NAMES.has(node.getName()))) {
    return;
  }
  const init = node.getInitializer();
  return init !== undefined && (init.isKind(SyntaxKind.ArrowFunction) || init.isKind(SyntaxKind.FunctionExpression)) ? node.getNameNode() : undefined;
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
  kinds: [SyntaxKind.NewExpression, SyntaxKind.FunctionDeclaration, SyntaxKind.VariableDeclaration],

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
      files: "export function escapeRegExp(s: string): string {\n  return s;\n}\n",
      at: "packages/server/src/kit/probe-escape/decl.ts",
      expect: { count: 1, messageIncludes: "RegExp.escape" },
      why: "ARM ESCAPE-MINT decl — a function DECLARATION named escapeRegExp, the kit export W4.7 deleted",
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
      why: "DECLARED DISTINCTION — a timeout-REJECT race wires reject and passes an ARROW (not the bare resolve) to setTimeout; it is not a sleep and has no node:timers/promises drop-in",
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
      files: "export const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;\nexport const DICE = /^(\\d*)d(\\d+)([+-]\\d+)?$/iu;\n",
      at: "packages/server/src/kit/probe-complex-regex/index.ts",
      why: "DECLARED LIMIT / REGRESSION FENCE — the exact class of regexes the REMOVED char-class heuristic false-flagged (a color validator + dice notation, each enumerating ≥8 metacharacters). The name-only ESCAPE arm never touches regex literals, so these must pass; this row pins that the 27-false-positive heuristic stays gone",
    },
  ],
};
