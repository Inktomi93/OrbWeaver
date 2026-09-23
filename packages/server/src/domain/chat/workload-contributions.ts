// domain/chat — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Two kinds, both corpus sweeps over chat's
// canon: `memory-backfill` (the memory subsystem's segment/digest rebuild) and `group-character-backfill`
// (D38 — mint the synthetic group character for every multi-character room that lacks one).
//
// The ops are the SAME chat-ctx-bound sweeps compose already built; only their home changed. The one
// cross-domain reach — the memory scope's `embed_space_state` completion plus the
// old-embed-space reclaim — is an INJECTED op at chat's door (`purgeMemoryVectors`), which is exactly what
// the retired hub existed to avoid building. That op ENUMERATES the scope it is handed (#2517), so the
// bulk/singular distinction is a fan-out property of the op and not a fence on calling it.
//
// A memory sweep with ANY per-chat failure is a FAILED workload (#165): the tally throws rather than
// returns, and the reclaim is suppressed on the same condition — an incomplete sweep neither succeeded nor
// re-derived the corpus into the active embed space.

import type { BackfillPassResult, MemoryBackfillResult } from "@orb/contracts/chat";
import { emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { ChatWorkloadDeps } from "./contract/workloads.ts";

type ChatContributions = readonly [WorkloadContribution<"memory-backfill">, WorkloadContribution<"group-character-backfill">];

export function createChatWorkloadContributions(deps: ChatWorkloadDeps): ChatContributions {
  return [
    {
      kind: "memory-backfill",
      params: emptyWorkloadParams,
      // ADMISSION, not execution (#156): with memory disabled the sweep skips this host's chats entirely
      // (the D36 opt-out, honored on the corpus sweep since #54), so the run can only ever land
      // "0 segments · 0 digests" as a SUCCESS — owner-observed after an ST import auto-enqueued one. A job
      // that structurally cannot produce anything is refused at the enqueue door instead.
      // A BULK pass sweeps EVERY host, so it is admitted regardless: one host's opt-out says nothing about
      // the box, and the per-host skip is the right instrument there. (`enumerationScope` — the WORKLOAD
      // ROW's scope, not a chat owner; chats stay membership-scoped, D18. Same rename as `run` below.)
      admit: async ({ ownerId: enumerationScope }): Promise<string | null> => {
        if (enumerationScope === null || (await deps.isMemoryEnabled(enumerationScope))) {
          return null;
        }
        return "Memory is turned off, so there is nothing to back fill — enable Memory in Settings, then run this again.";
      },
      // Segment + digest LLM builds per chat × scope bucket — long by construction.
      lane: "sweep",
      // Hash-diff self-healing end to end; the signal aborts cooperatively between chats.
      resume: "idempotent-restart",
      run: async (ctx, _params, report, signal): Promise<MemoryBackfillResult> => {
        report({ message: "memory backfill: sweeping chats (segments + digests per scope)" });
        const counts = await deps.backfillMemory({ ownerId: ctx.ownerId, funderUserId: ctx.userId, signal });
        report({
          message:
            `memory backfill: ${counts.segments.scanned} chats (${counts.segments.changed} segments), ${counts.digests.scanned} scope buckets (${counts.digests.changed} digests)` +
            `${counts.segmentsSkippedOverWindow > 0 ? `, ${counts.segmentsSkippedOverWindow} blocks TOO LARGE EVEN TO CHUNK for the embed model (skipped whole, NOT truncated — see the warn log)` : ""}` +
            `${counts.failed > 0 ? `, ${counts.failed} chats FAILED (skipped — see error log)` : ""}`,
        });
        // THE SWEEP'S TERMINAL — record `embed_space_state`'s `memory` completion for the scope this run
        // actually covered, and reclaim the rows stranded in any OTHER embed space once cards,
        // memory and documents all name the same target generation.
        //
        // #2517 — THE RULING SURVIVES, ITS INPUT CHANGED. This was BULK-ONLY, on the reasoning that "a model
        // change is a box-level event, so a singular per-owner catch-up must not delete the global old
        // space". That is an argument about the cross-owner FAN-OUT, and it had the COMPLETION welded to it:
        // memory (like documents) therefore recorded a completion ONLY from the all-owners arm, while cards
        // had always recorded one per owner (`embed-corpus.ts completeCardSweep`). An owner who caught up
        // their own corpus was left with a `cards`-only ledger and `readGeneration` reporting `moving`
        // forever over a corpus that was entirely at rest. The fan-out fence is now where it belongs — INSIDE
        // the injected op, which enumerates the scope it is handed — so a singular run still cannot reach a
        // neighbour, and can finally record its own truth. (`enumerationScope` is the WORKLOAD ROW's scope,
        // not a chat owner — chats stay membership-scoped, D18.)        //
        // WHAT DID *NOT* CHANGE, since a loosened conditional is exactly what a future reader will doubt:
        // the RECLAIM's blast radius. It is not fenced here and never was — `markGenerationComplete` writes
        // this scope's CANDIDATE row and promotes NOTHING until cards, memory AND documents all name the
        // same `(generation, epoch)`, and every DELETE it then runs derives its row set from THIS owner's
        // characters / hosted chats / documents (`persistence/space-state.ts retiredVectorStatements`). So a
        // per-owner run reclaims exactly that owner's own old space — which is the SAME guarantee
        // `embed-corpus.ts`'s per-owner card purge has always relied on ("a bulk pass covers every
        // owner, a singular pass exactly one, and neither can reach a neighbour's live space"). The "global
        // old space" the fence was written against is reachable only through the op's cross-owner FAN-OUT,
        // and that fan-out is still decided by the enumeration scope alone.
        const enumerationScope = ctx.ownerId;
        // The abort + failure fences do NOT move (#165): a sweep that skipped chats or was cancelled did not
        // re-derive the corpus into the active embed space, so it may neither claim the scope nor reclaim the
        // old one — the space stays a strict superset (never a gap) and the rerun completes it.
        if (!signal.aborted && counts.failed === 0) {
          await deps.purgeMemoryVectors(counts.completedSpaces, enumerationScope);
        }
        // HONEST ACCOUNTING (#165, the #156 family): a per-chat skip is a chat whose memory silently did not
        // build. Returning the tally landed `succeeded` on a run that skipped every chat it touched, so the
        // tally now FAILS the row — the sweep is `idempotent-restart`, so everything durable already landed
        // and the rerun resumes from it. Zero failures is still the only success.
        if (counts.failed > 0) {
          // THE SENTENCE IS READ BY A PERSON, in a row and on the corpus rail (side-eye corpus re-pass C4).
          // It shipped as "1 chat FAILED during the sweep and were skipped" — a number/verb disagreement on
          // the singular arm, a shout the surrounding copy never uses, and one ~99-char line. Two short
          // sentences, agreeing with their own count, saying the same two facts.
          const skipped = counts.failed === 1 ? "1 chat failed and was skipped" : `${counts.failed} chats failed and were skipped`;
          throw new Error(
            `Memory backfill: ${skipped} — see the error log for each cause. ` +
              `${counts.segments.changed} segments and ${counts.digests.changed} digests did build.`,
          );
        }
        return {
          segments: counts.segments,
          segmentsSkippedOverWindow: counts.segmentsSkippedOverWindow,
          digests: counts.digests,
          failed: counts.failed,
        };
      },
    },
    {
      kind: "group-character-backfill",
      params: emptyWorkloadParams,
      // A fast idempotent sweep (find-first short-circuit per room); owner = the room HOST (D19).
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, _params, report, signal): Promise<BackfillPassResult> => {
        report({ message: "group-character backfill: sweeping group rooms" });
        const counts = await deps.backfillGroupCharacters({ ownerId: ctx.ownerId, funderUserId: ctx.userId, signal });
        report({ message: `group-character backfill: ${counts.scanned} group rooms scanned, ${counts.changed} minted` });
        return counts;
      },
    },
  ];
}
