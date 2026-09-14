// Policy: evaluate-no-scope-capture (#660) — a `.evaluate`/`.evaluateAll` FUNCTION callback (inline, or a
// module-scope function passed BY REFERENCE) that references a module-scope binding of THIS FILE is RED:
// Playwright serializes it via `Function.prototype.toString()` into the browser, where the binding does
// not exist, and it throws a silent in-page `ReferenceError` an instrument reads as "found nothing" (bit
// twice 2026-08-24: `markContrastCandidates` closed over `CONTRAST_MARK`). Sibling trap, NOT enforced here:
// the STRING form of `.evaluate` silently drops its `arg` (`tooling/src/snap/ops/overflow.ts` header) — a
// different failure, same "reads as nothing" shape; know both.
//
// ARMS: A) an inline `(el, args) => …` / `function (…) {…}` literal. B) a bare identifier resolving to a
// module-scope function/const-arrow in this file OR in an imported module. Both are scope-checked in the
// callback's DECLARING file through ts-morph symbol resolution — never name-matching.
//
// FAMILY: SINGLETON under its own id. No `lib/` reader answers this question and no sibling policy asks it:
// the §8.3 sweep for the core literals (`"evaluate"` / `evaluateAll` / a serialized-callback subject) over
// the whole gate corpus returns `ct-no-oneshot-live-read-assert` and `ct-poll-schedule-and-paint`, and both
// read `.evaluate` as a CT-authoring smell in `tests/**` — a different population asking a different
// question, with no shared computation to merge into. The three predicates below (`isPropertyNamePosition`,
// `isModuleScopeDeclaration`, `isTypePosition`) are scope-POSITION algebra over a node the shared walk
// delivered, which §12.3 leaves with the policy. Callable targets and lexical value declarations use the
// shared reference readers (#2163); scope judgment never follows a captured binding to its initializer.
//
// POPULATION PORT: legacy `scanRoot: (p) => p.startsWith("tooling/src/")` → `"@tooling"`, byte-identical
// (`POPULATION_ROOTS["@tooling"] === ["tooling/src/"]`). Never widened to `packages/`: app code
// legitimately closes over module scope, and only a callback serialized into a BROWSER PAGE carries the
// hazard — only tooling drives pages (#660). The `@server` mustPass row is the only row that dies without it.
//
// `execution: "entire-population"`, and it is load-bearing rather than defensive. ARM B's verdict is
// decided in the callback's DECLARING file, which for an imported callback is a DIFFERENT file from the
// one that called `.evaluate`. A `--changed` run holding only the caller cannot compose that verdict: the
// declaring file's module-scope bindings, and the identifiers inside the callback body, are both outside
// the subset. mustFlag[3] is that exact shape across a module boundary.
//
// NO BOUNDED-SUBTREE WALK. The legacy shape called `fnNode.getDescendantsOfKind(Identifier)` on the
// resolved callback body — a private descendant walk the final query boundary forbids even scoped to one
// node. The final shape subscribes to `Identifier` once (the SAME shared walk every policy rides), indexes
// every identifier PER FILE, and `evaluate` selects a callback's identifiers by node-RANGE containment
// against ONLY its own declaring file's list. Per-file indexing is load-bearing exactly as it is in
// `test-no-stubs`: two different SourceFiles' local offsets numerically overlap, so a shared list would let
// an identifier in file B satisfy — or falsely accuse — a callback in file A.
//
// DECLARED LIMITS (each with a mustPass row): an identifier in a TYPE position is erased before
// serialization and ignored; a raw STRING callback cannot close over scope at all; a browser global is the
// browser's. An unresolved RUNTIME identifier is NOT guessed into a capture finding — it makes the checker
// inconclusive and therefore raises a TOOL ERROR naming every unresolved binding. That refusal is the
// module's whole #944 third answer and it is pinned in the family test through `runPolicyPass`, which also
// checks the production error envelope (§4.5b).
//
// A CALLBACK DECLARED OUTSIDE THE POPULATION IS A REFUSAL, NOT A PASS — and this class did not exist under
// the legacy runtime. `ctx.report.node` resolves its path through `ctx.relativePath`, which THROWS for a
// file outside the effective population (§12.3), and a callback resolved into `packages/**` or an installed
// `.d.ts` reaches exactly that. Silently skipping it would be a false clean on the one shape this gate
// exists to catch, so an out-of-population callback joins the unresolved-callback refusal with its own
// message half. Measured on the real tree at conversion: zero occurrences (the §4.6 differential's tool-error
// column is 0 on both sides).
//
// MARKER CENSUS: the legacy descriptor carried NO private escape grammar and the tree carries zero
// `@orb-gate-ignore evaluate-no-scope-capture` markers (re-derived at conversion). legacy 0 = current 0.
// The door is now the central `@orb-waive evaluate-no-scope-capture(<captured identifier>)`, and the
// reported position is authored CODE (the captured identifier itself), so it survives `locateFinding`'s
// comment blanking — the three door-failure classes are all clear: no paren in the position, no file-level
// finding, no comment-resident token.
//
// §4.6 DIFFERENTIAL: the pre-conversion descriptor at `86ce80b6c` replayed through the legacy dispatcher
// against the final policy over the same real `tooling/src/**` project. The result is in the landing commit
// message.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `evaluate-no-scope-capture` descriptor at d07338082afc3525bdc2b0813d7ce451087dd40f, the parent of the conversion
// `1e81658b4` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `86ce80b6c`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,437 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,101 and final `population` admits 1,101.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `tooling/src/_shared/__cbbhr_in_appearance-flags.ts`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import type { Identifier, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveLexicalValueDeclaration, resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { resolveCallableDeclaration } from "../../_shared/reference-fact-call.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";

const EVALUATE_METHODS: ReadonlySet<string> = new Set(["evaluate", "evaluateAll"]);

// The browser's own — a fast-path DOCUMENTING what "the browser's" means. Not the sole mechanism: any
// identifier resolving OUTSIDE the callback's own file (lib.dom.d.ts, another module) is already exempt by
// the same-file check below, so this list only matters for the (rare) same-file `declare global` shadow.
const BROWSER_GLOBALS: ReadonlySet<string> = new Set([
  "undefined",
  "document",
  "window",
  "navigator",
  "globalThis",
  "location",
  "history",
  "console",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch",
  "Headers",
  "Request",
  "Response",
  "AbortController",
  "XMLHttpRequest",
  "WebSocket",
  "MutationObserver",
  "ResizeObserver",
  "IntersectionObserver",
  "PerformanceObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "getComputedStyle",
  "matchMedia",
  "CSS",
  "crypto",
  "performance",
  "structuredClone",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "Text",
  "Comment",
  "DocumentFragment",
  "ShadowRoot",
  "Range",
  "Selection",
  "TreeWalker",
  "NodeFilter",
  "DOMParser",
  "XMLSerializer",
  "Image",
  "Audio",
  "Blob",
  "File",
  "FileReader",
  "FormData",
  "URL",
  "URLSearchParams",
  "customElements",
  "alert",
  "confirm",
  "prompt",
]);

const MESSAGE =
  "a `.evaluate()`/`.evaluateAll()` FUNCTION callback references a MODULE-SCOPE binding of this file — Playwright " +
  "serializes the callback via `Function.prototype.toString()` into the browser, where the binding does not " +
  "exist, and it throws a silent in-page `ReferenceError` (#660, bit twice 2026-08-24 — `markContrastCandidates` " +
  "closing over `CONTRAST_MARK`). Thread the value through the explicit `.evaluate(fn, arg)` second parameter " +
  "instead, or inline every constant/helper the callback needs INSIDE it — see the fixed shape in " +
  "tooling/src/snap/ops/contrast.ts.";

const FIX =
  "thread the value through `.evaluate((el, args) => …, { …the value… })` (the arg-threading spelling), or move " +
  "the constant/helper inside the callback body — never reference it by closure. A deliberate occurrence waives " +
  "with `@orb-waive evaluate-no-scope-capture(<the captured identifier>): <reason + end condition>`: the reported " +
  "position is the CAPTURED NAME itself (`MARK`, `PREFIX`), never the `.evaluate` call or the callback.";

/** True when a Playwright `.evaluate`/`.evaluateAll` method call. */
function isEvaluateCall(call: TsNode): boolean {
  if (!Node.isCallExpression(call)) {
    return false;
  }
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) && EVALUATE_METHODS.has(callee.getName());
}

/** `id` sits in a NAME position (an object/property KEY, never a value reference) — `args.mark`'s `mark`,
 *  `{ mark: X }`'s `mark` key, a destructure's property-name half. Excluded before symbol resolution: even
 *  a same-file structural match here is a field name, never a closure over the outer binding. */
function isPropertyNamePosition(id: TsNode): boolean {
  const parent = id.getParent();
  if (parent === undefined) {
    return false;
  }
  if (Node.isPropertyAccessExpression(parent)) {
    return parent.getNameNode() === id;
  }
  if (Node.isPropertyAssignment(parent) || Node.isPropertySignature(parent) || Node.isPropertyDeclaration(parent)) {
    return parent.getNameNode() === id;
  }
  if (Node.isMethodDeclaration(parent) || Node.isGetAccessorDeclaration(parent) || Node.isSetAccessorDeclaration(parent)) {
    return parent.getNameNode() === id;
  }
  if (Node.isBindingElement(parent)) {
    return parent.getPropertyNameNode() === id;
  }
  return false;
}

/** True when `decl` sits at MODULE scope of its own file: walking its ancestors reaches the `SourceFile`
 *  without first crossing a function-like boundary. A local of ANY enclosing function — including one
 *  nested arbitrarily deep inside the callback under inspection — is never module scope. */
function isModuleScopeDeclaration(decl: TsNode): boolean {
  let cur = decl.getParent();
  while (cur !== undefined && !Node.isSourceFile(cur)) {
    if (
      Node.isFunctionDeclaration(cur) ||
      Node.isFunctionExpression(cur) ||
      Node.isArrowFunction(cur) ||
      Node.isMethodDeclaration(cur) ||
      Node.isGetAccessorDeclaration(cur) ||
      Node.isSetAccessorDeclaration(cur) ||
      Node.isConstructorDeclaration(cur)
    ) {
      return false;
    }
    cur = cur.getParent();
  }
  return cur !== undefined;
}

interface ResolvedCallback {
  readonly fnNode: TsNode;
  readonly declNode: TsNode;
  readonly sourceFile: SourceFile;
}

/** The function BODY to scope-check, and the declaration node used for the self-reference guard —
 *  resolved either from an inline literal (ARM A) or a local/imported by-reference identifier (ARM B).
 *  A raw string or call expression is not function-form; an unresolved identifier fails loud. */
function resolveCallback(arg: TsNode): ResolvedCallback | undefined {
  if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) {
    return { fnNode: arg, declNode: arg, sourceFile: arg.getSourceFile() };
  }
  if (!Node.isIdentifier(arg)) {
    return;
  }
  const fact = resolveCallableDeclaration(arg);
  if (fact.kind === "unresolved") {
    return;
  }
  const fnNode = fact.value.declaration;
  if (!(Node.isFunctionDeclaration(fnNode) || Node.isArrowFunction(fnNode) || Node.isFunctionExpression(fnNode))) {
    return;
  }
  // Recursive references bind the checker value declaration: a variable for a const arrow, or the
  // selected overload for a function whose callable reader returns the implementation body.
  const binding = fnNode.getParentIfKind(SyntaxKind.VariableDeclaration) ?? fnNode;
  const lexical = resolveLexicalValueDeclaration(binding);
  const declNode = lexical.kind === "resolved" ? lexical.value : binding;
  return { fnNode, declNode, sourceFile: fact.value.sourceFile };
}

function resolvesToValue(arg: TsNode): boolean {
  if (!Node.isIdentifier(arg)) {
    return false;
  }
  const callable = resolveCallableDeclaration(arg);
  if (callable.kind === "unresolved" && (callable.reason === "write" || callable.reason === "cycle" || callable.reason === "ambiguous")) {
    return false;
  }
  const origin = resolveModuleMemberOrigin(arg);
  const declaration = origin.kind === "resolved" && origin.value.canonical.kind === "project" ? origin.value.canonical.declaration : arg;
  return resolveLexicalValueDeclaration(declaration).kind === "resolved";
}

function isTypePosition(id: TsNode, boundary: TsNode): boolean {
  let cur = id.getParent();
  while (cur !== undefined && cur !== boundary) {
    if (Node.isTypeNode(cur)) {
      return true;
    }
    cur = cur.getParent();
  }
  return false;
}

interface PassState {
  readonly evaluateArgs: TsNode[];
  readonly identifiersByFile: Map<object, Identifier[]>;
  readonly unresolvedCallbacks: Set<string>;
  readonly unresolvedIdentifiers: Set<string>;
  readonly inPopulation: Set<object>;
}

interface ScopeCaptureCensus {
  readonly captures: readonly Identifier[];
  readonly unresolved: readonly string[];
}

/** The module-scope captures inside ONE resolved callback, from the identifiers the shared walk already
 *  delivered for that callback's own file. `unresolved` retains identifiers this reader could not resolve
 *  to a value declaration; they become a tool error rather than a guessed capture finding. */
function censusScopeCaptures(callback: ResolvedCallback, indexed: readonly Identifier[]): ScopeCaptureCensus {
  const captures: Identifier[] = [];
  const unresolved: string[] = [];
  for (const id of indexed) {
    if (isPropertyNamePosition(id) || isTypePosition(id, callback.fnNode) || BROWSER_GLOBALS.has(id.getText())) {
      continue;
    }
    const binding = resolveLexicalValueDeclaration(id);
    if (binding.kind === "unresolved") {
      unresolved.push(id.getText());
      continue;
    }
    const decl = binding.value;
    // A named function/const-arrow may legally reference its OWN binding once serialized; a declaration
    // outside the callback's own file, or local to some enclosing function, is not the class.
    if (decl !== callback.declNode && decl.getSourceFile() === callback.sourceFile && isModuleScopeDeclaration(decl)) {
      captures.push(id);
    }
  }
  return { captures, unresolved };
}

/** Every identifier the shared walk delivered inside the callback body, selected by node-RANGE containment
 *  from its OWN declaring file's index — never one shared list across the pass. */
function identifiersWithin(state: PassState, callback: ResolvedCallback): readonly Identifier[] {
  const indexed = state.identifiersByFile.get(callback.sourceFile.compilerNode) ?? [];
  const start = callback.fnNode.getStart();
  const end = callback.fnNode.getEnd();
  return indexed.filter((id) => id.getStart() >= start && id.getEnd() <= end);
}

/** The post-walk judgment for ONE collected `.evaluate` first argument. */
function judgeCallbackArgument(ctx: GatePolicyContext, state: PassState, arg0: TsNode): void {
  const callback = resolveCallback(arg0);
  if (callback === undefined) {
    // A raw string / call expression is not function-form; an UNRESOLVED identifier fails loud.
    if (Node.isIdentifier(arg0) && !resolvesToValue(arg0)) {
      state.unresolvedCallbacks.add(`${ctx.relativePath(arg0.getSourceFile())}:${arg0.getText()}`);
    }
    return;
  }
  if (!state.inPopulation.has(callback.sourceFile.compilerNode)) {
    state.unresolvedCallbacks.add(`${callback.sourceFile.getFilePath()} (declared outside this policy's population)`);
    return;
  }
  const census = censusScopeCaptures(callback, identifiersWithin(state, callback));
  for (const name of census.unresolved) {
    state.unresolvedIdentifiers.add(name);
  }
  for (const id of census.captures) {
    ctx.report.node(id, { token: id.getText(), offset: 0, message: MESSAGE, fix: FIX });
  }
}

export const gate = defineGate({
  id: "evaluate-no-scope-capture",
  family: "evaluate-no-scope-capture",
  authority: "ordinary",
  severity: "error",
  population: "@tooling",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const state: PassState = {
      evaluateArgs: [],
      identifiersByFile: new Map<object, Identifier[]>(),
      unresolvedCallbacks: new Set<string>(),
      unresolvedIdentifiers: new Set<string>(),
      inPopulation: new Set<object>(),
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!(Node.isCallExpression(node) && isEvaluateCall(node))) {
              return;
            }
            const [arg0] = node.getArguments();
            if (arg0 !== undefined) {
              state.evaluateArgs.push(arg0);
            }
          },
        },
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node, sourceFile): void => {
            if (!Node.isIdentifier(node)) {
              return;
            }
            const key = sourceFile.compilerNode;
            const list = state.identifiersByFile.get(key);
            if (list === undefined) {
              state.identifiersByFile.set(key, [node]);
              return;
            }
            list.push(node);
          },
        },
      ],
      visitFile: (sourceFile): void => {
        // Membership is recorded per FILE, not per identifier: it is what separates "declared outside this
        // policy's population" (a refusal) from "declared in a file the walk simply did not reach", and a
        // silent skip there would be a false clean on exactly the ARM-B shape this gate exists for.
        state.inPopulation.add(sourceFile.compilerNode);
      },
      evaluate: (): void => {
        for (const arg0 of state.evaluateArgs) {
          judgeCallbackArgument(ctx, state, arg0);
        }
        if (state.unresolvedCallbacks.size > 0 || state.unresolvedIdentifiers.size > 0) {
          throw new Error(
            `could not resolve serialized browser callback evidence: callbacks=[${[...state.unresolvedCallbacks].sort().join(", ")}], runtime identifiers=[${[...state.unresolvedIdentifiers].sort().join(", ")}] — callback evidence is incomplete (tooling/src/verify/gates/evaluate-no-scope-capture.ts)`,
          );
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/x.ts":
          'const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }) => el.setAttribute(MARK, "1"));\n}\n',
      },
      expect: { count: 1, token: "MARK", line: 3 },
      why: "ARM A, the founding shape verbatim — `markContrastCandidates` closing over module-scope `CONTRAST_MARK` by closure instead of threading it through the evaluate() arg (#660). The position is the CAPTURED NAME at its use site inside the callback, which is line 3, not the declaration on line 1",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/y.ts":
          'const PREFIX = "x-";\nfunction paint(el: { className: string }): void {\n  el.className = PREFIX;\n}\nasync function run(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate(paint);\n}\n',
      },
      expect: { count: 1, token: "PREFIX", line: 3 },
      why: "ARM B — a module-scope function passed BY REFERENCE (the sweepOverflowEscapes shape) whose OWN body closes over a sibling module const; the risk is identical whether the callback is inline or named, and the finding lands inside the CALLBACK, not at the call",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/imported-callback.ts":
          'const MARK = "data-mark";\nexport function mark(el: { setAttribute(name: string, value: string): void }): void { el.setAttribute(MARK, "1"); }\n',
        "tooling/src/snap/ops/imported-caller.ts":
          'import { mark } from "./imported-callback.ts";\nexport async function run(page: { evaluate(fn: unknown): Promise<void> }): Promise<void> { await page.evaluate(mark); }\n',
      },
      expect: { count: 1, token: "MARK", line: 2 },
      why: "ARM B ACROSS A MODULE BOUNDARY — the imported callback is serialized alone, so a constant from its DECLARING module is still absent in the browser. This is also the row that makes `execution: \"entire-population\"` load-bearing: the verdict is decided in a file the caller's own subset does not contain, and it is the cross-file identifier-index control — the finding must come from `imported-callback.ts`'s own identifier list, never from the caller's",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/z.ts":
          'const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown, arg: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }, args: { mark: string; idx: number }) => el.setAttribute(args.mark, String(args.idx)), { idx: 0, mark: MARK });\n}\n',
      },
      why: "THE FIX SHAPE (the real markContrastCandidates fix) — the module const travels through the explicit `.evaluate(fn, arg)` second parameter and is referenced in the callback only via the `args` PARAMETER. It also pins `isPropertyNamePosition`: `args.mark`'s `mark` and the `{ mark: MARK }` KEY are name positions, and without that fence both would resolve structurally and this row would red",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/raw.ts":
          'async function run(loc: { evaluate: (fn: string) => Promise<void> }): Promise<void> {\n  await loc.evaluate("(el) => el.click()");\n}\n',
      },
      why: "DECLARED LIMIT: a raw-string callback — the sanctioned pattern. A string cannot close over scope at all, so it is exempt by construction (never function-form), and it must not fall into the unresolved-callback refusal either",
    },
    {
      mode: "types",
      files: {
        "tooling/src/motion-audit/ops/globals.ts":
          "async function run(page: { evaluate: (fn: unknown) => Promise<unknown> }): Promise<unknown> {\n  return await page.evaluate(() => document.title);\n}\n",
      },
      why: "a browser-global reference (`document`) — those are the BROWSER's, and in any case resolve OUTSIDE the callback's own file (lib.dom.d.ts), never a same-file module-scope declaration",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/undefined-global.ts":
          "async function run(page: { evaluate: (fn: unknown) => Promise<boolean> }): Promise<boolean> {\n  return await page.evaluate(() => document.body.dataset.ready !== undefined);\n}\n",
      },
      why: "JavaScript's built-in `undefined` exists in the serialized browser callback; it is not an unresolved user binding and must not make the checker inconclusive. Delete it from BROWSER_GLOBALS and this row does not merely flag — the whole run raises the unresolved-identifier TOOL ERROR, which is why the row is here rather than in the family test",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/selfcontained.ts":
          "function sweep(el: { getBoundingClientRect: () => { width: number } }, opts: { max: number }): boolean {\n  const scale = opts.max;\n  return el.getBoundingClientRect().width > scale;\n}\nasync function run(loc: { evaluate: (fn: unknown, arg: unknown) => Promise<boolean> }): Promise<boolean> {\n  return await loc.evaluate(sweep, { max: 10 });\n}\n",
      },
      why: "ARM B, the SANCTIONED form — a module-scope function passed by reference that is genuinely self-contained (every name it uses is its own parameter or a local), the sweepOverflowEscapes precedent. It pins `isModuleScopeDeclaration`: `scale` and `opts` are declared INSIDE the callback, and a predicate that judged declaration-in-this-file rather than declaration-at-module-scope would red this row",
    },
    {
      mode: "types",
      files: {
        "tooling/src/cpu-profile/ops/typeonly.ts":
          "interface Meta { readonly count: number }\nasync function run(page: { evaluate: (fn: unknown) => Promise<number> }): Promise<number> {\n  return await page.evaluate(() => (globalThis as unknown as Meta).count);\n}\n",
      },
      why: "DECLARED LIMIT — a module-scope `interface` referenced only in a TYPE position (an `as` cast) is erased before `Function.prototype.toString()` serializes the callback; never the #660 defect class. Cut `isTypePosition` and this row reds, because `Meta` resolves to a same-file module-scope declaration",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/anchor.ts": "export const anchor = true;\n",
        "packages/client/src/features/x/app.ts":
          'const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }) => el.setAttribute(MARK, "1"));\n}\n',
      },
      why: "THE POPULATION FENCE, and the only row that dies without it: mustFlag[1] byte-for-byte, moved to `@client`. App code legitimately closes over module scope — only a callback serialized into a BROWSER PAGE carries the hazard, and only tooling drives pages. The `@tooling` anchor file is required because a fixture admitting ZERO paths raises a population TOOL ERROR instead of proving the fence",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/waived.ts":
          'const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  // @orb-waive evaluate-no-scope-capture(MARK): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }) => el.setAttribute(MARK, "1"));\n}\n',
      },
      why: "POSITIONAL IDENTITY: the report passes the CAPTURED IDENTIFIER as the token at its own offset, so an author waives the captured NAME — not the `.evaluate` call and not the callback. The position is authored code, so it survives `locateFinding`'s comment blanking. The fixture is mustFlag[1] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
