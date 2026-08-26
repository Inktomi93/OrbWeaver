// Gate: public-route-body-cap — a mutating non-tRPC entry/http route that reads a request body must expose
// a byte-cap proxy. GET and zero-body mutations are controls; bundle import's incremental `stageCapped` arm
// is the non-buffering equivalent of Hono body-limit.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

const HTTP_DIR = "packages/server/src/entry/http/";
const HTTP_ANCHOR = `${HTTP_DIR}index.ts`;
const GATE_SELF = "tooling/src/verify/gates/public-route-body-cap.ts";
const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);
const BODY_READ_METHODS = new Set(["json", "parseBody", "formData", "arrayBuffer", "blob", "text"]);
const CAP_MIDDLEWARE = new Set(["bodyLimit", "bodyCap"]);
const CAP_NAME_RE = /(?:^|_)MAX(?:_[A-Z0-9]+)*_BYTES$/u;
const MAX_RESOLUTION_DEPTH = 8;
let mutatingRoutes = 0;
let bodyReadingRoutes = 0;

function routeMethod(node: Node): string | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = node.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && MUTATING_METHODS.has(callee.getName()))) {
    return;
  }
  return callee.getName();
}

function isHonoRequest(node: Node): boolean {
  return node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "req";
}

function isRawRequest(node: Node): boolean {
  return node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "raw" && isHonoRequest(node.getExpression());
}

function isRawRequestBody(node: Node, depth = 0): boolean {
  if (node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "body" && isRawRequest(node.getExpression())) {
    return true;
  }
  if (!node.isKind(SyntaxKind.Identifier) || depth >= MAX_RESOLUTION_DEPTH) {
    return false;
  }
  return (node.getSymbol()?.getDeclarations() ?? []).some((declaration) => {
    if (
      declaration.getSourceFile() !== node.getSourceFile() ||
      !declaration.isKind(SyntaxKind.VariableDeclaration) ||
      declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const
    ) {
      return false;
    }
    const initializer = declaration.getInitializer();
    return initializer !== undefined && isRawRequestBody(initializer, depth + 1);
  });
}

function readsRequestBody(node: Node): boolean {
  const callRead = node.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const callee = call.getExpression();
    if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && BODY_READ_METHODS.has(callee.getName()))) {
      return false;
    }
    const receiver = callee.getExpression();
    return isHonoRequest(receiver) || isRawRequest(receiver);
  });
  if (callRead) {
    return true;
  }
  return node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).some((property) => {
    if (property.getName() !== "body") {
      return false;
    }
    return isRawRequestBody(property);
  });
}

function resolvesCapMiddleware(node: Node): boolean {
  if (node.isKind(SyntaxKind.CallExpression)) {
    const callee = node.getExpression();
    return callee.isKind(SyntaxKind.Identifier) && CAP_MIDDLEWARE.has(callee.getText());
  }
  if (!node.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  return (node.getSymbol()?.getDeclarations() ?? []).some((declaration) => {
    if (
      declaration.getSourceFile() !== node.getSourceFile() ||
      !declaration.isKind(SyntaxKind.VariableDeclaration) ||
      declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const
    ) {
      return false;
    }
    const initializer = declaration.getInitializer();
    return initializer !== undefined && resolvesCapMiddleware(initializer);
  });
}

function hasCappedStream(handler: Node): boolean {
  return handler.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const callee = call.getExpression();
    const stream = call.getArguments()[0];
    const cap = call.getArguments()[2];
    return (
      callee.isKind(SyntaxKind.Identifier) &&
      callee.getText() === "stageCapped" &&
      stream !== undefined &&
      isRawRequestBody(stream) &&
      cap !== undefined &&
      CAP_NAME_RE.test(cap.getText())
    );
  });
}

function bodyReadersAreCapped(route: CallExpression): boolean {
  const args = route.getArguments();
  return args.every((handler, handlerIndex) => {
    if (!readsRequestBody(handler)) {
      return true;
    }
    const orderedMiddleware = args.some((candidate, candidateIndex) => candidateIndex > 0 && candidateIndex < handlerIndex && resolvesCapMiddleware(candidate));
    return orderedMiddleware || hasCappedStream(handler);
  });
}

export const gate: GateDescriptor = {
  name: "public-route-body-cap",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Tier-5-Entry.md; non-tRPC request-body trust boundary",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a mutating non-tRPC public route reads request-body data without a structural byte-cap proxy — an unauthenticated or authenticated caller can force unbounded buffering/work at the HTTP trust edge. See docs/design/issue-712-gate-family.md",
  fix: "put `bodyLimit({ maxSize: ... })` or the house `bodyCap(...)` before the handler; streaming bundle intake may use the exact incremental `stageCapped(..., *_MAX_*_BYTES)` arm. See docs/design/issue-712-gate-family.md",
  scanRoot: (path) => path.includes(HTTP_DIR),
  kinds: [SyntaxKind.CallExpression],
  begin: () => {
    mutatingRoutes = 0;
    bodyReadingRoutes = 0;
  },
  visit: (node, _sf, ctx) => {
    const method = routeMethod(node);
    if (method === undefined || !node.isKind(SyntaxKind.CallExpression)) {
      return;
    }
    mutatingRoutes += 1;
    if (!readsRequestBody(node)) {
      return;
    }
    bodyReadingRoutes += 1;
    if (!bodyReadersAreCapped(node)) {
      ctx.report(node, { token: method, offset: node.getText().indexOf(method) });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, HTTP_ANCHOR)) {
      return;
    }
    if (mutatingRoutes === 0 || bodyReadingRoutes === 0) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `public-route-body-cap measured ${mutatingRoutes.toString()} mutating routes and ${bodyReadingRoutes.toString()} body readers — the route census is blind. See docs/design/issue-712-gate-family.md`,
      });
    }
  },
  mustFlag: [
    {
      files: 'app.post("/api/x", async (c) => c.json(await c.req.json()));\n',
      at: `${HTTP_DIR}__g_route.ts`,
      expect: { count: 1, token: "post" },
      why: "the founding shape: a public mutating route buffers/parses a body with no byte-cap middleware",
    },
    {
      files: 'app.post("/api/x", async (c) => c.json(await c.req.json()), bodyLimit({ maxSize: MAX_BODY_BYTES }));\n',
      at: `${HTTP_DIR}__g_route.ts`,
      expect: { count: 1, token: "post" },
      why: "middleware ordering is the protection — a cap registered after the body-reading handler is inert",
    },
    {
      files: 'app.post("/api/x", async (c) => c.body(await c.req.raw.blob()));\n',
      at: `${HTTP_DIR}__g_route.ts`,
      expect: { count: 1, token: "post" },
      why: "Request.blob buffers the request body just like arrayBuffer/text and must not escape the route cap census",
    },
    {
      files: 'app.post("/api/x", async (c) => { stageCapped(unrelatedStream, path, IMPORT_MAX_TOTAL_BYTES); return c.json(await c.req.json()); });\n',
      at: `${HTTP_DIR}__g_route.ts`,
      expect: { count: 1, token: "post" },
      why: "an ordered cap over unrelated bytes does not bound the body reader in that handler; cap and body stream must be the same value",
    },
    {
      files: "export const frontDoor = true;\n",
      at: HTTP_ANCHOR,
      expect: { count: 1, messageIncludes: "route census is blind" },
      why: "fail loud when the canonical route tree yields no mutating/body-reading population",
    },
  ],
  mustPass: [
    {
      files: 'app.post("/api/x", bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => c.json(await c.req.json()));\n',
      at: `${HTTP_DIR}__g_route.ts`,
      why: "a Hono body-limit middleware before the handler is the normal capped-body arm",
    },
    {
      files: 'const cap = bodyLimit({ maxSize: MAX_BODY_BYTES });\napp.post("/api/x", cap, async (c) => c.json(await c.req.json()));\n',
      at: `${HTTP_DIR}__g_route.ts`,
      why: "real routes may name immutable body-limit middleware; resolving that binding must preserve the ordered-cap proof",
    },
    {
      files: 'app.post("/api/logout", async (c) => c.body(null, 200));\n',
      at: `${HTTP_DIR}__g_route.ts`,
      why: "a zero-body mutation has no body-buffering surface to cap",
    },
    {
      files: 'app.get("/api/debug", async (c) => c.json(await c.req.json()));\n',
      at: `${HTTP_DIR}__g_route.ts`,
      why: "GET is a method control; the gate owns mutating non-tRPC registrations only",
    },
    {
      files: 'app.post("/api/import", async (c) => { const body = c.req.raw.body; return stageCapped(body, path, IMPORT_MAX_TOTAL_BYTES); });\n',
      at: `${HTTP_DIR}__g_route.ts`,
      why: "the bundle importer enforces an incremental cap without Hono buffering the chunked stream",
    },
  ],
};
