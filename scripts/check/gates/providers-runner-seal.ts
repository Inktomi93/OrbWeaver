// Gate: providers-runner-seal (core/Tier-3b-Providers.md invariant #3) — the runner DERIVATION + VOCAB
// (`deriveRunner` / `backendForSource` / `BackendKey` / `BACKEND_KEYS`) are sealed INSIDE infra/providers
// and never leave it. They ARE legitimately reachable on the providers barrel — the role dispatchers and
// the `roles/dispatch.test.ts` self-test consume them, and the derivation is unit-tested directly. What
// the doctrine forbids is a PRODUCTION CONSUMER ABOVE infra reaching for them: a `domain` / `transport` /
// `entry` module that imports the runner key escapes the firewall (it could route around the sealed
// (api,source)→backend derivation). This is the doc's "grep for runner/family in domain/** → RED": no
// consumer above infra may import a sealed runner symbol. Intra-providers + tests are exempt.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SEALED = new Set(["deriveRunner", "backendForSource", "BackendKey", "BACKEND_KEYS"]);
const CONSUMER = /\/packages\/server\/src\/(?:domain|transport|entry)\//u;
// ── SINGLE-PASS CONTRACT FORM (§1.2 — a per-node import-seal gate) ─────────────────────────────────
// The legacy predicate as an ImportSpecifier subscription: a sealed runner symbol imported by a
// domain/transport/entry consumer. scanRoot mirrors the legacy CONSUMER filter. The sealed name rides as
// the token. Per-occurrence. Not fsBacked. Byte-identical to the legacy Check.
export const gate: GateDescriptor = {
  name: "providers-runner-seal",
  docRow: "core/Tier-3b-Providers.md inv #3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a sealed runner symbol (deriveRunner / backendForSource / BackendKey / BACKEND_KEYS) is imported by a production consumer ABOVE infra — a domain/transport/entry module must route through the providers role surface, never the runner key (core/Tier-3b-Providers.md inv #3).",
  fix: "route through the providers role surface — never import the runner derivation/vocab into domain/transport/entry.",
  scanRoot: (p) => CONSUMER.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node: Node, _sf, ctx) => {
    if (node.isKind(SyntaxKind.ImportSpecifier) && SEALED.has(node.getName())) {
      ctx.report(node, { token: node.getName(), offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'import { deriveRunner } from "@orb/server";\nexport const r = deriveRunner;\n',
      at: "packages/server/src/domain/chat/x.ts",
      why: "a domain module importing the sealed deriveRunner — escapes the (api,source)→backend firewall",
    },
  ],
  mustPass: [
    {
      files: 'import { deriveRunner } from "@orb/server";\nexport const r = deriveRunner;\n',
      at: "packages/server/src/infra/providers/roles/dispatch.ts",
      why: "intra-providers consumption of the sealed symbol — legitimate, out of scanRoot, passes",
    },
  ],
};
