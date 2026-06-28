// domain/stats/persistence/latency — the on-read TTFT/gen percentile engine. A percentile isn't additively
// mergeable, so (unlike everything in rollups.ts) it can't ride the `+=` write path — it's computed HERE on
// read from canon, scoped to the entity in view (owner / one character / one model). Each scope is a
// BOUNDED owner-scoped scan; the percentile math is the pure substrate (substrate/percentiles.ts).
//
// ORBWEAVER (D26/D28): timing lives on `message_variants`, NOT `messages` (the slot is pure — D26). A
// message's latency is its SELECTED variant's (`messages.selectedVariantId` — the kept take), mirroring
// neo's "economics on the active message". Owner-scoping is `messages.characterId → characters.ownerId`
// (the AI character's owner — D28 keys per-character on `characters.id`; D23 derives owner through it).
// See FLAG[PD-21] in rebuild-from-canon.ts: the canon owner-attribution is confirmed against chat's
// StatsDelta builders + the drift gate when chat lands.

import type { Db } from "@orb/db";
import { sql } from "drizzle-orm";
import type { LatencyScope } from "../contract/params";
import type { LatencyStats } from "../contract/views";
import { percentiles } from "../substrate/percentiles";

// The `(unknown)` provider sentinel — coalesced at EVERY key site so a null-provider variant matches the
// model_stats `(unknown)` bucket (invariant #5; mirrors @orb/kit/stats-tally.modelKey + the schema default).
const UNKNOWN_PROVIDER = "(unknown)";

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
export async function readLatency(
  db: Db,
  ownerId: string,
  scope: LatencyScope,
): Promise<LatencyStats> {
  // Narrowing predicate per scope (owner = no extra filter). The model provider coalesces to the sentinel
  // so a scope provider of '(unknown)'/null matches a null-provider variant (invariant #5).
  let narrow = sql``;
  if (scope.kind === "character") {
    narrow = sql`AND m.character_id = ${scope.characterId}`;
  } else if (scope.kind === "model") {
    narrow = sql`AND v.model = ${scope.model} AND COALESCE(v.provider, ${UNKNOWN_PROVIDER}) = ${scope.provider ?? UNKNOWN_PROVIDER}`;
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
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant' ${narrow}
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

/** Stable Map key for a (model, provider) latency bucket. The provider is coalesced to the sentinel by the
 *  callers BEFORE keying, so this key matches the model_stats `(unknown)` bucket (invariant #5). */
export function modelLatencyKey(model: string, provider: string): string {
  return `${model} ${provider}`;
}

/** Per-(model, provider) latency in ONE owner-scoped scan. `readByModel` previously would call
 *  `readLatency({kind:"model"})` once per row — up to 200 full canon scans under `Promise.all` (O(N×
 *  buckets)). This does a single scan, buckets in JS, and computes percentiles per bucket — O(N). Returns
 *  a Map keyed by `modelLatencyKey`; a missing bucket means no qualifying messages (caller uses null stats). */
export async function readModelLatencies(
  db: Db,
  ownerId: string,
): Promise<Map<string, LatencyStats>> {
  const rows = await db.all<{
    model: string;
    provider: string | null;
    ttft: number | null;
    gs: number | null;
    gf: number | null;
  }>(sql`
    SELECT v.model AS model, v.provider AS provider, v.ttft_ms AS ttft,
           v.gen_started_at AS gs, v.gen_finished_at AS gf
    FROM messages m
    JOIN characters c ON c.id = m.character_id
    JOIN message_variants v ON v.id = m.selected_variant_id
    WHERE c.owner_id = ${ownerId} AND m.role = 'assistant' AND v.model IS NOT NULL
  `);
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
  const out = new Map<string, LatencyStats>();
  for (const [key, b] of buckets) {
    out.set(key, statsOf(b.ttft, b.gen));
  }
  return out;
}
