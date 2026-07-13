// Gate: content-part-seam (D51 — the multimodal content-part shape is threaded at the engine WIRE SEAM,
// content stays a `string` everywhere upstream). `ChatContentPart` (home: `@orb/contracts/chat`) is
// PRODUCED exactly once — at the engine request seam (`domain/chat/engine/pipeline.ts`, where each shaped
// string row is tokenized → image refs resolved → parts) — and CONSUMED only by `infra/providers/**` (the
// sealed runners mapping parts onto each backend's wire). Everything upstream (assemble/shape, verbs, the
// rest of `domain/chat`, transport) stays `content: string` — the wasteful "content-parts everywhere"
// retrofit D51 explicitly avoids. Enforced as the sanctioned-importer allowlist on the symbol: a
// `ChatContentPart` import from a file outside the seam set is RED (an upstream module reaching for parts).
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SYMBOL = "ChatContentPart";
const CONTRACTS_CHAT = /^@orb\/contracts\/chat(?:\/|$)/u;
// Production source only — the seam rule governs the runtime dependency graph; the centralized `tests/`
// mirror legitimately imports the contract type to test it.
const PROD_SRC = /\/packages\/[^/]+\/src\//u;

/** Files sanctioned to import `ChatContentPart` — the seam producer + the request DTO it fills + the
 *  infra consumers + the contracts home. */
const SANCTIONED = [
  // The contracts home (declares it) — matched loosely (the whole chat namespace).
  /\/packages\/contracts\/src\/chat\//u,
  // The infra consumers: the sealed runner tier maps parts onto each backend wire.
  /\/packages\/server\/src\/infra\/providers\//u,
  // The engine request SEAM — the ONE producer (D51).
  /\/packages\/server\/src\/domain\/chat\/engine\/pipeline\.ts$/u,
  // The domain-side request DTO the seam populates (content: ChatContentPart[] handed to the runner).
  /\/packages\/server\/src\/domain\/chat\/contract\/results\.ts$/u,
] as const;

const MESSAGE =
  "`ChatContentPart` is imported outside the D51 seam set (the engine producer `domain/chat/engine/" +
  "pipeline.ts` · the request DTO `domain/chat/contract/results.ts` · the infra/providers consumers · the " +
  "@orb/contracts/chat home) — content-parts are produced ONCE at the engine request seam and everything " +
  "upstream stays `content: string`. See Core-Path-Registry.md D51.";
// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (a)) ──────────────────────────────────────────────
// The legacy predicate as an ImportSpecifier subscription: a `ChatContentPart` named import from
// @orb/contracts/chat, in a prod-src file outside the D51 seam set. scanRoot mirrors the legacy
// PROD_SRC && !SANCTIONED filter (the parity oracle — the repoRel path is prefixed `/` to match the
// leading-slash-anchored regexes). Per-occurrence (each ChatContentPart named import). Kept ALONGSIDE
// the legacy Check.
/** Is this ImportSpecifier a `ChatContentPart` named import from @orb/contracts/chat? */
function isContentPartImport(spec: Node): boolean {
  if (!Node.isImportSpecifier(spec) || spec.getName() !== SYMBOL) {
    return false;
  }
  const decl = spec.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl !== undefined && CONTRACTS_CHAT.test(decl.getModuleSpecifierValue());
}

export const gate: GateDescriptor = {
  name: "content-part-seam",
  docRow: "Core-Path-Registry.md D51",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "keep `content: string` upstream; ChatContentPart is produced ONCE at the engine request seam (domain/chat/engine/pipeline.ts) and consumed only by infra/providers/**.",
  scanRoot: (p) => {
    const abs = `/${p}`;
    return PROD_SRC.test(abs) && !SANCTIONED.some((re) => re.test(abs));
  },
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, _sf, ctx) => {
    if (isContentPartImport(node)) {
      ctx.report(node, { token: SYMBOL, offset: 0 });
    }
  },
  mustFlag: [
    {
      files:
        'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type T = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/verbs/assemble.ts",
      why: "an upstream verb importing ChatContentPart — reaching for parts before the engine seam (D51)",
    },
  ],
  mustPass: [
    {
      files:
        'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/infra/providers/backends/kit/map.ts",
      why: "the infra/providers consumer is a sanctioned seam member — the sealed runner maps parts to wire",
    },
    {
      files:
        'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/engine/pipeline.ts",
      why: "the engine request seam (pipeline.ts) is the ONE sanctioned producer of parts (D51)",
    },
    {
      files:
        'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/contract/results.ts",
      why: "the request DTO (contract/results.ts) is the sanctioned member the seam populates",
    },
    {
      files:
        'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/contracts/src/chat/index.ts",
      why: "the contracts home declares the symbol — a sanctioned seam member",
    },
    {
      files:
        'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "tests/contracts/chat/index.test-d.ts",
      why: "the centralized tests/ mirror (not prod src) legitimately imports the contract type to test it — exempt",
    },
  ],
};
