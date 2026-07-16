// Gate: providers-runner-seal (Tier-3b-Providers.md invariant #3) — the runner derivation + vocab
// (`deriveRunner`/`backendForSource`/`BackendKey`/`BACKEND_KEYS`) are sealed inside infra/providers and
// never leave it. A `domain`/`transport`/`entry` module importing a sealed runner symbol escapes the
// firewall (routes around the sealed (api,source)→backend derivation) and is RED. Intra-providers + tests are exempt.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SEALED = new Set(["deriveRunner", "backendForSource", "BackendKey", "BACKEND_KEYS"]);
const CONSUMER = /\/packages\/server\/src\/(?:domain|transport|entry)\//u;
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
    {
      files: 'import { backendForSource } from "@orb/server";\nexport const b = backendForSource;\n',
      at: "packages/server/src/infra/x.ts",
      why: "a sealed symbol (backendForSource) imported by infra/ itself — NOT a domain/transport/entry consumer, out of scanRoot, passes",
    },
  ],
};
