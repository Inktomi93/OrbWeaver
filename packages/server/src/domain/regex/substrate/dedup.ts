// domain/regex/substrate/dedup — THE DEDUP RULE, once, pure, and the only home that knows it.
//
// It lives here and not in `persistence/` because it is LOGIC: it decides which candidates become new rows
// and which re-use an existing one, and it builds the in-memory index that decision needs. `persistence/`
// is queries-only — it reads the owner's rows,
// hands them here, and writes back what this planner returns.
//
// THE RULE: a candidate matches an existing owned row when its NAME is equal AND its behavior body is
// CONTENT-equal, by `regexScriptContentKey` (`@orb/contracts/regex`), which a preset's import identity is built
// from too. Re-importing a card pack is the norm, and always-new would breed hundreds of identical rows.
//
// CARRIED REFERENCES WIN OVER CONTENT, and they win TOTALLY: if any reference resolves,
// the by-value payload is skipped entirely rather than merely content-checked (see `planCardLift`). That is
// what makes a same-install re-import produce exactly zero duplicate rows even when a script was EDITED
// after the export. The content rule is the FOREIGN-card fallback, where no reference can resolve.

import type { PortableRegexScript, RegexScriptCard, RegexScriptRow, ScriptPlan } from "@orb/contracts/regex";
import { regexScriptBehaviorSchema, regexScriptContentKey } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { CardLiftInput, CardLiftPlan, PlannedInsert, SplitScript } from "../contract/dedup.ts";

/** An EXISTING library row's content key: {@link regexScriptContentKey} of the row's own name and body. */
export function rowKey(row: RegexScriptRow): string {
  // THE DESTRUCTURE IS THE FILTER, so every NON-CONTENT field of `RegexScriptRow` must be named here: the row's
  // identity column (`id`), its promoted columns (`name`/`enabled`) and its stamp (`updatedAt`). A missed stamp rides
  // into the canonical JSON as if it were behavior, and two identical scripts stop matching.
  const { id: _id, name: _name, enabled: _enabled, updatedAt: _updatedAt, ...behavior } = row;
  return regexScriptContentKey(row.name, behavior);
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
    const key = regexScriptContentKey(split.name, split.behavior);
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

/**
 * The dry-run answer for a run of by-value lifts in their run order (a folder's presets): per script, `library` when
 * an owned row holds it, `upload` when an earlier script of the run mints it, the write door's reason when the run
 * would mint it and the door refuses it, and a mint otherwise. `refusals` holds the door's verdict per script, in the
 * same shape as `lifts`. The same key {@link planCardLift} matches by, and a refused script mints nothing a later
 * one could reuse, as in the run, so a preview never claims a row the lift would not mint.
 */
export function planUploadLift(
  existing: readonly RegexScriptRow[],
  lifts: readonly (readonly RegexScriptCard[])[],
  refusals: readonly (readonly (string | null)[])[],
): ScriptPlan[][] {
  // Keyed as `planCardLift` keys the rows it reuses, so a later row with the same content wins in both.
  const held = new Map(existing.map((row) => [rowKey(row), row.enabled]));
  const minted = new Set<string>();
  return lifts.map((scripts, lift) =>
    scripts.map((script, index): ScriptPlan => {
      const split = splitScript(script);
      const key = regexScriptContentKey(split.name, split.behavior);
      const heldEnabled = held.get(key);
      if (heldEnabled !== undefined) {
        return { reuse: "library", enabled: heldEnabled };
      }
      const refused = refusals[lift]?.[index] ?? null;
      if (refused !== null) {
        return { refused };
      }
      if (minted.has(key)) {
        return { reuse: "upload" };
      }
      minted.add(key);
      return { reuse: null };
    }),
  );
}

/** The single-candidate arm (the backup-bundle import): the existing row this payload matches, or null. */
export function findDuplicate(existing: readonly RegexScriptRow[], candidate: SplitScript): RegexScriptId | null {
  const key = regexScriptContentKey(candidate.name, candidate.behavior);
  return existing.find((row) => rowKey(row) === key)?.id ?? null;
}
