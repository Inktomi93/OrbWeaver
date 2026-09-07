// Gate: route-trpc-lifo-order — inside one `test(...)` callback body, a `page.route(<trpc-overlapping
// pattern>, ...)` call registered TEXTUALLY BEFORE a `routeTrpc(page, ...)` call in the same scope is
// RED. Playwright resolves routes LIFO (last-registered wins, and `routeTrpc`'s own handler never calls
// `route.fallback()`), so a `page.route` meant to hold/error/short-circuit a trpc read that is registered
// FIRST never actually runs — `routeTrpc`, registered second, intercepts every request first and answers
// it outright. A CT built on the inverted premise ("mine is registered first, so it wins") asserts a
// LOADING/ERROR arm while the component actually renders whatever `routeTrpc` served, and PASSES anyway
// (#629, #643). The sanctioned shape is `trpcHold()` + barrier-on-`hold.requested`, or register the
// `page.route` AFTER `routeTrpc` (the `add-chat-document-dialog.ct.tsx` / `tag-picker-dialog.ct.tsx`
// idiom — both cited in this gate's message).
//
// SCOPE, precisely: only a `page.route` whose first argument is a STRING LITERAL overlapping
// `**/api/trpc` is judged — a route for an unrelated endpoint (`**/api/auth/me`, `**/api/blob/**`,
// `**/api/assets/upload`) never collides with `routeTrpc`'s own `**/api/trpc/**` registration, and this
// tree has ~20 such coexisting, correct, unrelated `page.route` calls that must stay silent (mustPass).
// Only the DIRECT statement list of a `test(...)` callback's block body is walked — a `page.route` in a
// `beforeEach` ahead of a `routeTrpc` in the test body is the SAME trap in a different AST shape and is a
// DECLARED, uncovered limit (zero real instances on the tree today — verified by grep before writing this
// gate, not assumed).
//
// COMMENT POSTURE: comment-SAFE — both call sites and the string literal are read through the AST
// (`ast-read.ts`), never `sf.getFullText()`.
import type { Block, CallExpression, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";

const TEST_CALL_PREFIX = "test";
const PAGE_ROUTE = "page.route";
const ROUTE_TRPC = "routeTrpc";
const TRPC_PATTERN_PREFIX = "**/api/trpc";

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

/** Every `test(name, async (...) => { ... })` callback's Block body on this file — the ONE scope this
 *  gate judges (see header: `beforeEach` is a declared, uncovered limit). */
function testBodies(sf: SourceFile): Block[] {
  const bodies: Block[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const calleeText = call.getExpression().getText();
    if (calleeText !== TEST_CALL_PREFIX && !calleeText.startsWith(`${TEST_CALL_PREFIX}.`)) {
      continue;
    }
    const cb = call.getArguments().find((a) => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
    const body = cb?.getBody();
    if (body !== undefined && Node.isBlock(body)) {
      bodies.push(body);
    }
  }
  return bodies;
}

/** The trpc-overlapping URL pattern a `page.route(...)` call's first argument names, or undefined for
 *  any other route (no pattern overlap, no LIFO collision — stays silent). */
function trpcOverlapUrl(call: CallExpression): string | undefined {
  const [urlArg] = call.getArguments();
  const url = urlArg === undefined ? undefined : readStringValue(urlArg);
  return url?.startsWith(TRPC_PATTERN_PREFIX) === true ? url : undefined;
}

/** One test body: page.route(trpc-pattern) calls seen so far that have NOT yet been followed by a
 *  routeTrpc() call are flagged the moment routeTrpc() is finally reached — LIFO means routeTrpc, coming
 *  SECOND, wins the match and every earlier one of them never runs. */
function flagLifoInversions(body: Block, ctx: GateRunCtx): void {
  const pendingUnsafeRoutes: CallExpression[] = [];
  for (const stmt of body.getStatements()) {
    const call = leadingCall(stmt);
    if (call === undefined) {
      continue;
    }
    const calleeText = call.getExpression().getText();
    if (calleeText === PAGE_ROUTE) {
      if (trpcOverlapUrl(call) !== undefined) {
        pendingUnsafeRoutes.push(call);
      }
    } else if (calleeText === ROUTE_TRPC) {
      for (const pending of pendingUnsafeRoutes) {
        ctx.report(pending, { token: PAGE_ROUTE, offset: 0 });
      }
      pendingUnsafeRoutes.length = 0;
    }
  }
}

export const gate: GateDescriptor = {
  name: "route-trpc-lifo-order",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3, Playwright route LIFO, #643)",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    'a `page.route("**/api/trpc...", ...)` is registered BEFORE `routeTrpc(page, ...)` in the same test body — Playwright resolves routes LIFO (last-registered wins), so `routeTrpc` (registered second) intercepts and answers every trpc request first, and this earlier `page.route` NEVER RUNS. A test asserting the state this route was meant to hold/error/short-circuit is asserting whatever `routeTrpc` actually served instead, and can pass for the wrong reason (#629, #643). Use `trpcHold()` + a barrier on `hold.requested`, or register the `page.route` AFTER `routeTrpc` (see `add-chat-document-dialog.ct.tsx` / `tag-picker-dialog.ct.tsx`).',
  fix: 'reorder so `routeTrpc(...)` is called BEFORE the `page.route("**/api/trpc...", ...)` override, or switch to `trpcHold()` and barrier on `hold.requested`.',
  scanRoot: (p) => p.startsWith("tests/") && p.endsWith(".ct.tsx"),
  visitFile: (sf, ctx) => {
    for (const body of testBodies(sf)) {
      flagLifoInversions(body, ctx);
    }
  },
  mustFlag: [
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => new Promise(() => undefined));\n  await routeTrpc(page, {});\n});\n',
      at: "tests/client/features/g/g.ct.tsx",
      expect: { messageIncludes: "LIFO" },
      why: "the exact settings-context-tab.ct.tsx (#629) shape — page.route registered BEFORE routeTrpc, so routeTrpc (last-registered) wins and the pending-hang route never runs",
    },
  ],
  mustPass: [
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await routeTrpc(page, {});\n  await page.route("**/api/trpc/**", () => new Promise(() => undefined));\n});\n',
      at: "tests/client/features/g/g.ct.tsx",
      why: "the add-chat-document-dialog.ct.tsx / tag-picker-dialog.ct.tsx idiom — routeTrpc FIRST, the override page.route SECOND (last-registered, correctly wins) — passes",
    },
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await page.route("**/api/auth/me", () => undefined);\n  await routeTrpc(page, {});\n});\n',
      at: "tests/client/features/g/g2.ct.tsx",
      why: "a page.route for an UNRELATED endpoint (**/api/auth/me) before routeTrpc — no pattern overlap, no LIFO collision, passes",
    },
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => undefined);\n});\n',
      at: "tests/client/features/g/g3.ct.tsx",
      why: "a page.route with NO routeTrpc anywhere in scope — not every route is a tRPC stub, passes",
    },
  ],
};
