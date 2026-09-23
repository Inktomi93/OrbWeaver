// Policy: public-route-body-cap — a mutating non-tRPC entry/http route that reads a request body must
// expose a byte-cap proxy: middleware ordered BEFORE the body-reading handler, or the incremental
// `stageCapped(stream, path, *_MAX_*_BYTES)` arm reading directly from the raw request body. GET and
// zero-body mutations are controls; the population census (a run whose route/body-reader counts both
// land at zero is a blindness tripwire on the whole family) is the separate HARD `-health` sibling
// (`public-route-body-cap-health.ts`, same family) — an absence verdict about the whole population has
// no node to anchor an ordinary marker on (guide §2.1's "file-level finding with a synthetic or absent
// token" class), and one authority per policy makes the split mandatory rather than stylistic.
//
// FAMILY `public-route-body-cap` — the shared reader is `lib/http-route-body.ts`: route-method identity,
// Hono-request/raw-body shape, same-file const-binding resolution for both the cap-middleware identifier
// and the raw-body stream identifier, and `findEnclosingRouteArg` — the ancestor-walk that replaces the
// legacy per-handler `getDescendantsOfKind` subtree sweep with "visit X's own kind everywhere, then climb
// to the enclosing route argument" (guide §3: gate modules cannot call `getDescendantsOfKind`).
// POPULATION PORT: byte-identical. Legacy `scanRoot` was `path.includes(HTTP_DIR)`
// (`packages/server/src/entry/http/`); final population is `{ in: ["@server"], under:
// ["packages/server/src/entry/http/**"] }`.
// LEGACY at 86ce80b6c.
//
// §4.6 DIFFERENTIAL (committed at tests/tooling/verify/gates/simple-visitors-1584.suite.test.ts): every legacy
// mustFlag/mustPass example (minus the census row, ported to the `-health` sibling) replays identically —
// same finding count, same reported method-name token. No finding or tool-error delta on this arm.
//
// THE ORDINARY DOOR IS REAL: the reported position is always the route's own method name
// (`post`/`put`/`patch`/`delete`), a bare identifier that is guaranteed authored text at the call's own
// offset — no paren, no newline, no solidus, the three shapes that break the ordinary door elsewhere in
// this program. Driven (not merely claimed) in the family test's `assumes-single-replica` control, which
// exercises the shared position mechanism (`report.node(node, {token, offset})`, offset from the node's
// own start) every ordinary policy in this lane uses.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `public-route-body-cap` descriptor at d2d0f644c46ee75c2ac44d962d22d18a97a375fe, the parent of the conversion
// `04e455f4d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `86ce80b6c`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,455 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 17 and final `population` admits 17.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/server/src/entry/http/__cbbhr_in_auth-meta.ts`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import {
  findEnclosingRouteArg,
  isBodyReadCall,
  isCappedStreamCall,
  isRawBodyPropertyAccess,
  resolvesCapMiddleware,
  routeMethod,
} from "../lib/http-route-body.ts";

const MESSAGE =
  "a mutating non-tRPC public route reads request-body data without a structural byte-cap proxy — an " +
  "unauthenticated or authenticated caller can force unbounded buffering/work at the HTTP trust edge.";
const FIX =
  "put `bodyLimit({ maxSize: ... })` or the house `bodyCap(...)` before the handler; streaming bundle " +
  "intake may use the exact incremental `stageCapped(..., *_MAX_*_BYTES)` arm. A deliberate exception " +
  "waives with `@orb-waive public-route-body-cap(<method>): <reason + end condition>` — the reported " +
  "position is always the route's own method name (`post`/`put`/`patch`/`delete`), the literal text the " +
  "report passes explicitly at the call's own offset.";

export const gate = defineGate({
  id: "public-route-body-cap",
  family: "public-route-body-cap",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/entry/http/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const routes = new Set<import("ts-morph").CallExpression>();
    const bodyReadArgs = new Map<import("ts-morph").CallExpression, Set<number>>();
    const cappedStreamArgs = new Map<import("ts-morph").CallExpression, Set<number>>();

    const markArg = (index: import("ts-morph").CallExpression, argIndex: number, table: Map<import("ts-morph").CallExpression, Set<number>>): void => {
      const set = table.get(index) ?? new Set<number>();
      set.add(argIndex);
      table.set(index, set);
    };

    const attribute = (node: import("ts-morph").Node, table: Map<import("ts-morph").CallExpression, Set<number>>): void => {
      const found = findEnclosingRouteArg(node);
      if (found !== undefined) {
        markArg(found.route, found.argIndex, table);
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
              attribute(node, bodyReadArgs);
              return;
            }
            if (isCappedStreamCall(node)) {
              attribute(node, cappedStreamArgs);
            }
          },
        },
        {
          kinds: [SyntaxKind.PropertyAccessExpression],
          visit: (node) => {
            if (isRawBodyPropertyAccess(node)) {
              attribute(node, bodyReadArgs);
            }
          },
        },
      ],
      evaluate: () => {
        for (const route of routes) {
          const method = routeMethod(route);
          if (method === undefined) {
            continue;
          }
          const bodyArgs = bodyReadArgs.get(route);
          const cappedArgs = cappedStreamArgs.get(route);
          const args = route.getArguments();
          const uncapped = args.some((_arg, handlerIndex) => {
            if (bodyArgs?.has(handlerIndex) !== true) {
              return false;
            }
            const orderedMiddleware = args.some(
              (candidate, candidateIndex) => candidateIndex > 0 && candidateIndex < handlerIndex && resolvesCapMiddleware(candidate),
            );
            const cappedInline = cappedArgs?.has(handlerIndex) === true;
            return !(orderedMiddleware || cappedInline);
          });
          if (uncapped) {
            ctx.report.node(route, { token: method, offset: route.getText().indexOf(method), message: MESSAGE, fix: FIX });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/entry/http/__probe.ts": 'app.post("/api/x", async (c) => c.json(await c.req.json()));\n' },
      expect: { count: 1, token: "post" },
      why: "the founding shape: a public mutating route buffers/parses a body with no byte-cap middleware",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/http/__probe.ts": 'app.post("/api/x", async (c) => c.json(await c.req.json()), bodyLimit({ maxSize: MAX_BODY_BYTES }));\n',
      },
      expect: { count: 1, token: "post" },
      why: "middleware ordering is the protection — a cap registered after the body-reading handler is inert",
    },
    {
      mode: "types",
      files: { "packages/server/src/entry/http/__probe.ts": 'app.post("/api/x", async (c) => c.body(await c.req.raw.blob()));\n' },
      expect: { count: 1, token: "post" },
      why: "Request.blob buffers the request body just like arrayBuffer/text and must not escape the route cap census",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/http/__probe.ts":
          'app.post("/api/x", async (c) => { stageCapped(unrelatedStream, path, IMPORT_MAX_TOTAL_BYTES); return c.json(await c.req.json()); });\n',
      },
      expect: { count: 1, token: "post" },
      why: "an ordered cap over unrelated bytes does not bound the body reader in that handler; cap and body stream must be the same value",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/entry/http/__probe.ts": 'app.post("/api/x", bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => c.json(await c.req.json()));\n',
      },
      why: "a Hono body-limit middleware before the handler is the normal capped-body arm",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/http/__probe.ts":
          'const cap = bodyLimit({ maxSize: MAX_BODY_BYTES });\napp.post("/api/x", cap, async (c) => c.json(await c.req.json()));\n',
      },
      why: "real routes may name immutable body-limit middleware; resolving that binding must preserve the ordered-cap proof",
    },
    {
      mode: "types",
      files: { "packages/server/src/entry/http/__probe.ts": 'app.post("/api/logout", async (c) => c.body(null, 200));\n' },
      why: "a zero-body mutation has no body-buffering surface to cap",
    },
    {
      mode: "types",
      files: { "packages/server/src/entry/http/__probe.ts": 'app.get("/api/debug", async (c) => c.json(await c.req.json()));\n' },
      why: "GET is a method control; the policy owns mutating non-tRPC registrations only",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/http/__probe.ts":
          'app.post("/api/import", async (c) => { const body = c.req.raw.body; return stageCapped(body, path, IMPORT_MAX_TOTAL_BYTES); });\n',
      },
      why: "the bundle importer enforces an incremental cap without Hono buffering the chunked stream",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/http/__probe.ts":
          "// @orb-waive public-route-body-cap(post): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'app.post("/api/x", async (c) => c.json(await c.req.json()));\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of mustFlag[0], producing exactly one finding, waived by the one central marker at the position this policy actually reports (the method name `post`)",
    },
  ],
});
