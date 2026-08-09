// domain/regex/substrate/dedup — THE DEDUP RULE, once, pure, and the only home that knows it.
//
// It lives here and not in `persistence/` because it is LOGIC: it decides which candidates become new rows
// and which re-use an existing one, and it builds the in-memory index that decision needs. `persistence/`
// is queries-only (the `persistence-no-in-memory-state` gate is the enforcer) — it reads the owner's rows,
// hands them here, and writes back what this planner returns.
//
// THE RULE: a candidate matches an existing owned row when its NAME is equal AND its behavior body is
// CONTENT-equal. `dedupKey` canonicalizes by sorting the body's keys — a JSON blob's key order is not
// semantic, so a re-encoded identical script must still match. Re-importing a card pack is the norm, and
// always-new would breed hundreds of identical rows.
//
// CARRIED REFERENCES WIN OVER CONTENT (PD-144's shape), and they win TOTALLY: if any reference resolves,
// the by-value payload is skipped entirely rather than merely content-checked (see `planCardLift`). That is
// what makes a same-install re-import produce exactly zero duplicate rows even when a script was EDITED
// after the export. The content rule is the FOREIGN-card fallback, where no reference can resolve.

import type { PortableRegexScript, RegexScriptBehavior, RegexScriptCard, RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { CardLiftInput, CardLiftPlan, PlannedInsert, SplitScript } from "../contract/dedup.ts";

/** The content-equality key: name + canonical (key-sorted) behavior JSON. See the header. */
export function dedupKey(name: string, behavior: RegexScriptBehavior): string {
  const entries = Object.entries(behavior as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return `${name} ${JSON.stringify(entries)}`;
}

/** An EXISTING library row's key — the same function applied to the row's own name + body.
 *
 *  THE DESTRUCTURE IS THE FILTER, so every NON-CONTENT field of `RegexScriptRow` must be named here. It is
 *  the row's identity columns (`id`), its promoted columns (`name`/`enabled`, keyed separately or not at
 *  all) and its STAMPS (`updatedAt`) — none of which are what the script does. Missing one silently breaks
 *  dedup for every row: `updatedAt` alone made two byte-identical scripts imported an hour apart fail to
 *  match, because the stamp rode into the canonical JSON as if it were behavior. */
export function rowKey(row: RegexScriptRow): string {
  const { id: _id, name: _name, enabled: _enabled, updatedAt: _updatedAt, ...behavior } = row;
  return dedupKey(row.name, behavior);
}

/** Split a wire script (ST card or portable bundle file) into its row parts. The portable shape's `global`
 *  flag is an ATTACHMENT, not behavior, so it is dropped here and handled by the caller. */
export function splitScript(script: RegexScriptCard | PortableRegexScript): SplitScript {
  const { id: _foreignId, name, enabled, ...rest } = script as RegexScriptCard & { readonly global?: boolean };
  const { global: _global, ...behaviorFields } = rest as Record<string, unknown>;
  return { name, enabled, behavior: regexScriptBehaviorSchema.parse(behaviorFields) };
}

/**
 * Plan a card's script lift: which rows to mint, which to re-use, and the attachment order. PURE — no db,
 * no clock; the caller supplies the reads and performs the writes in ONE batch.
 */
export function planCardLift({ existing, carriedIds, scripts, mintId }: CardLiftInput): CardLiftPlan {
  const byKey = new Map<string, RegexScriptId>(existing.map((row) => [rowKey(row), row.id]));
  const attachIds: RegexScriptId[] = [...carriedIds];
  const attached = new Set<RegexScriptId>(attachIds);
  const inserts: PlannedInsert[] = [];
  let reused = carriedIds.length;

  // ANY resolved reference means this card came from THIS install, where the two channels describe the SAME
  // set — the by-value payload is a redundant snapshot of the rows the references already named. Lifting it
  // anyway RE-MINTS a stale copy of every script edited since the export: the body differs, so content
  // dedup misses it and a second row appears. Skip it wholesale — the `importLorebook` rule verbatim
  // ("when ANY reference links we SKIP the embedded clone; cloning it would duplicate the book").
  //
  // The cost is bounded and correct: a script DELETED since the export is not restored, which is the same
  // answer the user's own delete already gave. A FOREIGN card resolves no references and takes the loop.
  if (carriedIds.length > 0) {
    return { inserts, attachIds, reused };
  }

  for (const script of scripts) {
    const split = splitScript(script);
    const key = dedupKey(split.name, split.behavior);
    const match = byKey.get(key);
    if (match !== undefined) {
      // Already attached via a carried reference (or an earlier duplicate in the same card) — the position
      // it already holds wins; a second attach would be a no-op row anyway.
      if (!attached.has(match)) {
        attached.add(match);
        attachIds.push(match);
        reused += 1;
      }
      continue;
    }
    const id = mintId();
    inserts.push({ id, ...split });
    byKey.set(key, id);
    attached.add(id);
    attachIds.push(id);
  }

  return { inserts, attachIds, reused };
}

/** The single-candidate arm (the backup-bundle import): the existing row this payload matches, or null. */
export function findDuplicate(existing: readonly RegexScriptRow[], candidate: SplitScript): RegexScriptId | null {
  const key = dedupKey(candidate.name, candidate.behavior);
  return existing.find((row) => rowKey(row) === key)?.id ?? null;
}
