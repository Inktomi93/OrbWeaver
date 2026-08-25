// Gate: evaluate-no-scope-capture (#660) — a `.evaluate`/`.evaluateAll` FUNCTION callback (inline, or a
// module-scope function passed BY REFERENCE) that references a module-scope binding of THIS FILE is RED:
// Playwright serializes it via `Function.prototype.toString()` into the browser, where the binding does
// not exist — a silent in-page `ReferenceError` an instrument reads as "found nothing" (bit twice
// 2026-08-24: `markContrastCandidates` closed over `CONTRAST_MARK`). Sibling trap, NOT enforced here: the
// STRING form of `.evaluate` silently drops its `arg` (`ops/overflow.ts` header) — a different failure,
// same "reads as nothing" shape; know both.
// ARMS: A) inline `(el, args) => …` / `function (…) {…}` literal. B) a bare identifier resolving to a
// module-scope function/const-arrow in this file OR an imported module. Both are scope-checked in the
// callback's DECLARING file via ts-morph symbol resolution — never name-matching.
// DECLARED LIMIT: an identifier in a TYPE position is erased before serialization and ignored. An
// unresolved RUNTIME identifier is not guessed into a capture finding, but it makes the checker itself
// inconclusive and therefore throws a TOOL ERROR after preserving its scan count.
import type { CallExpression, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const EVALUATE_METHODS: ReadonlySet<string> = new Set(["evaluate", "evaluateAll"]);

// The browser's own — a fast-path DOCUMENTING what "the browser's" means. Not the sole mechanism: any
// identifier resolving OUTSIDE this file (lib.dom.d.ts, another module) is already exempt by the same-file
// check below, so this list only matters for the (rare) case of a same-file `declare global` shadow.
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
  "the constant/helper inside the callback body — never reference it by closure.";

/** True when a Playwright `.evaluate`/`.evaluateAll` method call. */
function isEvaluateCall(call: CallExpression): boolean {
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

/** The function BODY to scope-check, and the declaration node used for the self-reference guard —
 *  resolved either from an inline literal (ARM A) or a local/imported by-reference identifier (ARM B).
 *  A raw string or call expression is not function-form; an unresolved identifier fails loud. */
function resolveCallback(arg: TsNode): { readonly fnNode: TsNode; readonly declNode: TsNode; readonly sourceFile: SourceFile } | undefined {
  if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) {
    return { fnNode: arg, declNode: arg, sourceFile: arg.getSourceFile() };
  }
  if (!Node.isIdentifier(arg)) {
    return;
  }
  const symbol = arg.getSymbol();
  const target = symbol?.getAliasedSymbol() ?? symbol;
  const decl = target?.getValueDeclaration();
  if (decl === undefined) {
    return;
  }
  if (Node.isFunctionDeclaration(decl)) {
    return { fnNode: decl, declNode: decl, sourceFile: decl.getSourceFile() };
  }
  if (!Node.isVariableDeclaration(decl)) {
    return;
  }
  const init = decl.getInitializer();
  return init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
    ? { fnNode: init, declNode: decl, sourceFile: decl.getSourceFile() }
    : undefined;
}

function resolvesToValue(arg: TsNode): boolean {
  if (!Node.isIdentifier(arg)) {
    return false;
  }
  const symbol = arg.getSymbol();
  return (symbol?.getAliasedSymbol() ?? symbol)?.getValueDeclaration() !== undefined;
}

interface ScopeCaptureCensus {
  readonly captures: readonly TsNode[];
  readonly unresolved: readonly TsNode[];
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

/** Walk every runtime Identifier inside the resolved callback body. `unresolved` retains identifiers this
 *  reader could not resolve to a value declaration; they become a tool error rather than a guessed capture
 *  finding. Type positions are removed before this census because they are erased during serialization. */
function censusScopeCaptures(fnNode: TsNode, declNode: TsNode, sf: SourceFile): ScopeCaptureCensus {
  const captures: TsNode[] = [];
  const unresolved: TsNode[] = [];
  for (const id of fnNode.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (isPropertyNamePosition(id) || isTypePosition(id, fnNode) || BROWSER_GLOBALS.has(id.getText())) {
      continue;
    }
    const symbol = id.getSymbol();
    const decl = symbol?.getValueDeclaration();
    if (decl === undefined) {
      unresolved.push(id);
      continue;
    }
    if (decl === declNode) {
      continue; // self-reference — a named function/const-arrow may legally reference its OWN binding once serialized
    }
    if (decl.getSourceFile() !== sf || !isModuleScopeDeclaration(decl)) {
      continue; // outside this file, or local to some enclosing function — not the module-scope-of-this-file class
    }
    captures.push(id);
  }
  return { captures, unresolved };
}

const unresolvedRuntimeIdentifiers = new Set<string>();
const unresolvedCallbacks = new Set<string>();

export const gate: GateDescriptor = {
  name: "evaluate-no-scope-capture",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  // Never widened to packages/: app code legitimately closes over module scope; only a callback serialized
  // into a BROWSER PAGE carries the hazard, and only tooling drives pages (#660 hazards).
  scanRoot: (p) => p.startsWith("tooling/src/"),
  kinds: [SyntaxKind.CallExpression],

  begin: () => {
    unresolvedRuntimeIdentifiers.clear();
    unresolvedCallbacks.clear();
  },

  visit: (node, sf, ctx) => {
    if (!(Node.isCallExpression(node) && isEvaluateCall(node))) {
      return;
    }
    const [arg0] = node.getArguments();
    if (arg0 === undefined) {
      return;
    }
    const resolved = resolveCallback(arg0);
    if (resolved === undefined) {
      if (Node.isIdentifier(arg0) && !resolvesToValue(arg0)) {
        unresolvedCallbacks.add(`${sf.getFilePath()}:${arg0.getText()}`);
      }
      return; // a raw string / call expression is not function-form; an unresolved identifier fails loud below
    }
    const { captures, unresolved } = censusScopeCaptures(resolved.fnNode, resolved.declNode, resolved.sourceFile);
    for (const id of unresolved) {
      unresolvedRuntimeIdentifiers.add(id.getText());
    }
    for (const id of captures) {
      ctx.report(id, { token: id.getText(), offset: 0 });
    }
  },

  finalize: (ctx) => {
    ctx.scan({ skipped: { "unresolved-callback": unresolvedCallbacks.size, "unresolved-identifier": unresolvedRuntimeIdentifiers.size } });
    if (unresolvedCallbacks.size > 0 || unresolvedRuntimeIdentifiers.size > 0) {
      throw new Error(
        `could not resolve serialized browser callback evidence: callbacks=[${[...unresolvedCallbacks].sort().join(", ")}], runtime identifiers=[${[...unresolvedRuntimeIdentifiers].sort().join(", ")}] — callback evidence is incomplete`,
      );
    }
  },

  mustFlag: [
    {
      files:
        'const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }) => el.setAttribute(MARK, "1"));\n}\n',
      at: "tooling/src/snap/ops/x.ts",
      expect: { count: 1, token: "MARK" },
      why: "the founding shape verbatim — markContrastCandidates closing over module-scope CONTRAST_MARK by closure instead of threading it through the evaluate() arg (#660)",
    },
    {
      files:
        'const PREFIX = "x-";\nfunction paint(el: { className: string }): void {\n  el.className = PREFIX;\n}\nasync function run(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate(paint);\n}\n',
      at: "tooling/src/snap/ops/y.ts",
      expect: { count: 1, token: "PREFIX" },
      why: "ARM B — a module-scope function passed BY REFERENCE (the sweepOverflowEscapes shape) whose OWN body closes over a sibling module const; the risk is identical whether the callback is inline or named",
    },
    {
      files: {
        "tooling/src/snap/ops/imported-callback.ts":
          'const MARK = "data-mark";\nexport function mark(el: { setAttribute(name: string, value: string): void }): void { el.setAttribute(MARK, "1"); }\n',
        "tooling/src/snap/ops/imported-caller.ts":
          'import { mark } from "./imported-callback.ts";\nexport async function run(page: { evaluate(fn: unknown): Promise<void> }): Promise<void> { await page.evaluate(mark); }\n',
      },
      expect: { count: 1, token: "MARK" },
      why: "ARM B across a module boundary — the imported callback is serialized alone, so a constant from its declaring module is still absent in the browser",
    },
  ],
  mustPass: [
    {
      files:
        'const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown, arg: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }, args: { mark: string; idx: number }) => el.setAttribute(args.mark, String(args.idx)), { idx: 0, mark: MARK });\n}\n',
      at: "tooling/src/snap/ops/z.ts",
      why: "the FIX shape (the real markContrastCandidates fix) — the module const travels through the explicit .evaluate(fn, arg) second parameter, referenced in the callback only via the `args` PARAMETER",
    },
    {
      files: 'async function run(loc: { evaluate: (fn: string) => Promise<void> }): Promise<void> {\n  await loc.evaluate("(el) => el.click()");\n}\n',
      at: "tooling/src/snap/ops/raw.ts",
      why: "a raw-string callback — the sanctioned pattern; a string cannot close over scope at all, so it is exempt by construction (never function-form)",
    },
    {
      files:
        "async function run(page: { evaluate: (fn: unknown) => Promise<unknown> }): Promise<unknown> {\n  return await page.evaluate(() => document.title);\n}\n",
      at: "tooling/src/motion-audit/ops/globals.ts",
      why: "a browser-global reference (document) — those are the BROWSER's, and in any case resolve OUTSIDE this file (lib.dom.d.ts), never a same-file module-scope declaration",
    },
    {
      files:
        "async function run(page: { evaluate: (fn: unknown) => Promise<boolean> }): Promise<boolean> {\n  return await page.evaluate(() => document.body.dataset.ready !== undefined);\n}\n",
      at: "tooling/src/snap/ops/undefined-global.ts",
      why: "JavaScript's built-in `undefined` exists in the serialized browser callback; it is not an unresolved user binding and must not make the checker inconclusive",
    },
    {
      files:
        "function sweep(el: { getBoundingClientRect: () => { width: number } }, opts: { max: number }): boolean {\n  const scale = opts.max;\n  return el.getBoundingClientRect().width > scale;\n}\nasync function run(loc: { evaluate: (fn: unknown, arg: unknown) => Promise<boolean> }): Promise<boolean> {\n  return await loc.evaluate(sweep, { max: 10 });\n}\n",
      at: "tooling/src/snap/ops/selfcontained.ts",
      why: "ARM B, the sanctioned form — a module-scope function passed BY REFERENCE that is genuinely self-contained (every name it uses is its own parameter or a local), the sweepOverflowEscapes precedent",
    },
    {
      files:
        "interface Meta { readonly count: number }\nasync function run(page: { evaluate: (fn: unknown) => Promise<number> }): Promise<number> {\n  return await page.evaluate(() => (globalThis as unknown as Meta).count);\n}\n",
      at: "tooling/src/cpu-profile/ops/typeonly.ts",
      why: "DECLARED LIMIT — a module-scope `interface` referenced only in a TYPE position (an `as` cast) is erased before Function.prototype.toString() serializes the callback; never the #660 defect class",
    },
  ],
};
