// domain/chat/memory/recall/recall — the `{{memory}}` recall POLICY (chat.md §3b / §11). Memory owns the
// MODE switch + the scope/window/lens/assembly; the cosine scan is DELEGATED to `ctx.searchDigests` (memory
// holds NO cosine). The 5 modes (§11 #1):
//   • off    → "" (D36 global disable).
//   • mixA   → all this bucket's tier-0 digests, chronological. PURE ASSEMBLY (no search call).
//   • mixB   → vector retrieve (search.digests, mode=mixB).
//   • mixC   → vector retrieve + rerank (search.digests, mode=mixC).
//   • tiered → the consolidation bridge (uncovered-digests-only). PURE ASSEMBLY (no search call — `bridge.ts`).
// EGOCENTRIC-ONLY (#4 / §4): recall reads the active speaker's bucket (`scope.scopedCharacterId`, a real
// `CharacterId` — inv 8); solo/merged/narrator read the synthetic group-as-character bucket. The PROTECTED TIP
// is never surfaced — digests only exist for aged-out blocks (#3). NO ownerId (D20). Group-ness is the `scope`,
// not a branch. The candidate POOL for mixB/mixC is the §5 BRIDGE (uncovered-multi-tier), not the flat scoped
// pool (§3b: "the bridge is the pool for every retrieval mode"); memory passes the bridge keys as
// `MemoryQueryOptions.candidates` so the injected scan scores only those.
//
// FLAG[mode-switch-recall]: the §4 mode-switch recall (shared bucket ∪ the speaker's own per-character bucket,
// witnessing-filtered by the join/leave horizon) is NOT done here — it needs the turn engine to supply BOTH
// the speaker's id AND the synthetic group-char id, plus a `chat_participants` joinSeq/leftSeq read memory's
// persistence does not expose. `MemoryScope` is a single bucket and `recallMemory` has no orchestrating caller
// (PD-41 inert at the runner-env). This is orchestration-tier (the chat turn engine), flagged not stubbed.

import type { BlockKey } from "@orb/contracts/search";
import type { CharacterId } from "@orb/kit/ids";
import type { ChatContext } from "../../contract/context";
import { resolveCfg } from "../constants";
import { loadDigestsForScope } from "../persistence/queries";
import type { DigestRow, MemoryConfig, MemoryScope, MsgRow } from "../types";
import { computeBridge } from "./bridge";
import { blockKeyStr, formatMemory } from "./format";
import { buildRecallQuery } from "./query";

/** What `recallMemory` needs (file-local, NON-exported — the `types-in-contract` gate; caller passes a
 *  structural literal). `recent` (oldest→newest) is the retrieval query window for mixB/mixC; `names` resolve
 *  the egocentric query text + would resolve facets if richer recall lands. */
interface RecallArgs {
  readonly scope: MemoryScope;
  readonly config?: MemoryConfig | null | undefined;
  readonly recent?: readonly MsgRow[] | undefined;
  readonly names?: ReadonlyMap<CharacterId, string> | undefined;
}

/**
 * Resolve the `{{memory}}` string for a turn (the GATHER input). Reads the scope bucket's digest facets,
 * selects the blocks per mode, and formats them. Returns `""` when memory is off, the bucket is empty, or no
 * block survives. The cosine scan (mixB/mixC) is the injected `ctx.searchDigests`; tiered/mixA are pure
 * assembly off the loaded rows.
 */
export async function recallMemory(ctx: ChatContext, args: RecallArgs): Promise<string> {
  const cfg = resolveCfg(args.config);
  if (cfg.mode === "off") {
    return "";
  }
  const { scope } = args;

  // The bucket's digests (ALL tiers) — the facet source for every mode + the bridge/mixA candidate pool.
  const all = await loadDigestsForScope(ctx.db, scope.chatId, scope.scopedCharacterId);
  if (all.length === 0) {
    return "";
  }
  const byKey = new Map<string, DigestRow>(all.map((d) => [blockKeyStr(toKey(scope, d)), d]));

  let keys: readonly BlockKey[];
  if (cfg.mode === "mixA") {
    keys = all.filter((d) => d.tier === 0).map((d) => toKey(scope, d)); // chronological
  } else if (cfg.mode === "tiered") {
    keys = computeBridge(scope, all, cfg.fanOut);
  } else {
    // mixB | mixC — the injected cosine scan (rerank is implied by mode=mixC at the search seam). The candidate
    // POOL is the §5 bridge (uncovered-multi-tier), passed as `candidates` so search scores only those (§3b).
    const query = buildRecallQuery(
      cfg,
      scope,
      args.recent ?? [],
      args.names ?? new Map<CharacterId, string>(),
    );
    keys = await ctx.searchDigests({ ...query, candidates: computeBridge(scope, all, cfg.fanOut) });
  }

  return formatMemory(keys, byKey);
}

/** A digest row → its {@link BlockKey} under the recall scope (the row's scope === the queried bucket). */
function toKey(scope: MemoryScope, d: DigestRow): BlockKey {
  return {
    chatId: scope.chatId,
    tier: d.tier,
    blockIdx: d.blockIdx,
    scopedCharacterId: d.scopedCharacterId,
  };
}
