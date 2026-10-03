// domain/chat — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Two kinds, both corpus sweeps over chat's
// canon: `memory-backfill` (the memory subsystem's segment/digest rebuild) and `group-character-backfill`
// (D38 — mint the synthetic group character for every multi-character room that lacks one).
//
// The ops are the SAME chat-ctx-bound sweeps compose already built; only their home changed. The one
// cross-domain reach — the memory scope's `embed_space_state` completion — is an INJECTED op at chat's door
// (`purgeMemoryVectors`), which is exactly what
// the retired hub existed to avoid building. That op ENUMERATES the scope it is handed (#2517), so the
// bulk/singular distinction is a fan-out property of the op and not a fence on calling it.
//
// A memory sweep with ANY per-chat failure is a FAILED workload (#165): the tally throws rather than
// returns, and the completion is suppressed on the same condition — an incomplete sweep neither succeeded nor
// re-derived the corpus into the active embed space.

import type { BackfillPassResult, MemoryBackfillResult, MemoryBackfillWorkloadParams } from "@orb/contracts/chat";
import { memoryBackfillWorkloadParams } from "@orb/contracts/chat";
import { DEFAULT_ADMISSION_KEY, emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { ChatWorkloadDeps } from "./contract/workloads.ts";
import { MEMORY_SWEEP_STEPS } from "./contract/workloads.ts";

type ChatContributions = readonly [WorkloadContribution<"memory-backfill">, WorkloadContribution<"group-character-backfill">];

/** The memory sweep's admission unit. A whole-corpus run keeps the shared bucket, so an import's scoped run or
 *  its free segment pass never holds the slot a whole sweep (a model-change reindex) needs. Each import span is
 *  its own unit, and its segment pass and its digest build are two.
 *
 *  Distinct units only ADMIT side by side; they do not RUN side by side. Every memory-backfill rides the `sweep`
 *  lane, which dispatches one row at a time (`DEFAULT_LANE_CONCURRENCY`, transport/jobs/workloads-worker.ts), so a
 *  later run sees the earlier run's stored digests and skips them. That serial lane is the guard against paying
 *  twice for one block's summary: the hash-gated upserts keep the rows correct, but two runs overlapping on a chat
 *  would each call the Utility model before either stored. */
function memoryAdmissionKey(params: MemoryBackfillWorkloadParams): string {
  const pass = params.segmentsOnly === true ? "segments" : "memory";
  if (params.importWindow === undefined) {
    return params.segmentsOnly === true ? pass : DEFAULT_ADMISSION_KEY;
  }
  return `${pass}:${String(params.importWindow.from)}-${String(params.importWindow.to)}`;
}

export function createChatWorkloadContributions(deps: ChatWorkloadDeps): ChatContributions {
  return [
    {
      kind: "memory-backfill",
      params: memoryBackfillWorkloadParams,
      // ADMISSION, not execution (#156): with memory disabled the sweep skips this host's chats entirely
      // (the D293 opt-out, honored on the corpus sweep since #54), so the run can only ever land
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
      admissionKey: memoryAdmissionKey,
      // A segments-only pass embeds and never summarizes, so it costs no Utility-model call.
      modelCalls: async ({ ownerId, funderUserId, params }) =>
        params.segmentsOnly === true ? 0 : await deps.estimateMemoryBackfill({ ownerId, funderUserId, importWindow: params.importWindow ?? null }),
      // Segment + digest LLM builds per chat × scope bucket — long by construction.
      lane: "sweep",
      // Hash-diff self-healing end to end; the signal aborts cooperatively between chats and at an embed's model wait.
      resume: "idempotent-restart",
      run: async (ctx, params, report, signal): Promise<MemoryBackfillResult> => {
        report({ message: "memory backfill: sweeping chats (segments + digests per scope)" });
        const importWindow = params.importWindow ?? null;
        const segmentsOnly = params.segmentsOnly === true;
        const counts = await deps.backfillMemory({
          ownerId: ctx.ownerId,
          funderUserId: ctx.userId,
          importWindow,
          segmentsOnly,
          signal,
          onProgress: (step) => {
            const current = MEMORY_SWEEP_STEPS.indexOf(step) + 1;
            report({ message: `Rebuilding chat memory — step ${current} of ${MEMORY_SWEEP_STEPS.length}: ${step}`, current, total: MEMORY_SWEEP_STEPS.length });
          },
        });
        report({
          message:
            `memory backfill: ${counts.segments.scanned} chats (${counts.segments.changed} segments), ${counts.digests.scanned} scope buckets (${counts.digests.changed} digests)` +
            `${counts.segmentsSkippedOverWindow > 0 ? `, ${counts.segmentsSkippedOverWindow} blocks TOO LARGE EVEN TO CHUNK for the embed model (skipped whole, NOT truncated — see the warn log)` : ""}` +
            `${counts.failed > 0 ? `, ${counts.failed} chats FAILED (skipped — see error log)` : ""}`,
        });
        // THE SWEEP'S TERMINAL — record `embed_space_state`'s `memory` completion for the scope this run
        // actually covered; the promotion lands once cards, memory and documents all name the same target
        // generation. The old generation's rows were deleted when the target moved
        // (`embeddings/persistence/space-state.ts switchTargetGeneration`). The op enumerates the scope it is
        // handed, so a singular run reaches only its own owner (`enumerationScope` is the WORKLOAD ROW's scope,
        // not a chat owner — chats stay membership-scoped, D18).
        const enumerationScope = ctx.ownerId;
        // A sweep that skipped chats or was cancelled did not re-derive the corpus (#165), so it may not claim
        // the scope; the new index stays partial and the rerun completes it.
        //
        // An IMPORT-SCOPED run or a SEGMENTS-ONLY pass never reaches the terminal: it re-derived only part of the
        // owner's memory, so it may not claim the owner's memory space complete, and the op's vacuous receipt
        // would claim exactly that.
        if (importWindow === null && !segmentsOnly && !signal.aborted && counts.failed === 0) {
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
