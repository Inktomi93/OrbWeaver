// Gate: ct-no-oneshot-live-read-assert (Spine-Testing.md §7; the DEF-14 flake class) — a HARD invariant:
// a Playwright component test (`*.ct.tsx`) NEVER reads mutable async state with a NON-retrying assertion.
// A single synchronous read of mutable state samples MID-TRANSITION (focus moving, an animation/dialog
// settling, a ResizeObserver not yet fired, a network call not yet recorded) and passes or fails by timing
// luck — the class that flaked nine CTs (root-caused 2026-07-20: the lightbox focus-trap, chart resize, and
// create-entity `expect(trpc.count(x)).toBe(2)` read before the retry's call landed).
//
// FLAGGED — `expect(<arg>).<valueMatcher>(...)` (a plain non-retrying matcher: `toBe`/`toEqual`/
// `toBeGreaterThan`/`toBeTruthy`/`toContain`…) where `<arg>` is a mutable-async read:
//   • a live-DOM read — `await <locator>.evaluate/textContent/innerText/getAttribute/inputValue/boundingBox/
//     count/allTextContents/…(...)`, `await page.evaluate(...)`, or a `document.activeElement` snapshot
//     (inline, or captured into a local then asserted);
//   • a CT tRPC recorder read — `trpc.count/inputs/lastInput(...)` (tests/support/node/route-trpc.ts): the
//     recorder GROWS as calls land, so a bare read races the in-flight call.
//
// FIX: a web-first auto-retrying assertion — `expect(<locator>).toBeFocused()/toBeVisible()/toHaveText(...)/
// toBeInViewport()`, or wrap the read: `await expect.poll(() => <read>).toBe(...)`. Both retry until the
// value SETTLES. Provably settled at read-time (e.g. asserted only AFTER a poll/web-first on the same state
// already awaited it)? mark it `// ONESHOT-OK: <concrete reason>`.
//
// NOT flagged (already retrying): `expect.poll(...)` / `expect(...).toPass()` and the web-first locator
// matchers (`toBeFocused`/`toBeVisible`/`toHaveText`…). ZERO baseline — every occurrence is resolved (fixed
// or escaped) in the tree, so the whole CT suite passes this hard gate.
// COMMENT POSTURE: comment-SAFE for detection (calls/definitions are AST nodes); comments-INTENDED for the
// ONESHOT-OK escape block. DECLARED LIMIT: only `*.ct.tsx` and the enumerated mutable-read APIs are judged.
import type { CallExpression, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const CT_FILE_RE = /\.ct\.tsx$/u;
const ESCAPE = "ONESHOT-OK";
const ACTIVE_ELEMENT = "activeElement";
const ESCAPE_OPENER_RE = /^\/\/\s*ONESHOT-OK\b/u;
const ESCAPE_VALID_RE = /^\/\/\s*ONESHOT-OK\s*:\s*\S/u;

// Playwright locator/page reads that resolve ONCE (no auto-retry) — awaited inside a non-retrying expect()
// they sample a single mid-transition frame of live DOM.
const DOM_READ_METHODS: ReadonlySet<string> = new Set([
  "evaluate",
  "evaluateHandle",
  "textContent",
  "innerText",
  "getAttribute",
  "inputValue",
  "boundingBox",
  "count",
  "allTextContents",
  "allInnerTexts",
  "getProperty",
  "jsonValue",
]);

// The CT tRPC recorder (tests/support/node/route-trpc.ts) — a spy whose call log GROWS as requests land, so a
// bare synchronous read races an in-flight call.
const RECORDER_READ_METHODS: ReadonlySet<string> = new Set(["count", "inputs", "lastInput"]);

// Playwright's web-first, auto-RETRYING locator matchers — the sanctioned target of a live-DOM assertion.
// An `expect(locator).<one of these>` is exactly the fix, so a matcher in this set is never flagged. Any
// matcher NOT here is treated as a plain non-retrying value matcher (`toBe`/`toEqual`/`toBeGreaterThan`…).
const RETRYING_MATCHERS: ReadonlySet<string> = new Set([
  "toBeAttached",
  "toBeChecked",
  "toBeDisabled",
  "toBeEditable",
  "toBeEmpty",
  "toBeEnabled",
  "toBeFocused",
  "toBeHidden",
  "toBeInViewport",
  "toBeVisible",
  "toContainText",
  "toHaveAccessibleDescription",
  "toHaveAccessibleErrorMessage",
  "toHaveAccessibleName",
  "toHaveAttribute",
  "toHaveClass",
  "toHaveCount",
  "toHaveCSS",
  "toHaveId",
  "toHaveJSProperty",
  "toHaveRole",
  "toHaveScreenshot",
  "toHaveText",
  "toHaveValue",
  "toHaveValues",
  "toHaveURL",
  "toHaveTitle",
  "toBeOK",
  "toPass",
]);

const MESSAGE =
  "a non-retrying `expect()` reads MUTABLE ASYNC state in a component test — a live-DOM read (`await <locator>." +
  "evaluate/textContent/getAttribute/boundingBox/count(...)`, `page.evaluate(...)`, a `document.activeElement` " +
  "snapshot) or a tRPC recorder read (`trpc.count/inputs/lastInput(...)`). A single read samples mid-transition " +
  "(focus/animation/ResizeObserver/an unrecorded call) and flakes by timing luck (the DEF-14 class, 2026-07-20). Use " +
  "a web-first auto-retrying assertion — `expect(<locator>).toBeFocused()/toBeVisible()/toHaveText(...)/" +
  "toBeInViewport()` — or wrap the read: `await expect.poll(() => <read>).toBe(...)`. Provably settled at read-time? " +
  "mark it `// ONESHOT-OK: <concrete reason>` (core/Spine-Testing.md §7). A malformed marker exempts nothing; " +
  "a stale marker not exactly adjacent to one guarded consumption is RED.";

/** Unwrap parentheses / non-null / `as` wrappers to the inner expression (see-through-wraps). */
function unwrap(node: TsNode): TsNode {
  let cur = node;
  while (Node.isParenthesizedExpression(cur) || Node.isNonNullExpression(cur) || Node.isAsExpression(cur)) {
    cur = cur.getExpression();
  }
  return cur;
}

/** The method name at the tail of a call's callee (`a.b.c(...)` → "c"), or undefined for a bare-ident call. */
function calleeTailMethod(call: CallExpression): string | undefined {
  const callee = unwrap(call.getExpression());
  return Node.isPropertyAccessExpression(callee) ? callee.getName() : undefined;
}

/** True when this exact expression is `await <locator/page>.<domReadMethod>(...)`. */
function isAwaitedDomRead(arg: TsNode): boolean {
  const inner = unwrap(arg);
  if (!Node.isAwaitExpression(inner)) {
    return false;
  }
  const awaited = unwrap(inner.getExpression());
  if (!Node.isCallExpression(awaited)) {
    return false;
  }
  const method = calleeTailMethod(awaited);
  return method !== undefined && DOM_READ_METHODS.has(method);
}

/** True when this exact expression is `<x>.count/inputs/lastInput(...)`. */
function isRecorderRead(arg: TsNode): boolean {
  const inner = unwrap(arg);
  if (!Node.isCallExpression(inner)) {
    return false;
  }
  const method = calleeTailMethod(inner);
  return method !== undefined && RECORDER_READ_METHODS.has(method);
}

/** Value-flow taint: property selection, transforms, and local aliases do not settle a mutable snapshot. */
function readsMutableAsync(node: TsNode, seenDefinitions = new Set<TsNode>()): boolean {
  const inner = unwrap(node);
  if (Node.isPropertyAccessExpression(inner) && inner.getName() === ACTIVE_ELEMENT) {
    return true;
  }
  if (isAwaitedDomRead(inner) || isRecorderRead(inner)) {
    return true;
  }
  if (Node.isIdentifier(inner)) {
    return readsIdentifierInitializer(inner, seenDefinitions);
  }
  if (Node.isPropertyAccessExpression(inner) || Node.isElementAccessExpression(inner)) {
    return readsMutableAsync(inner.getExpression(), seenDefinitions);
  }
  if (Node.isAwaitExpression(inner)) {
    return readsMutableAsync(inner.getExpression(), seenDefinitions);
  }
  if (Node.isCallExpression(inner)) {
    const callee = unwrap(inner.getExpression());
    const receiver = Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee) ? callee.getExpression() : undefined;
    return (
      (receiver !== undefined && readsMutableAsync(receiver, seenDefinitions)) ||
      inner.getArguments().some((argument) => readsMutableAsync(argument, seenDefinitions))
    );
  }
  return false;
}

function readsIdentifierInitializer(identifier: TsNode, seenDefinitions: Set<TsNode>): boolean {
  if (!Node.isIdentifier(identifier)) {
    return false;
  }
  for (const definition of identifier.getDefinitionNodes()) {
    if (!Node.isVariableDeclaration(definition) || seenDefinitions.has(definition)) {
      continue;
    }
    seenDefinitions.add(definition);
    const initializer = definition.getInitializer();
    if (initializer !== undefined && readsMutableAsync(initializer, seenDefinitions)) {
      return true;
    }
  }
  return false;
}

/** The matcher call sitting on an `expect(<arg>)` chain, and its name — walking through an optional `.not`.
 *  `expect(a).toBe(1)` → "toBe"; `expect(a).not.toBe(1)` → "toBe"; undefined if `expect(...)` is not directly
 *  asserted (it is the `.poll`/`.soft` receiver, or its result is stored). */
function matcherName(expectCall: CallExpression): string | undefined {
  const access = expectCall.getParentIfKind(SyntaxKind.PropertyAccessExpression);
  if (access === undefined || access.getExpression() !== expectCall) {
    return;
  }
  let member = access;
  if (member.getName() === "not") {
    const next = member.getParentIfKind(SyntaxKind.PropertyAccessExpression);
    if (next === undefined || next.getExpression() !== member) {
      return;
    }
    member = next;
  }
  const callParent = member.getParentIfKind(SyntaxKind.CallExpression);
  if (callParent === undefined || callParent.getExpression() !== member) {
    return;
  }
  return member.getName();
}

/** True when this CallExpression is a bare `expect(<arg>)` — callee is the identifier `expect`, exactly one
 *  argument. (An `expect.poll(...)` / `expect.soft(...)` has a PropertyAccess callee and is excluded here.) */
function isBareExpectCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  return Node.isIdentifier(callee) && callee.getText() === "expect" && call.getArguments().length === 1;
}

interface EscapeMarker {
  readonly node: TsNode;
  readonly line: number;
  readonly valid: boolean;
  consumed: boolean;
}

/** The ONESHOT-OK markers in one file, with the ts-morph node each is attached to — the report anchor, so
 *  the finding stays node-anchored and `@orb-gate-ignore`-suppressible (GATE-AUTHORING.md §1).
 *
 *  THE CANDIDATE FENCE IS WHY THIS IS AFFORDABLE, and it is the same decision `comment-spans.ts`
 *  `codeTextForScan` records: the walk below is the kind-less `getDescendants()`, which materialises a
 *  ts-morph wrapper for every TOKEN in the file — and it has to be, because a marker written above a `}`
 *  attaches to that token and `forEachDescendant` never reaches it (measured 2026-09-02: the node-only walk
 *  loses 41 comment ranges across 20 real `*.ct.tsx`, in the PERMISSIVE direction — a blind escape
 *  vocabulary, #967). So the fix is not a cheaper walk, it is not walking at all: a marker's own text must
 *  appear literally in the raw file, so a file whose text lacks `ONESHOT-OK` cannot carry one and is
 *  skipped. SOUND in one direction only — the fence may only ever SKIP work, never decide a verdict. */
function escapeMarkers(sf: SourceFile): EscapeMarker[] {
  if (!sf.getFullText().includes(ESCAPE)) {
    return [];
  }
  const seen = new Set<number>();
  const markers: EscapeMarker[] = [];
  for (const node of [sf, ...sf.getDescendants()]) {
    for (const range of [...node.getLeadingCommentRanges(), ...node.getTrailingCommentRanges()]) {
      if (seen.has(range.getPos())) {
        continue;
      }
      seen.add(range.getPos());
      const text = range.getText().trim();
      if (ESCAPE_OPENER_RE.test(text)) {
        markers.push({ node, line: sf.getLineAndColumnAtPos(range.getPos()).line, valid: ESCAPE_VALID_RE.test(text), consumed: false });
      }
    }
  }
  return markers.sort((a, b) => a.line - b.line);
}

function liveReadExpectCalls(sf: SourceFile): CallExpression[] {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((node) => {
    if (!isBareExpectCall(node)) {
      return false;
    }
    const matcher = matcherName(node);
    const [arg] = node.getArguments();
    return matcher !== undefined && !RETRYING_MATCHERS.has(matcher) && arg !== undefined && readsMutableAsync(arg);
  });
}

function inspectFile(sf: SourceFile, report: (node: TsNode, token: string) => void): void {
  const markers = escapeMarkers(sf);
  for (const marker of markers) {
    if (!marker.valid) {
      report(marker.node, ESCAPE);
    }
  }
  for (const node of liveReadExpectCalls(sf)) {
    const line = node.getStartLineNumber();
    const marker = markers.find((candidate) => candidate.valid && !candidate.consumed && (candidate.line === line || candidate.line === line - 1));
    if (marker !== undefined) {
      marker.consumed = true;
    } else {
      report(node, "expect");
    }
  }
  for (const marker of markers) {
    if (marker.valid && !marker.consumed) {
      report(marker.node, ESCAPE);
    }
  }
}

export const gate: GateDescriptor = {
  name: "ct-no-oneshot-live-read-assert",
  docRow: "core/Spine-Testing.md §7 (the DEF-14 flake class, 2026-07-20)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use a web-first auto-retrying assertion — `expect(<locator>).toBeFocused()/toBeVisible()/toHaveText(...)/toBeInViewport()` — or wrap the read: `await expect.poll(() => <read>).toBe(...)`; mark a provably-settled read `// ONESHOT-OK: <reason>`.",
  scanRoot: (p) => CT_FILE_RE.test(p),
  visitFile: (sf, ctx) => {
    inspectFile(sf, (node, token) => ctx.report(node, { token, offset: 0 }));
  },
  mustFlag: [
    {
      files: 'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
      at: "tests/client/data/x.ct.tsx",
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "the create-entity-mutation flake verbatim — a bare `expect(recorder.count(...)).toBe(N)` read before the async call registered",
    },
    {
      files:
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ dialog }) => {\n  expect(await dialog.evaluate((n) => n.contains(document.activeElement))).toBe(true);\n});\n',
      at: "tests/ui/content/x.ct.tsx",
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "the lightbox focus-trap flake — a bare `expect(await locator.evaluate(...activeElement...)).toBe(true)` focus read",
    },
    {
      files:
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ canvas }) => {\n  expect((await canvas.boundingBox())?.width).toBeGreaterThan(300);\n});\n',
      at: "tests/ui/charts/x.ct.tsx",
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "the chart-resize flake — a bare `expect(await locator.boundingBox()?.width).toBeGreaterThan(...)` one-shot rect read",
    },
    {
      files:
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  const el = document.activeElement;\n  expect(el).toBe(document.body);\n});\n',
      at: "tests/ui/primitives/snap.ct.tsx",
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "an `activeElement` snapshot captured into a local then asserted non-retrying — the variable-capture focus-read shape",
    },
  ],
  mustPass: [
    {
      files: 'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ input }) => {\n  await expect(input).toBeFocused();\n});\n',
      at: "tests/ui/primitives/y.ct.tsx",
      why: "the FIX shape — a web-first auto-retrying `expect(<locator>).toBeFocused()` waits for focus to settle",
    },
    {
      files:
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  await expect.poll(() => trpc.count("tag.createTag")).toBe(2);\n});\n',
      at: "tests/client/data/y.ct.tsx",
      why: "the FIX shape — `expect.poll(() => <read>).toBe(...)` retries the read until it settles (callee is `expect.poll`, not bare `expect`)",
    },
    {
      files:
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ dialog }) => {\n  await expect(dialog).toContainText("hi");\n});\n',
      at: "tests/ui/content/z.ct.tsx",
      why: "a web-first `toContainText` on a locator — auto-retrying, never a one-shot read",
    },
    {
      files:
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  expect(trpc.count("tag.createTag")).toBe(2); // ONESHOT-OK: settled — count polled to 2 above\n});\n',
      at: "tests/client/data/escape.ct.tsx",
      why: "a deliberate settled recorder read escaped with `// ONESHOT-OK` on the same line — passes",
    },
    {
      files: 'import { expect } from "@playwright/experimental-ct-react";\nexport const g = expect(await page.evaluate(() => 1)).toBe(1);\n',
      at: "packages/server/src/domain/x.ts",
      why: "scope — the same shape OUTSIDE a *.ct.tsx file is not gated here (CT-only class); passes",
    },
    {
      files:
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  expect(results).toEqual([{ accepted: 0, rejected: 1 }]);\n});\n',
      at: "tests/ui/primitives/plain.ct.tsx",
      why: "a plain-value assertion whose arg is NOT a mutable-async read (a JS array from a callback) — out of the class; passes",
    },
  ],
};
