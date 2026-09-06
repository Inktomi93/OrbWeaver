// Gate: content-part-seam (D51 — the multimodal content-part shape is threaded at the engine WIRE SEAM,
// content stays a `string` everywhere upstream). `ChatContentPart` is produced exactly once (at
// domain/chat/substrate/wire-history.ts, the CONVERT step both the turn pipeline and the read verb's
// previews call — it moved out of engine/pipeline.ts at #1540 so the previews price the same converted rows
// the turn fits) and consumed only by infra/providers/** (the sealed runners). Everything else stays
// `content: string`. Enforced as a sanctioned-importer allowlist on the symbol: a `ChatContentPart` import
// from a file outside the seam set is RED.
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the seam members are SCANNED and exempted by cited
// rows, not scoped out of scanRoot — an excluded member that moves takes its exemption with it AND leaves a
// hole in the scan (every file the pattern covered silently stops being checked).
//
// TWO-SIDED (gate-hub #10): a row resolving to NO file is RED, through the ONE shared rename tripwire
// (lib/sanctioned-home.ts) rather than a hand-rolled sweep. It self-guards on a REAL-TREE ANCHOR
// (gate-hub #11) that sits OUTSIDE every row — this gate's own declaration-home anchor lives INSIDE the
// contracts row, so guarding on it would let a dead home take its own tripwire down with it.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const SYMBOL = "ChatContentPart";
const CONTRACTS_CHAT = /^@orb\/contracts\/chat(?:\/|$)/u;
// Production source only — the seam rule governs the runtime dependency graph; the centralized `tests/`
// mirror legitimately imports the contract type to test it.
const PROD_SRC = /\/packages\/[^/]+\/src\//u;

/** Files sanctioned to import `ChatContentPart` — the seam producer + the request DTO it fills + the
 *  infra consumers + the contracts home. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/contracts/src/chat/": {
    why: "the contracts home DECLARES the symbol — the whole chat namespace, since the declaration and its barrel move together. Ends when the chat contracts move: the rename tripwire reds the row at its dead path",
  },
  "packages/server/src/infra/providers/": {
    why: "the sealed runner tier is the ONLY consumer — it maps parts onto each backend wire (D51). Same end condition",
  },
  "packages/server/src/domain/chat/substrate/wire-history.ts": {
    why: "THE one producer (D51). The CONVERT step MOVED here at #1540 — the read verb's previews must price the same converted rows the turn's fitter prices, and a pure read cannot import the turn-execution module — so the request seam's conversion lives in the engine↔verbs substrate seam that both call. Still exactly ONE producer, still string-shaped upstream. Ends when that module moves",
  },
  "packages/server/src/domain/chat/engine/pipeline.ts": {
    why: "the engine request seam ASSEMBLES the parts the producer above builds, and mints its own for the TOOL-RESULT rows (`toolResultMessages` — an assistant row of tool-call parts plus one row per result, which never pass through the history conversion). Ends when the pipeline moves",
  },
  "packages/server/src/domain/chat/contract/results.ts": {
    why: "the domain-side request DTO the seam populates (`content: ChatContentPart[]` handed to the runner). Same end condition",
  },
};

const GATE_SELF = "tooling/src/verify/gates/content-part-seam.ts";

const MESSAGE =
  "`ChatContentPart` is imported outside the D51 seam set (the CONVERT producer `domain/chat/substrate/" +
  "wire-history.ts` · the engine request seam `domain/chat/engine/pipeline.ts` · the request DTO " +
  "`domain/chat/contract/results.ts` · the infra/providers consumers · the @orb/contracts/chat home) — " +
  "content-parts are produced ONCE at the request seam's conversion and everything upstream stays " +
  "`content: string`. See Core-Path-Registry.md D51.";
/** Is this ImportSpecifier a `ChatContentPart` named import from `@orb/contracts/chat`? */
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
  fix: "keep `content: string` upstream; ChatContentPart is produced ONCE at the request seam's CONVERT step (domain/chat/substrate/wire-history.ts) and consumed only by infra/providers/**.",
  scanRoot: (p) => PROD_SRC.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, sf, ctx) => {
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (isContentPartImport(node)) {
      ctx.report(node, { token: SYMBOL, offset: 0 });
    }
  },
  finalize: (ctx) => {
    // The declaration-home ANCHOR still guards nothing here — the sweep's guard is the SHARED anchor, which
    // is outside every row (a member that dies must not be able to silence its own tripwire).
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "D51 content-part seam member" });
  },
  mustFlag: [
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type T = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/verbs/assemble.ts",
      why: "an upstream verb importing ChatContentPart — reaching for parts before the engine seam (D51)",
    },
    {
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
      },
      expect: { count: 4, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded, so the seam set is judged — the four rows naming homes no file resolves (infra/providers, substrate/wire-history.ts, engine/pipeline.ts, contract/results.ts) each ratchet down; the contracts row resolves (the declaration file itself) and stays",
    },
  ],
  mustPass: [
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/infra/providers/backends/kit/map.ts",
      why: "THE ALLOWLIST ITSELF: the infra/providers consumer is now SCANNED and passes on a cited row — the sealed runner maps parts to wire",
    },
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/substrate/wire-history.ts",
      why: "the CONVERT step (substrate/wire-history.ts) is the ONE sanctioned producer of parts (D51, #1540) — the turn and the previews both call it",
    },
    {
      files: 'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type U = ChatContentPart;\n',
      at: "packages/server/src/domain/chat/engine/pipeline.ts",
      why: "the engine request seam assembles the produced parts and mints the TOOL-RESULT rows (D51)",
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
      why: "THE ANCHOR GUARD: a project without the shared real-tree anchor is not the real tree — the tripwire stays silent instead of 'proving' all four seam members vanished",
    },
  ],
};
