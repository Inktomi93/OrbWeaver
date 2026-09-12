// Policy: route-trpc-lifo-order (#629, #643) — inside one `test(...)` callback body, a
// `page.route(<trpc-overlapping pattern>, …)` call registered TEXTUALLY BEFORE a `routeTrpc(page, …)`
// call in the same statement list is RED. Playwright resolves routes LIFO (last-registered wins, and
// `routeTrpc`'s own handler never calls `route.fallback()`), so a `page.route` meant to hold/error/
// short-circuit a trpc read that is registered FIRST never actually runs — `routeTrpc`, registered
// second, intercepts every request first and answers it outright. A CT built on the inverted premise
// ("mine is registered first, so it wins") asserts a LOADING/ERROR arm while the component actually
// renders whatever `routeTrpc` served, and PASSES anyway. The sanctioned shape is `trpcHold()` +
// barrier-on-`hold.requested`, or register the `page.route` AFTER `routeTrpc`.
//
// SCOPE, precisely: only a `page.route` whose first argument is a STRING LITERAL overlapping
// `**/api/trpc` is judged — a route for an unrelated endpoint (`**/api/auth/me`, `**/api/blob/**`)
// never collides with `routeTrpc`'s own `**/api/trpc/**` registration, and this tree has ~20 such
// coexisting, correct, unrelated `page.route` calls that must stay silent. Only the DIRECT statement
// list of a `test(...)` callback's block body is walked — a `page.route` in a `beforeEach` ahead of a
// `routeTrpc` in the test body is the SAME trap in a different AST shape and is a DECLARED, uncovered
// limit, now PINNED by `mustPass[4]` so the limit cannot silently widen or silently close.
//
// COMMENT POSTURE: comment-SAFE — both call sites and the string literal are read through the AST
// (`lib/ast-read.ts`), never `sf.getFullText()`.
//
// FAMILY `route-trpc-lifo-order` — a declared SINGLETON. Re-derived 2026-09-12 with `pnpm ast` over
// `page.route` and `routeTrpc` across the whole gate corpus: no other module, legacy or final, judges
// Playwright route registration ORDER, and the statement-order read this policy performs (`leadingCall`
// over one block's direct statements) has exactly ONE consumer, so promoting it to `lib/` would be this
// gate's private reader wearing a shared reader's clothes (§11.5). The census proposed a "shared test
// callback/statement-order fact"; it has no second consumer today and is not invented here.
//
// POPULATION PORT: byte-identical. The legacy descriptor's `scanRoot` was
// `p.startsWith("tests/") && p.endsWith(".ct.tsx")`; `{ in: ["@tests"], named: ["*.ct.tsx"] }` resolves
// the same set — `@tests` IS `tests/`, and `named` matches the basename, which for a `.ct.tsx` suffix is
// the same predicate as the path suffix (no directory segment can end in `.ct.tsx` and still carry a
// file below it). The fence is pinned by `mustPass[3]`, the only row that dies without it.
//
// LEGACY SHA: 174cc2961 (`git show 174cc2961:tooling/src/verify/gates/route-trpc-lifo-order.ts`).
// §4.6 differential: fixture-level replay of that descriptor over every row's own file map — see the
// conversion commit. Real-corpus replay is VACUOUS in both directions (the legacy side is zero because
// the tree has no live inversion), so the fixture-level method is the one that reaches catch parity.
import type { Block, CallExpression, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";

const TEST_CALL_PREFIX = "test";
const PAGE_ROUTE = "page.route";
const ROUTE_TRPC = "routeTrpc";
const TRPC_PATTERN_PREFIX = "**/api/trpc";

const MESSAGE =
  'a `page.route("**/api/trpc...", …)` is registered BEFORE `routeTrpc(page, …)` in the same test body — Playwright resolves routes LIFO (last-registered wins), so `routeTrpc` (registered second) intercepts and answers every trpc request first, and this earlier `page.route` NEVER RUNS. A test asserting the state this route was meant to hold/error/short-circuit is asserting whatever `routeTrpc` actually served instead, and can pass for the wrong reason (#629, #643). Use `trpcHold()` + a barrier on `hold.requested`, or register the `page.route` AFTER `routeTrpc` (see `add-chat-document-dialog.ct.tsx` / `tag-picker-dialog.ct.tsx`).';
const FIX =
  'reorder so `routeTrpc(…)` is called BEFORE the `page.route("**/api/trpc...", …)` override, or switch to `trpcHold()` and barrier on `hold.requested`. A deliberate inversion waives with `@orb-waive route-trpc-lifo-order(page.route): <reason + end condition>` — the reported position is always the literal text `page.route`, because the report passes that token explicitly at offset 0 of the flagged CALL, never the URL argument and never the enclosing `await`.';

function unwrapAwait(node: TsNode): TsNode {
  const n = unwrapExpression(node);
  return Node.isAwaitExpression(n) ? unwrapExpression(n.getExpression()) : n;
}

/** The innermost CallExpression a statement's leading expression resolves to, unwrapping `await` and a
 *  single VariableDeclaration/ReturnStatement initializer — the shapes every real call site in this
 *  corpus uses (`await page.route(...)`, `const trpc = await routeTrpc(...)`, `return routeTrpc(...)`). */
function leadingCall(stmt: TsNode): CallExpression | undefined {
  let expr: TsNode | undefined;
  if (Node.isExpressionStatement(stmt)) {
    expr = stmt.getExpression();
  } else if (Node.isVariableStatement(stmt)) {
    expr = stmt.getDeclarationList().getDeclarations()[0]?.getInitializer();
  } else if (Node.isReturnStatement(stmt)) {
    expr = stmt.getExpression();
  }
  if (expr === undefined) {
    return;
  }
  const call = unwrapAwait(expr);
  return Node.isCallExpression(call) ? call : undefined;
}

/** The Block body of a `test(name, async (…) => { … })` callback, or undefined for any other call —
 *  the ONE scope this policy judges (see header: `beforeEach` is a declared, pinned limit). */
function testBody(call: CallExpression): Block | undefined {
  const calleeText = call.getExpression().getText();
  if (calleeText !== TEST_CALL_PREFIX && !calleeText.startsWith(`${TEST_CALL_PREFIX}.`)) {
    return;
  }
  const cb = call.getArguments().find((a) => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
  const body = cb?.getBody();
  return body !== undefined && Node.isBlock(body) ? body : undefined;
}

/** The trpc-overlapping URL pattern a `page.route(...)` call's first argument names, or undefined for
 *  any other route (no pattern overlap, no LIFO collision — stays silent). */
function trpcOverlapUrl(call: CallExpression): string | undefined {
  const [urlArg] = call.getArguments();
  const url = urlArg === undefined ? undefined : readStringValue(urlArg);
  return url?.startsWith(TRPC_PATTERN_PREFIX) === true ? url : undefined;
}

/** One test body: `page.route(trpc-pattern)` calls seen so far that have NOT yet been followed by a
 *  `routeTrpc()` call are flagged the moment `routeTrpc()` is finally reached — LIFO means routeTrpc,
 *  coming SECOND, wins the match and every earlier one of them never runs. */
function invertedRegistrations(body: Block): readonly CallExpression[] {
  const inverted: CallExpression[] = [];
  let pending: CallExpression[] = [];
  for (const stmt of body.getStatements()) {
    const call = leadingCall(stmt);
    const calleeText = call?.getExpression().getText();
    if (call !== undefined && calleeText === PAGE_ROUTE && trpcOverlapUrl(call) !== undefined) {
      pending.push(call);
    } else if (calleeText === ROUTE_TRPC) {
      inverted.push(...pending);
      pending = [];
    }
  }
  return inverted;
}

export const gate = defineGate({
  id: "route-trpc-lifo-order",
  family: "route-trpc-lifo-order",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tests"], named: ["*.ct.tsx"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node): void => {
          const body = Node.isCallExpression(node) ? testBody(node) : undefined;
          for (const inverted of body === undefined ? [] : invertedRegistrations(body)) {
            ctx.report.node(inverted, { token: PAGE_ROUTE, offset: 0, message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/g.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => new Promise(() => undefined));\n  await routeTrpc(page, {});\n});\n',
      },
      expect: { count: 1, token: PAGE_ROUTE, line: 4 },
      why: "THE FOUNDING ROW — the exact settings-context-tab.ct.tsx (#629) shape: page.route registered BEFORE routeTrpc, so routeTrpc (last-registered) wins and the pending-hang route never runs. The `line` pins that the flagged node is the EARLIER call, not the routeTrpc that triggered the flush",
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/two.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/chat.list*", () => undefined);\n  await page.route("**/api/trpc/**", () => undefined);\n  await routeTrpc(page, {});\n});\n',
      },
      expect: { count: 2, token: PAGE_ROUTE },
      why: "EVERY pending inversion is reported, not just the nearest — the flush drains the whole list, because LIFO buries all of them under the one `routeTrpc` registered last. Two findings, two lines, one shared token",
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/skip.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest.skip("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => undefined);\n  await routeTrpc(page, {});\n});\n',
      },
      expect: { count: 1, token: PAGE_ROUTE },
      why: "the `test.<modifier>(…)` spelling — `test.skip` / `test.only` / `test.fixme` are the same scope, and the callee prefix arm is what admits them; a `test`-exact check would silently pass every modified test on the tree",
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/bound.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => undefined);\n  const trpc = await routeTrpc(page, {});\n  void trpc;\n});\n',
      },
      expect: { count: 1, token: PAGE_ROUTE },
      why: "the VARIABLE-STATEMENT spelling of the second registration (`const trpc = await routeTrpc(…)`) — `leadingCall` unwraps the initializer, so binding the handle does not hide the inversion",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/g.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await routeTrpc(page, {});\n  await page.route("**/api/trpc/**", () => new Promise(() => undefined));\n});\n',
      },
      why: "THE FIX — the add-chat-document-dialog.ct.tsx / tag-picker-dialog.ct.tsx idiom: routeTrpc FIRST, the override page.route SECOND (last-registered, correctly wins)",
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/g2.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await page.route("**/api/auth/me", () => undefined);\n  await routeTrpc(page, {});\n});\n',
      },
      why: "THE PATTERN FENCE, pinned: a page.route for an UNRELATED endpoint (**/api/auth/me) before routeTrpc — no pattern overlap, no LIFO collision. Drop the `**/api/trpc` prefix test and this row is the one that dies (~20 correct unrelated page.route calls live on this tree)",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/g/g3.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => undefined);\n});\n',
      },
      why: "a page.route with NO routeTrpc anywhere in scope — not every trpc route is a stub under someone else's registration, and nothing buries it",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/g/anchor.ct.tsx": "export const anchor = 1;\n",
        "tests/client/features/g/g.test.ts":
          'import { test } from "vitest";\ndeclare const page: { route: (u: string, h: () => unknown) => Promise<void> };\ndeclare function routeTrpc(p: unknown, r: unknown): Promise<void>;\ntest("g", async () => {\n  await page.route("**/api/trpc/**", () => undefined);\n  await routeTrpc(page, {});\n});\n',
      },
      why: 'THE POPULATION FENCE, pinned: the identical inversion in a NODE test under `tests/` is not a finding — Playwright\'s LIFO route table exists only in a browser CT. Drop `named: ["*.ct.tsx"]` and this is the only row that dies. The clean `anchor.ct.tsx` beside it is mandatory, not decoration: a fence falsifier whose only file sits OUTSIDE the population admits zero paths and comes back a `[population]` TOOL ERROR rather than a finding',
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/hook.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ndeclare function beforeEach(fn: (args: { page: unknown }) => Promise<void>): void;\nbeforeEach(async ({ page }) => {\n  await page.route("**/api/trpc/**", () => undefined);\n});\ntest("g", async ({ page }) => {\n  await routeTrpc(page, {});\n});\n',
      },
      why: "THE DECLARED LIMIT, half one — CROSS-SCOPE: a `page.route` in a `beforeEach` ahead of a `routeTrpc` in the test body is the SAME trap in a different AST shape and this policy does NOT judge it (zero real instances on the tree, re-derived 2026-09-12). No cut of the callee fence reds this row, because neither scope contains an inversion on its own; it is the honest record of the limit, and the row BELOW is the one that makes the fence falsifiable",
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/hook-internal.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ndeclare function beforeEach(fn: (args: { page: unknown }) => Promise<void>): void;\nbeforeEach(async ({ page }) => {\n  await page.route("**/api/trpc/**", () => undefined);\n  await routeTrpc(page, {});\n});\ntest("g", async () => {\n  await Promise.resolve();\n});\n',
      },
      why: "THE DECLARED LIMIT, half two — THE CALLEE FENCE, pinned: a WHOLE inversion (both calls, in order) inside a `beforeEach` body is not judged, because this policy walks only a `test(…)` callback's own statement list. Widen `testBody` past the `test`/`test.<modifier>` callee and this is the only row that dies. The two halves are separate rows on purpose: the cross-scope row above cannot falsify the fence, because no single scope in it holds an inversion",
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/dynamic.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\nconst pattern = "**/api/trpc/**";\ntest("g", async ({ page }) => {\n  await page.route(pattern, () => undefined);\n  await routeTrpc(page, {});\n});\n',
      },
      why: "THE LITERAL-ONLY LIMIT, pinned: `readStringValue` sees through `as`/`satisfies`/parens/template literals but never resolves an IDENTIFIER, so a pattern held in a variable is unjudged. Treat a non-literal first argument as overlapping and this row is the one that dies",
    },
    {
      mode: "source",
      files: {
        "tests/client/support/node/route-trpc.ts": "export declare function routeTrpc(page: unknown, routes: unknown): Promise<void>;\n",
        "tests/client/features/g/waived.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  // @orb-waive route-trpc-lifo-order(page.route): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  await page.route("**/api/trpc/**", () => new Promise(() => undefined));\n  await routeTrpc(page, {});\n});\n',
      },
      why: "POSITIONAL IDENTITY (§4.2): the report passes the token `page.route` explicitly at offset 0 of the flagged CALL, so an author waives the REGISTRATION — not the URL pattern and not the enclosing `await`. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
