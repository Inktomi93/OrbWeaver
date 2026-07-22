// Gate: fetch-fn-in-features — a client feature must NEVER hand-write a global `fetch(` call. HTTP-route
// egress (multipart/binary/streaming — anything not tRPC) gets ONE `data/` fetch fn each (upload-asset,
// import-tree, the auth-session me/login/logout seam), sharing http-error.ts + the CSRF_HEADER; a feature
// imports that fn, never the wire primitive. This is R5 in client-architecture-lockdown.md §10/§16 —
// deferred-until-first-offender, now BUILT (the auth-bootstrap trio was the second offender class that
// tripped the trigger). Only the BARE `fetch` identifier callee fires: a method tail (`x.fetch()`,
// `config.refetch()`, `this.fetch()`) is a different symbol and must NOT match.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const FEATURES_ROOT = "packages/client/src/features/";
const FETCH = "fetch";

/** A CallExpression whose callee is the BARE global identifier `fetch` — not `x.fetch` / `x.refetch`
 *  (those are PropertyAccessExpression callees, a different symbol). */
function isBareFetchCall(node: Node): boolean {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const callee = node.getExpression();
  return callee.isKind(SyntaxKind.Identifier) && callee.getText() === FETCH;
}

export const gate: GateDescriptor = {
  name: "fetch-fn-in-features",
  docRow: "client-architecture-lockdown.md §16 R5",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a client feature hand-writes a global `fetch(` — a feature NEVER writes fetch(). HTTP-route egress " +
    "gets ONE data/ fetch fn each (beside upload-asset.ts / auth-session.ts), imported via #data; " +
    "everything else is tRPC. See client-architecture-lockdown.md §10/§16 R5.",
  fix: "move the raw fetch into a data/ fetch fn (the auth-session.ts / upload-asset.ts precedent) and import it from #data; use tRPC for non-multipart/binary/streaming.",
  scanRoot: (p) => p.startsWith(FEATURES_ROOT),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (isBareFetchCall(node)) {
      ctx.report(node, { token: `${FETCH}(…)`, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'export async function load() {\n  return await fetch("/api/x");\n}\n',
      at: "packages/client/src/features/thing/lib/load.ts",
      expect: { messageIncludes: "NEVER writes fetch" },
      why: 'a feature file hand-writing `await fetch("/api/x")` — the R5 offense (route the egress through a data/ fetch fn)',
    },
  ],
  mustPass: [
    {
      files: "export function refresh(q: { refetch: () => void }) {\n  q.refetch();\n}\n",
      at: "packages/client/src/features/thing/lib/refresh.ts",
      why: "a `.refetch()` method call is a different symbol (PropertyAccess callee), not the bare `fetch` identifier — passes",
    },
    {
      files: "export class Loader {\n  fetch() {}\n  run() {\n    this.fetch();\n  }\n}\n",
      at: "packages/client/src/features/thing/lib/loader.ts",
      why: "a `this.fetch()` method call is a PropertyAccess callee, not the bare global `fetch` — passes",
    },
    {
      files: 'export async function load() {\n  return await fetch("/api/x");\n}\n',
      at: "packages/client/src/data/auth-session.ts",
      why: "scope: a raw fetch in a data/ fetch fn (the sanctioned HTTP-route seam home) is not under features/ — passes",
    },
  ],
};
