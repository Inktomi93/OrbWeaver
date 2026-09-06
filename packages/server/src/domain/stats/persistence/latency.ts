// The on-read TTFT/gen percentile engine. A percentile isn't additively mergeable, so it can't ride the `+=`
// write path — it's computed here on read from canon, scoped to the entity in view (owner/character/model).
// Timing lives on `message_variants`, not `messages`; a message's latency is its selected variant's.
//
// Every scan here is husk-excluded through the domain's one owner-chat definition
// (`substrate/owner-chat-scope.ts`): `readByModel` merges these latencies onto `model_stats` ROLLUP rows,
// which the rebuild built from that same scope, so a latency computed over a wider population would print a
// number for a room the generations column denies (#1477).

import type { Db } from "@orb/db";
import { sql } from "drizzle-orm";
import type { LatencyScope } from "../contract/params.ts";
import type { LatencyStats } from "../contract/views.ts";
import { ownerChatIds } from "../substrate/owner-chat-scope.ts";
import { percentiles } from "../substrate/percentiles.ts";

// The "(unknown)" provider sentinel — coalesced at every key site so a null-provider variant matches the
// model_stats bucket.
const UNKNOWN_PROVIDER = "(unknown)";
/** Recent selected generations are the operational latency distribution; bounding the read keeps dashboard
 *  cost independent of an owner's lifetime message count. The bound is applied over whatever the read is
 *  ABOUT: `readLatency` bounds the scope it was asked for (owner / character / one model bucket), and
 *  `readModelLatencies` bounds EACH (model, provider) bucket separately — a bound taken across mixed models
 *  silently deletes the quiet ones (#1477). */
const LATENCY_SAMPLE_LIMIT = 100;

function assertNever(value: never): never {
  throw new Error(`readLatency: unhandled latency scope ${String(value)}`);
}

/** Build a `LatencyStats` from a ttft list + a gen-duration list (the on-read percentile spread). */
function statsOf(ttft: number[], gen: number[]): LatencyStats {
  const t = percentiles(ttft);
  const g = percentiles(gen);
  return {
    avgTtftMs: t.avg,
    p50TtftMs: t.p50,
    p90TtftMs: t.p90,
    avgGenMs: g.avg,
    p50GenMs: g.p50,
    p90GenMs: g.p90,
  };
}

/** TTFT + gen-duration percentiles for the entity in view, from the SELECTED variant of each owned
 *  assistant message. TTFT is `ttft_ms` (≥ 0); gen-duration is `gen_finished_at − gen_started_at` where
 *  both are present and finished ≥ started. Owner scope spans every owned character's assistant messages;
 *  character scope narrows to one character; model scope to one (model, provider) bucket. */
export async function readLatency(db: Db, ownerId: string, scope: LatencyScope): Promise<LatencyStats> {
  // Narrowing predicate per scope (owner = no extra filter). Exhaustive over `LatencyScope` — a new scope
  // kind fails tsc until its arm exists.
  let narrow = sql``;
  if (scope.kind === "character") {
    narrow = sql`AND m.character_id = ${scope.characterId}`;
  } else if (scope.kind === "model") {
    narrow = sql`AND v.model = ${scope.model} AND COALESCE(v.provider, ${UNKNOWN_PROVIDER}) = ${scope.provider ?? UNKNOWN_PROVIDER}`;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhaustiveness guard: tautological once narrowed, kept so a future LatencyScope member fails tsc here instead of silently falling through to owner-scope.
  } else if (scope.kind !== "owner") {
    assertNever(scope);
  }
  const rows = await db.all<{
    ttft: number | null;
    gs: number | null;
    gf: number | null;
  }>(sql`
    SELECT v.ttft_ms AS ttft, v.gen_started_at AS gs, v.gen_finished_at AS gf
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant'
      AND m.chat_id IN (${ownerChatIds(ownerId)}) ${narrow}
    ORDER BY m.rowid DESC
    LIMIT ${LATENCY_SAMPLE_LIMIT}
  `);

  const ttft: number[] = [];
  const gen: number[] = [];
  for (const r of rows) {
    if (r.ttft !== null && r.ttft >= 0) {
      ttft.push(r.ttft);
    }
    if (r.gs !== null && r.gf !== null && r.gf >= r.gs) {
      gen.push(r.gf - r.gs);
    }
  }
  return statsOf(ttft, gen);
}

/** Stable Map key for a (model, provider) latency bucket. */
export function modelLatencyKey(model: string, provider: string): string {
  return `${model} ${provider}`;
}

/** Per-(model, provider) latency in one owner-scoped scan: one scan, bucketed in JS, percentiles per bucket
 *  — O(N) instead of a scan per model. Returns a Map keyed by `modelLatencyKey`.
 *
 *  THE SAMPLE BOUND IS PER BUCKET, not global (#1477). A single `ORDER BY rowid DESC LIMIT 100` across every
 *  model mixed meant a model with few recent generations could be crowded out of the window entirely and
 *  vanish from this map — while `readByModel` (persistence/rollups.ts) still rendered a latency column for
 *  its rollup row, printing "—" for a model that has perfectly good timings. A `row_number()` window
 *  partitioned by the SAME `(model, COALESCE(provider))` key the JS buckets use gives each bucket its own
 *  newest-N, so every model that generated at all reports its own recent distribution. Dropping the global
 *  LIMIT costs one owner-scoped scan of assistant selected variants — the same scan `readByModel` already
 *  pays unbounded for its distinct-character "reach" GROUP BY, so this adds no new asymptotic cost to the
 *  one read that calls it. */
export async function readModelLatencies(db: Db, ownerId: string): Promise<Map<string, LatencyStats>> {
  const rows = await db.all<{
    model: string;
    provider: string | null;
    ttft: number | null;
    gs: number | null;
    gf: number | null;
  }>(sql`
    SELECT model, provider, ttft, gs, gf FROM (
      SELECT v.model AS model, v.provider AS provider, v.ttft_ms AS ttft,
             v.gen_started_at AS gs, v.gen_finished_at AS gf,
             row_number() OVER (
               PARTITION BY v.model, COALESCE(v.provider, ${UNKNOWN_PROVIDER})
               ORDER BY m.rowid DESC
             ) AS rn
      FROM messages m
      JOIN characters c ON c.id = m.character_id
      JOIN message_variants v ON v.id = m.selected_variant_id
      WHERE c.owner_id = ${ownerId} AND m.role = 'assistant' AND v.model IS NOT NULL
        AND m.chat_id IN (${ownerChatIds(ownerId)})
    )
    WHERE rn <= ${LATENCY_SAMPLE_LIMIT}
  `);
  // @orb-gate-ignore persistence-no-in-memory-state: query-local accumulator map for latency buckets
  const buckets = new Map<string, { ttft: number[]; gen: number[] }>();
  for (const r of rows) {
    const key = modelLatencyKey(r.model, r.provider ?? UNKNOWN_PROVIDER);
    let b = buckets.get(key);
    if (b === undefined) {
      b = { ttft: [], gen: [] };
      buckets.set(key, b);
    }
    if (r.ttft !== null && r.ttft >= 0) {
      b.ttft.push(r.ttft);
    }
    if (r.gs !== null && r.gf !== null && r.gf >= r.gs) {
      b.gen.push(r.gf - r.gs);
    }
  }
  // @orb-gate-ignore persistence-no-in-memory-state: query-local accumulator map for latency stats output
  const out = new Map<string, LatencyStats>();
  for (const [key, b] of buckets) {
    out.set(key, statsOf(b.ttft, b.gen));
  }
  return out;
}
