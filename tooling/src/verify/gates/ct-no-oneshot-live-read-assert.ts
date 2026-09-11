// Gate: ct-no-oneshot-live-read-assert (Spine-Testing.md §7; the DEF-14 flake class) — an ORDINARY
// invariant: a Playwright component test (`*.ct.tsx`) never reads mutable async state with a NON-retrying
// assertion. A single synchronous read of mutable state samples MID-TRANSITION (focus moving, an
// animation/dialog settling, a ResizeObserver not yet fired, a network call not yet recorded) and passes or
// fails by timing luck — the class that flaked nine CTs (root-caused 2026-07-20: the lightbox focus-trap,
// chart resize, and create-entity `expect(trpc.count(x)).toBe(2)` read before the retry's call landed).
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
// already awaited it)? escape it with the central `@orb-waive ct-no-oneshot-live-read-assert(expect): <reason>`
// marker on the line immediately above (GATE-AUTHORING.md's central marker grammar; this gate no longer
// parses its own escape vocabulary — see "FAMILY DECISION" below).
//
// NOT flagged (already retrying): `expect.poll(...)` / `expect(...).toPass()` and the web-first locator
// matchers (`toBeFocused`/`toBeVisible`/`toHaveText`…).
// COMMENT POSTURE: comment-SAFE for detection (calls/definitions are AST nodes; the central marker engine
// owns comment/trivia reading). DECLARED LIMIT: only `*.ct.tsx` and the enumerated mutable-read APIs are
// judged.
//
// FAMILY DECISION (gate-runtime-standardization.md): singleton family. This gate's identity check
// (`readsMutableAsync`/matcher classification) is a private AST predicate with no sibling consumer among
// the other three gates in this migration lane — `ct-poll-schedule-and-paint` and `ct-story-single-import`
// each implement their own unrelated predicate over the same CT file class, and neither imports anything
// from here. Sharing a file CLASS ("CT test") is not sharing a computation or reader (design doc: "not
// that their filenames share a prefix or their prose mentions the same topic").
//
// CONTRACT CORRECTION: the legacy header called this "a HARD invariant" descriptively, but it always
// carried an escape door (`// ONESHOT-OK: <reason>`) for a provably-settled read — mechanically that is
// `authority: "ordinary"`, not `"hard"` (hard has no suppression door at all).
//
// UNTRANSLATED MARKER CENSUS (re-derived 2026-09-11, #1935): this conversion retired the private
// `ONESHOT-OK` parser for the central `@orb-waive` engine and translated NONE of the live markers — the
// central engine binds only `// @orb-waive ct-no-oneshot-live-read-assert(<position>): <reason>`, and
// every legacy marker on the real tree is still the OLD `// ONESHOT-OK: <reason>` spelling, which the
// central engine does not recognize under any grammar. A real run over the current population (491
// `*.ct.tsx` candidate files) reports 315 blocking findings and 0 waived. All 315 sit on a
// legacy-exempted position: 305 are `// ONESHOT-OK: <reason>` on the line ABOVE the guarded
// `expect(...)`, and 10 are TRAILING same-line comments (`expect(...); // ONESHOT-OK: <reason>`) — the
// central engine's node-anchored resolver reads LEADING trivia only, so it cannot bind a same-line
// trailing comment either. The 315 markers are spread across 105 distinct `.ct.tsx` files. This policy
// REDS the live tree until the marker-translation lane (#1260) rewrites all 315 sites into the
// `@orb-waive` grammar; until then every one of those 315 reasoned comments is dead text with no
// suppressive effect.
import type { CallExpression, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const ACTIVE_ELEMENT = "activeElement";

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
  "toBeInViewport()` — or wrap the read: `await expect.poll(() => <read>).toBe(...)`. Provably settled at " +
  "read-time? escape it with `// @orb-waive ct-no-oneshot-live-read-assert(expect): <reason>` on the line " +
  "immediately above (core/Spine-Testing.md §7).";

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

/** True when this `expect(...)` call is exactly the flagged shape: a plain non-retrying matcher reading
 *  mutable async state. Delivered one CallExpression at a time by the shared kind-indexed walk. */
function isLiveReadExpectCall(call: CallExpression): boolean {
  if (!isBareExpectCall(call)) {
    return false;
  }
  const matcher = matcherName(call);
  const [arg] = call.getArguments();
  return matcher !== undefined && !RETRYING_MATCHERS.has(matcher) && arg !== undefined && readsMutableAsync(arg);
}

export const gate = defineGate({
  id: "ct-no-oneshot-live-read-assert",
  family: "ct-no-oneshot-live-read-assert",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tests"], named: ["*.ct.tsx"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use a web-first auto-retrying assertion — `expect(<locator>).toBeFocused()/toBeVisible()/toHaveText(...)/toBeInViewport()` — or wrap the read: `await expect.poll(() => <read>).toBe(...)`; escape a provably-settled read with `@orb-waive ct-no-oneshot-live-read-assert(expect): <reason>`.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node) => {
          if (Node.isCallExpression(node) && isLiveReadExpectCall(node)) {
            ctx.report.node(node, { token: "expect", offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "tests/client/data/x.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
      },
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "the create-entity-mutation flake verbatim — a bare `expect(recorder.count(...)).toBe(N)` read before the async call registered",
    },
    {
      mode: "source",
      files: {
        "tests/ui/content/x.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ dialog }) => {\n  expect(await dialog.evaluate((n) => n.contains(document.activeElement))).toBe(true);\n});\n',
      },
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "the lightbox focus-trap flake — a bare `expect(await locator.evaluate(...activeElement...)).toBe(true)` focus read",
    },
    {
      mode: "source",
      files: {
        "tests/ui/charts/x.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ canvas }) => {\n  expect((await canvas.boundingBox())?.width).toBeGreaterThan(300);\n});\n',
      },
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "the chart-resize flake — a bare `expect(await locator.boundingBox()?.width).toBeGreaterThan(...)` one-shot rect read",
    },
    {
      mode: "source",
      files: {
        "tests/ui/primitives/snap.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  const el = document.activeElement;\n  expect(el).toBe(document.body);\n});\n',
      },
      expect: { messageIncludes: "MUTABLE ASYNC" },
      why: "an `activeElement` snapshot captured into a local then asserted non-retrying — the variable-capture focus-read shape",
    },
    {
      mode: "source",
      files: {
        "tests/ui/pane.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("live", async ({ pane }) => {\n  const text = await pane.textContent();\n  expect(text).toBe("settled");\n});\ntest("static", () => {\n  const text = "settled";\n  expect(text).toBe("settled");\n});\n',
      },
      expect: { count: 1, messageIncludes: "MUTABLE ASYNC" },
      why: "symbol identity matters: the live-read local is flagged while a same-named local in another test scope stays clean",
    },
    {
      mode: "source",
      files: {
        "tests/ui/taint.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("box", async ({ pane }) => {\n  const box = await pane.boundingBox();\n  expect(box?.width).toBeGreaterThan(0);\n});\ntest("text", async ({ pane }) => {\n  const text = (await pane.textContent())?.trim().toLowerCase();\n  expect(text).toBe("ready");\n});\n',
      },
      expect: { count: 2, messageIncludes: "MUTABLE ASYNC" },
      why: "property selection and pure transforms do not settle the mutable DOM snapshot",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/ui/primitives/y.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ input }) => {\n  await expect(input).toBeFocused();\n});\n',
      },
      why: "the FIX shape — a web-first auto-retrying `expect(<locator>).toBeFocused()` waits for focus to settle",
    },
    {
      mode: "source",
      files: {
        "tests/client/data/y.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  await expect.poll(() => trpc.count("tag.createTag")).toBe(2);\n});\n',
      },
      why: "the FIX shape — `expect.poll(() => <read>).toBe(...)` retries the read until it settles (callee is `expect.poll`, not bare `expect`)",
    },
    {
      mode: "source",
      files: {
        "tests/ui/content/z.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ dialog }) => {\n  await expect(dialog).toContainText("hi");\n});\n',
      },
      why: "a web-first `toContainText` on a locator — auto-retrying, never a one-shot read",
    },
    {
      mode: "source",
      files: {
        "tests/client/data/escape.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — count polled to 2 above\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
      },
      why: "a deliberate settled recorder read escaped with the central `@orb-waive` marker on the line immediately above — passes",
    },
    {
      mode: "source",
      files: {
        "tests/ui/primitives/plain.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  expect(results).toEqual([{ accepted: 0, rejected: 1 }]);\n});\n',
      },
      why: "a plain-value assertion whose arg is NOT a mutable-async read (a JS array from a callback) — out of the class; passes",
    },
    {
      mode: "source",
      files: {
        // A companion IN-population `.ct.tsx` file: `named: ["*.ct.tsx"]` excludes the `.test.ts` subject
        // below otherwise, and a population resolving zero paths from a nonempty candidate set is a tool
        // error, not a pass.
        "tests/client/lib/companion.ct.tsx":
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", async ({ input }) => {\n  await expect(input).toBeFocused();\n});\n',
        "tests/client/lib/notct.test.ts":
          'import { expect } from "@playwright/experimental-ct-react";\nexport const g = expect(await page.evaluate(() => 1)).toBe(1);\n',
      },
      why: "scope — the same shape outside a *.ct.tsx file is not gated here (CT-only class); passes",
    },
  ],
});
