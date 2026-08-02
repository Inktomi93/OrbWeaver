// Gate: content-part-seam (D51 — the multimodal content-part shape is threaded at the engine WIRE SEAM,
// content stays a `string` everywhere upstream). `ChatContentPart` is produced exactly once (at
// domain/chat/engine/pipeline.ts) and consumed only by infra/providers/** (the sealed runners). Everything
// else stays `content: string`. Enforced as a sanctioned-importer allowlist on the symbol: a
// `ChatContentPart` import from a file outside the seam set is RED.
//
// TWO-SIDED (gate-hub #10): a SANCTIONED pattern matching NO file in the project is RED — a seam member
// that moved or died leaves a hole in the scan (every file it used to cover silently stops being checked),
// so the row ratchets down with the code. The stale arm self-guards on a REAL-TREE ANCHOR (gate-hub #11):
// the conformance mini-projects hold 1-2 files and would "prove" every seam member had vanished, so it only
// judges when the ONE producer (`domain/chat/engine/pipeline.ts`) is loaded.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

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

const GATE_SELF = "scripts/check/gates/content-part-seam.ts";
/** Real-tree anchor (gate-hub #11): the DECLARATION home of the symbol. Loaded on every real run; a
 *  conformance mini-project only has it when an example materializes it on purpose. */
const ANCHOR = "packages/contracts/src/chat/bus.ts";
const STALE_PREFIX =
  "stale SANCTIONED seam pattern — it matches NO file in the project (ratchet down): a seam member that " +
  "moved or died leaves a HOLE in the scan (every file the pattern covers silently stops being checked). " +
  "Re-point it at the member's new home, or delete the row: ";

const MESSAGE =
  "`ChatContentPart` is imported outside the D51 seam set (the engine producer `domain/chat/engine/" +
  "pipeline.ts` · the request DTO `domain/chat/contract/results.ts` · the infra/providers consumers · the " +
  "@orb/contracts/chat home) — content-parts are produced ONCE at the engine request seam and everything " +
  "upstream stays `content: string`. See Core-Path-Registry.md D51.";
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
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    const paths = ctx.project.getSourceFiles().map((sf) => sf.getFilePath() as string);
    for (const re of SANCTIONED) {
      if (!paths.some((p) => re.test(p))) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}${re.source} — the SANCTIONED table lives in scripts/check/gates/content-part-seam.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type T = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/verbs/assemble.ts",
      why: "an upstream verb importing ChatContentPart — reaching for parts before the engine seam (D51)",
    },
    {
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
      },
      expect: { count: 3, messageIncludes: "stale SANCTIONED seam pattern" },
      why: "THE STALE ARM: the anchor (the symbol's declaration home) is loaded, so the seam set is judged — the three patterns naming homes no file matches (infra/providers, pipeline.ts, contract/results.ts) each ratchet down; the contracts pattern matches the anchor itself and stays",
    },
  ],
  mustPass: [
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/infra/providers/backends/kit/map.ts",
      why: "the infra/providers consumer is a sanctioned seam member — the sealed runner maps parts to wire",
    },
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/engine/pipeline.ts",
      why: "the engine request seam (pipeline.ts) is the ONE sanctioned producer of parts (D51)",
    },
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/contract/results.ts",
      why: "the request DTO (contract/results.ts) is the sanctioned member the seam populates",
    },
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/contracts/src/chat/index.ts",
      why: "the contracts home declares the symbol — a sanctioned seam member",
    },
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "tests/contracts/chat/index.test-d.ts",
      why: "the centralized tests/ mirror (not prod src) legitimately imports the contract type to test it — exempt",
    },
    {
      files: {
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
      },
      why: "THE ANCHOR GUARD: a project without the symbol's declaration home is not the real tree — the stale arm stays silent instead of 'proving' all four seam members vanished",
    },
  ],
};
