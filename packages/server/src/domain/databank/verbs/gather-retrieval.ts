// verb: gatherRetrieval — the chat GATHER op (DB6, databank-design/07 §2/§3/§6). Retrieves the scope-active
// document context for a chat turn through the INJECTED `search.documents` lens (chat → databank → search, the
// cluster boundary: databank consumes the ONE cosine engine, never re-implements it), then fits it into the
// slot's token budget and renders the reading-order-restored chunks into the `{{databank}}` slot value.
//
// The NULL contract IS the byte-identity pin: a bankless scope, zero hits, or a budget too small for even one
// chunk all return `null` — the same empty macro resolution as an op-absent deploy, so the assembled request
// byte-equals the non-databank build. Scope resolves ONCE inside `search.documents` (the empty-allowlist
// short-circuit does zero embed work on a bankless chat), so there is no pre-check here.

import type { DocumentId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import type { DocumentChunkHit } from "#domain/search";
import type { DatabankGatherParams } from "../contract/params";
import type { DatabankGatherResult } from "../contract/results";
import type { DatabankContext, DatabankService } from "../contract/service";

/** An id-only provenance ref for a kept chunk (never re-rendered into the prompt). */
interface KeptRef {
  readonly documentId: DocumentId;
  readonly chunkIdx: number;
  readonly score: number;
}

/** Fit + render in ONE reading-order pass (§3 + §6). Renders per §3 — within a document chunks joined `\n`,
 *  documents separated `\n\n`, each block headed by `# {documentName}` — while charging each chunk's
 *  INCREMENTAL rendered cost (its header + separators when it starts a new document) against the budget. The
 *  first chunk whose addition would push the FULL rendered text past the budget stops the walk; everything
 *  after drops (whole chunks only — the lowest-best-score document's tail first, never a mid-chunk cut). The
 *  budget is checked on the growing rendered string, so `estimateTokens(text) <= tokenBudget` holds exactly.
 *  The wrapper prose ("Related information:") belongs to the PRESET section around the slot, not here. */
function fitAndRender(hits: readonly DocumentChunkHit[], tokenBudget: number): { text: string; kept: KeptRef[] } {
  let text = "";
  let currentDoc: DocumentId | null = null;
  const kept: KeptRef[] = [];
  for (const hit of hits) {
    const isNewDoc = hit.documentId !== currentDoc;
    const piece = isNewDoc ? `${text.length > 0 ? "\n\n" : ""}# ${hit.documentName}\n${hit.content}` : `\n${hit.content}`;
    const candidate = text + piece;
    if (estimateTokens(candidate) > tokenBudget) {
      break;
    }
    text = candidate;
    currentDoc = hit.documentId;
    kept.push({ documentId: hit.documentId, chunkIdx: hit.chunkIdx, score: hit.score });
  }
  return { text, kept };
}

export function createGatherRetrieval(ctx: DatabankContext): DatabankService["gatherRetrieval"] {
  return async (params: DatabankGatherParams): Promise<DatabankGatherResult | null> => {
    // The retrieval params (k/minScore/rerank) ride the params from chat's ForeignInputs (the host's
    // `UserSettings.databank.retrieval`). Each is passed to `search.documents` only when supplied; an absent
    // value falls to search's own default, which IS the databank default — so a caller not threading them is
    // byte-identical to pre-wire (databank-design/05 §3.7).
    const hits = await ctx.searchDocuments({
      scope: { chatId: params.chatId },
      queryText: params.queryText,
      ...(params.k !== undefined ? { k: params.k } : {}),
      ...(params.minScore !== undefined ? { minScore: params.minScore } : {}),
      ...(params.rerank !== undefined ? { rerank: params.rerank } : {}),
    });
    if (hits.length === 0) {
      return null;
    }
    const { text, kept } = fitAndRender(hits, params.tokenBudget);
    if (kept.length === 0) {
      return null; // the budget could not seat even the best chunk — a no-op, byte-identical to absent.
    }
    return { text, hits: kept, tokensEstimated: estimateTokens(text) };
  };
}
