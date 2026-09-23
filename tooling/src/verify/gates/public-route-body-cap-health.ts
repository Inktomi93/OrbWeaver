// Policy: public-route-body-cap-health — the HARD whole-population blindness tripwire for the sibling
// `public-route-body-cap` occurrence policy (family `public-route-body-cap`, shared reader
// `lib/http-route-body.ts`). A run whose entry/http population yields ZERO mutating routes, or zero
// body-reading routes among them, means the census the occurrence policy depends on is blind — either the
// population fence has drifted off the real route tree, or the route/body-read shape detectors have
// stopped recognizing the house patterns. This is an ABSENCE verdict about the WHOLE population, not one
// authored node, so it cannot carry an ordinary position token (guide §2.1: a file-level finding with a
// synthetic/absent token raises an authority-binding failure on the author's first real waiver) — hence
// `authority: "hard"`, no suppression door, and the split (one authority per policy, §12.1).
//
// `execution: "entire-population"` is deliberate: "is the census non-empty" is a verdict about the WHOLE
// http/ tree, and a narrowed/changed-files run must DEFER rather than report a false negative census.
//
// LEGACY at 86ce80b6c: `public-route-body-cap.ts`'s `finalize` hook (`ctx.scope.kind !== "project" ||
// !fileLoaded(ctx, HTTP_ANCHOR)` short-circuit, `mutatingRoutes === 0 || bodyReadingRoutes === 0`
// condition). The `fileLoaded`/`ctx.scope.kind` guard is now subsumed by population resolution itself: a
// population resolving to zero admitted paths from a nonempty candidate set is a TOOL ERROR at
// resolve-time (guide §2/§4), a LOUDER signal than the legacy silent no-op.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `public-route-body-cap` descriptor at d2d0f644c46ee75c2ac44d962d22d18a97a375fe, the parent of the conversion
// `04e455f4d`; this module did not exist there, so it is measured against the module it was carved from,
// `public-route-body-cap` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `86ce80b6c` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,455 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 17 and final `population` admits 17.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/server/src/entry/http/__cbbhr_in_auth-meta.ts`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { findEnclosingRouteArg, isBodyReadCall, isRawBodyPropertyAccess, routeMethod } from "../lib/http-route-body.ts";

// The finding anchors on the canonical http/ entry file, not this gate module's own path — `report.file`
// requires the identity to sit inside the policy's OWN population, and `tooling/src/verify/gates/**` is
// outside `@server`. This mirrors the legacy `finalize` hook's `fileLoaded(ctx, HTTP_ANCHOR)` guard.
const HTTP_ANCHOR = "packages/server/src/entry/http/index.ts";

const MESSAGE = "public-route-body-cap-health measured a blind route census — the routes live in packages/server/src/entry/app.ts";

export const gate = defineGate({
  id: "public-route-body-cap-health",
  family: "public-route-body-cap",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/entry/http/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  create: (ctx) => {
    const routes = new Set<import("ts-morph").CallExpression>();
    const bodyReadingRoutes = new Set<import("ts-morph").CallExpression>();

    const markBodyReading = (node: import("ts-morph").Node): void => {
      const found = findEnclosingRouteArg(node);
      if (found !== undefined) {
        bodyReadingRoutes.add(found.route);
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (routeMethod(node) !== undefined) {
              routes.add(node as import("ts-morph").CallExpression);
              return;
            }
            if (isBodyReadCall(node)) {
              markBodyReading(node);
            }
          },
        },
        {
          kinds: [SyntaxKind.PropertyAccessExpression],
          visit: (node) => {
            if (isRawBodyPropertyAccess(node)) {
              markBodyReading(node);
            }
          },
        },
      ],
      evaluate: () => {
        if (routes.size === 0 || bodyReadingRoutes.size === 0) {
          ctx.report.file(HTTP_ANCHOR, {
            line: 1,
            message: `${MESSAGE} — ${routes.size.toString()} mutating routes, ${bodyReadingRoutes.size.toString()} body-reading routes.`,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/entry/http/index.ts": "export const frontDoor = true;\n" },
      expect: { count: 1, line: 1, messageIncludes: "0 mutating routes, 0 body-reading routes." },
      why: "fail loud when the canonical route tree yields no mutating/body-reading population — carried from the legacy `finalize` hook's founding row",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/entry/http/index.ts": 'app.post("/api/x", async (c) => c.json(await c.req.json()));\n' },
      why: "at least one mutating, body-reading route in the population — the census is alive",
    },
  ],
});
