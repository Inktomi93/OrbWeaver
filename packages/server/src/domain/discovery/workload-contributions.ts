// domain/discovery — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Five kinds: the library-semantics passes.
//
// Everything a run needs is a dep of THIS factory, closed over at `entry/compose` — never a shared
// per-dispatch env hub. The projections from each verb's richer stats down to the wire `AnalyticsResult`
// live here too (they used to sit at the entry tier, in `compose/runner-env.ts`), as does the tunable
// PRECEDENCE (per-run param → the triggering user's `UserSettings.workloads` knob → the domain's own floor).
//
// EVERY PASS ANNOUNCES ITSELF ONCE, AT ITS TERMINAL (event-bus coverage survey §2.5/§3.4-4/F6, the #23
// import-terminal shape): one `corpusRecomputed` per owner in scope, from a `finally` — see `announceCorpus`.
// This is the ONE home for all five fans because it is the one place all five passes end; the pass internals
// stay ignorant of the bus, exactly as they are ignorant of the queue.
//
// WHY IT IS NEEDED AT ALL: these writers are WORKLOADS, so there is no mutation for a client to hang an
// `invalidates` on — not even the tab that started the run. The 27 `discovery.*` + `search.similarArt`
// STATIC citations in `tooling/src/verify/gates/query-freshness-coverage.ts` documented exactly this, and their
// own prose said a seam row "becomes POSSIBLE only once a corpus-recompute event exists (then these entries
// go stale-RED and get deleted, which is the point)". This is that event.

import type { AnalyticsResult } from "@orb/contracts/discovery";
import { computeThemesWorkloadParams, findDuplicatesWorkloadParams } from "@orb/contracts/discovery";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import { emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { DistillStats } from "./contract/results.ts";
import type { DiscoveryWorkloadDeps } from "./contract/service.ts";

/** The cluster count when neither the run nor the triggering user's settings supply a `k`. */
const DEFAULT_THEME_K = 12;

/** The distill sweep's closing progress line — what landed, and what it declined to invent. `skipped` cards
 *  are name-only (no description / personality / scenario / greeting / examples), so the line names the fix
 *  rather than reporting a bare number the user can't act on. */
function distillProgressMessage(stats: DistillStats): string {
  const landed = `distilled ${stats.distilled} of ${stats.scanned} characters`;
  return stats.skipped === 0 ? landed : `${landed} — skipped ${stats.skipped} with no card text to summarize (add a description first)`;
}

/**
 * THE TERMINAL FAN — ONE `corpusRecomputed` per owner in scope, at the END of a pass, never per row.
 *
 * SCOPED run (`ctx.ownerId` is a UserId): exactly that owner. BULK run (`ownerId: null`, the scheduler's
 * box-wide arm): every owner with corpus rows, via the injected enumerator — a user-bus event reaches exactly
 * one user's channel, so a single fan on a cross-owner pass would leave everyone but one frozen. The
 * enumerator is deliberately over-inclusive and its home states why (`persistence/embed-store-reads`
 * `distinctCorpusOwners`): an unaffected owner pays one refetch, an unannounced owner stays frozen until
 * gcTime — and only one of those is a defect.
 *
 * Called from a `finally` so a CANCELLED or FAILED pass still announces what it already wrote (every one of
 * these passes writes incrementally and none of them rolls back).
 */
async function announceCorpus(deps: DiscoveryWorkloadDeps, ctx: WorkloadRunContext): Promise<void> {
  const owners = ctx.ownerId === null ? await deps.listCorpusOwners() : [ctx.ownerId];
  for (const owner of owners) {
    deps.emitUserEvent(owner, { type: "corpusRecomputed" });
  }
}

type DiscoveryContributions = readonly [
  WorkloadContribution<"compute-themes">,
  WorkloadContribution<"distill-characters">,
  WorkloadContribution<"compute-cooccurrence">,
  WorkloadContribution<"find-duplicates">,
  WorkloadContribution<"csls">,
];

export function createDiscoveryWorkloadContributions(deps: DiscoveryWorkloadDeps): DiscoveryContributions {
  return [
    {
      kind: "compute-themes",
      params: computeThemesWorkloadParams,
      // Seconds-to-tens-of-seconds k-means over the digests — a bulk pass, not a user-facing wait.
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, params, report, _signal): Promise<AnalyticsResult> => {
        try {
          // Precedence: explicit per-run param, then the triggering user's knob, then the domain floor.
          const settings = await deps.loadUserSettings(ctx.userId);
          const k = params.k ?? settings.workloads.computeThemesK ?? DEFAULT_THEME_K;
          report({ message: `computing ${k} themes` });
          const stats = await deps.discovery.computeThemes({ k, ownerId: ctx.ownerId, funderUserId: ctx.userId });
          // THE INPUT PLANE IS MEMORY DIGESTS, NOT DISTILLED CARDS — and a digest-less run must SAY so
          // (issue #166). It used to return a bare `{scanned: 0, written: 0}`, which the runs console renders
          // as "0 rows · 0 written" under a green Succeeded: a pass that could not run reported as one that
          // ran. The reason rides the RESULT, not a progress line, because the progress line is gone the
          // moment the row terminals and the durable answer is what a user comes back to.
          if (stats.digestsRead === 0) {
            report({ message: "no memory digests to cluster — run the memory backfill first" });
            return { scanned: 0, written: 0, emptyReason: "no-digests" };
          }
          // THE SAME REFUSAL, ONE PLANE IN (issue #558). The pass clusters SOLO digests; a corpus whose
          // digests are all group-room ones has a non-zero `digestsRead` and still nothing to cluster, which
          // fell straight through to `{scanned: 0, written: 0}` — the very green nothing #166 exists to kill.
          // It gets its OWN reason because the fix differs: the backfill already ran, so re-running it does
          // nothing.
          if (stats.soloDigestsRead === 0) {
            report({ message: "only group-room digests to cluster — story themes come from solo chats" });
            return { scanned: 0, written: 0, emptyReason: "no-solo-digests" };
          }
          return { scanned: stats.digestsAssigned, written: stats.clustersWritten };
        } finally {
          await announceCorpus(deps, ctx);
        }
      },
    },
    {
      kind: "distill-characters",
      params: emptyWorkloadParams,
      // One LLM call per character — long by construction.
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, _params, report, signal): Promise<AnalyticsResult> => {
        try {
          report({ message: "distilling character summaries" });
          const stats = await deps.discovery.distillCharacters({
            funderUserId: ctx.userId,
            signal,
            ...(ctx.ownerId !== null ? { ownerId: ctx.ownerId } : {}),
            // N-of-M (issue #166 rider 3) — the pass counts the cards, this turns each position into a row.
            onProgress: (done, total) => {
              report({ message: `distilling character summaries — ${done} of ${total}`, current: done, total });
            },
          });
          // `AnalyticsResult` carries scanned/written only, so the SKIPPED cards (name-only — nothing to
          // summarize but a name) would vanish between `scanned` and `written` with no account of themselves.
          // The final progress line is their reader: it says what the sweep declined to invent, and names the
          // fix. A count nobody can read is the same silence the on-demand refusal exists to end.
          report({ message: distillProgressMessage(stats) });
          // An EMPTY LIBRARY is not a zero-change distill (issue #166's honest-accounting family): nothing was
          // scanned because there is nothing to scan, and the result says which.
          return stats.scanned === 0 ? { scanned: 0, written: 0, emptyReason: "no-cards" } : { scanned: stats.scanned, written: stats.distilled };
        } finally {
          await announceCorpus(deps, ctx);
        }
      },
    },
    {
      kind: "compute-cooccurrence",
      params: emptyWorkloadParams,
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, _params, report, signal): Promise<AnalyticsResult> => {
        try {
          // maxPairs/hubFraction follow the compute-themes precedence; absent ⇒ discovery's own floors.
          const { workloads } = await deps.loadUserSettings(ctx.userId);
          report({ message: "computing keyword cooccurrence" });
          const stats = await deps.discovery.computeCooccurrence({
            signal,
            // THE OWNER BELT (#1397), forwarded exactly as compute-themes/find-duplicates/csls do. An ABSENT
            // owner is `computeCooccurrence`'s documented ALL-OWNERS mode: it drops the host predicate from
            // `readOwnedDigestKeywords` and then DELETE-and-REINSERTs `keyword_cooccurrence` +
            // `character_keyword_profiles` per owner found. Omitting it here made a per-user SCOPED run read
            // every tenant's digests and destructively recompute every tenant's derived rows. A BULK row
            // (`ctx.ownerId === null`) still reaches that mode — on purpose, which is the only way it should.
            ownerId: ctx.ownerId,
            ...(workloads.maxPairs !== undefined ? { maxPairs: workloads.maxPairs } : {}),
            ...(workloads.hubFraction !== undefined ? { hubFraction: workloads.hubFraction } : {}),
          });
          // SAME INPUT PLANE AS compute-themes — tier-0 memory digests — so the same refusal (issue #558).
          // Without it a digest-less corpus reported "0 rows · 0 written" under a green Succeeded, and the
          // keyword panels sat empty with nothing on the row saying which pass was missing.
          if (stats.digestsRead === 0) {
            report({ message: "no memory digests to tally — run the memory backfill first" });
            return { scanned: 0, written: 0, emptyReason: "no-digests" };
          }
          // AND THE SAME SECOND REFUSAL compute-themes carries: the tally credits keywords to the digest's
          // witnessing character, and a group-room digest is scoped to the synthetic group bucket, so it is
          // dropped. A group-rooms-only corpus therefore reads digests and writes nothing — a different
          // failure with a different fix (the backfill already ran), so it says so instead of going green.
          if (stats.soloDigestsRead === 0) {
            report({ message: "only group-room digests to tally — keyword profiles come from solo chats" });
            return { scanned: 0, written: 0, emptyReason: "no-solo-digests" };
          }
          return { scanned: stats.charKeywordsWritten, written: stats.pairsWritten };
        } finally {
          await announceCorpus(deps, ctx);
        }
      },
    },
    {
      kind: "find-duplicates",
      params: findDuplicatesWorkloadParams,
      lane: "sweep",
      resume: "idempotent-restart",
      // Both dedup arms run in the one pass; counts are summed. The user/param `threshold` is a raw-COSINE
      // floor — it drives the CHARACTER arm only. The chat arm is Jaccard of segment content-hash sets (a
      // set-overlap fraction, not a cosine), an incompatible scale, so it keeps its own floor internally.
      run: async (ctx, params, report, _signal): Promise<AnalyticsResult> => {
        try {
          const settings = await deps.loadUserSettings(ctx.userId);
          const threshold = params.threshold ?? settings.workloads.dupThreshold;
          report({ message: "finding duplicate pairs" });
          const [chars, chatPairs] = await Promise.all([
            deps.discovery.computeDuplicatePairs({ ownerId: ctx.ownerId, ...(threshold !== undefined ? { threshold } : {}) }),
            deps.discovery.computeChatDuplicatePairs({ ownerId: ctx.ownerId }),
          ]);
          const scanned = chars.charactersScanned + chatPairs.chatsScanned;
          // THE EMBEDDINGS PLANE, SAME HONESTY (issue #561). Both arms read what the INDEX pass writes — card
          // vectors and chat segment hashes — so a never-indexed corpus reported "0 rows · 0 written" under a
          // green Succeeded, with nothing on the row naming the job that would fill it. The refusal keys on
          // BOTH arms reading nothing: a populated plane that yields no pairs is a real answer ("you have no
          // near-duplicates"), and calling THAT a refusal would send the user to a job that changes nothing.
          if (scanned === 0) {
            report({ message: "nothing embedded to compare — run the embeddings index first" });
            return { scanned: 0, written: 0, emptyReason: "no-embeddings" };
          }
          return {
            scanned,
            written: chars.pairsWritten + chatPairs.pairsWritten,
          };
        } finally {
          await announceCorpus(deps, ctx);
        }
      },
    },
    {
      kind: "csls",
      params: emptyWorkloadParams,
      lane: "sweep",
      resume: "idempotent-restart",
      // discovery COMPUTES the CSLS hub scores then writes them back through `embeddings.writeHubScores`
      // (the column owner) internally — one op, and the queue never touches the embeddings rows.
      run: async (ctx, _params, report, _signal): Promise<AnalyticsResult> => {
        try {
          report({ message: "computing hub scores (CSLS)" });
          const stats = await deps.discovery.computeCharacterHubScores({ ownerId: ctx.ownerId });
          // `rowsScored` IS the read census (every vector the pass loads gets exactly one hub update), so zero
          // means the character-embedding table was empty — never that the calibration found nothing to say.
          // Rendered as "0 rows · 0 written" the two were the same sentence (issue #561).
          if (stats.rowsScored === 0) {
            report({ message: "no character embeddings to score — run the embeddings index first" });
            return { scanned: 0, written: 0, emptyReason: "no-embeddings" };
          }
          return { scanned: stats.rowsScored, written: stats.rowsScored };
        } finally {
          await announceCorpus(deps, ctx);
        }
      },
    },
  ];
}
