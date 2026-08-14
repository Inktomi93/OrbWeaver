// domain/rpg/substrate/reveal — the PURE host-reveal derivation (parity-plus §3.6). Tokenizes the stored
// `<lie>`/`<ofilter>` hidden spans out of the assistant transcript bodies (`@orb/kit/content::scanHiddenSpans`
// + the `HIDDEN_TAGS` registry — LITERALLY the strip's twin, one fence-blind pass feeding both, so the reveal
// shows EXACTLY what the strip removed and the two cannot drift) and projects them into the per-message reveal
// + the standing-lie inventory. That shared pass is why an in-card lie now reaches the host's eye: before
// 2026-08-14 both sides tokenized fence-strict, so a `<lie …/>` inside a `:::card` body was missing from the
// host's own standing inventory while riding into every member's payload. ZERO I/O — the
// verb reads the bodies and hands them in (the reminder/delta purity contract). A third hidden channel is a
// `HIDDEN_TAGS` row: this file re-derives its field set from the registry, never a hardcoded lie/ofilter shape.

import type { RpgRevealedMessage, RpgRevealedSpan, RpgRevealView, RpgStandingLie } from "@orb/contracts/rpg";
import type { HiddenContentSpan } from "@orb/kit/content";
import { HIDDEN_TAGS, scanHiddenSpans } from "@orb/kit/content";
import type { RevealBodyRow } from "../contract/service.ts";

/** Project ONE hidden span into its labelled fields (registry order — `character/type/truth/reason` for a lie).
 *  A missing attr projects `""` (the model omitted it; the panel still shows the labelled slot). `null` when the
 *  span's tag is not a registered hidden tag (skip it). Reads the `HIDDEN_TAGS` registry directly (a linear
 *  `find` over the ~2-entry constant — no derived index needed) so a new channel needs no edit here. */
function revealSpan(span: HiddenContentSpan): RpgRevealedSpan | null {
  const def = HIDDEN_TAGS.find((d) => d.tag === span.tag);
  if (def === undefined) {
    return null;
  }
  return {
    tag: span.tag,
    revealLabel: def.revealLabel,
    fields: def.fields.map((key) => ({ key, value: span.attrs[key] ?? "" })),
  };
}

/** The hidden spans of ONE body, projected. Reads the SAME kit pass the member-strip reads (`scanHiddenSpans`
 *  — its literal twin), so the reveal shows exactly what was stripped, FENCE BODIES INCLUDED: before
 *  2026-08-14 both sides were fence-strict, so an in-card `<lie …/>` was invisible to the host's own eye AND
 *  leaked to the member. A body with no hidden spans yields `[]`. */
function revealBodySpans(content: string): RpgRevealedSpan[] {
  const out: RpgRevealedSpan[] = [];
  for (const span of scanHiddenSpans(content)) {
    const revealed = revealSpan(span);
    if (revealed !== null) {
      out.push(revealed);
    }
  }
  return out;
}

/** The `lie` tag name — the standing-lie inventory reads ONLY lies (an ofilter is a perception gate, not a
 *  standing deception). Named against the registry field vocabulary so it stays tied to the `HIDDEN_TAGS` shape. */
const LIE_TAG = "lie";

/** Build the standing-lie inventory from the per-message reveals in CHRONOLOGICAL order (§3.6): collect every
 *  `<lie>` span grouped by `character`, most-recent-wins per (character, truth) — a re-told lie updates in
 *  place, keeping the LATEST message anchor. Ordering: characters in first-seen order; each character's lies in
 *  first-told order (a stable, host-legible list). */
function buildStandingLies(messages: readonly RpgRevealedMessage[]): RpgRevealView["standingLies"] {
  // key = `${character}\u0000${truth}` → the standing lie (most-recent message wins). Insertion order of the
  // per-character sub-map preserves first-told ordering; the outer map preserves first-seen character ordering.
  const byCharacter = new Map<string, Map<string, RpgStandingLie>>();
  for (const message of messages) {
    for (const span of message.spans) {
      if (span.tag !== LIE_TAG) {
        continue;
      }
      const field = (key: string): string => span.fields.find((f) => f.key === key)?.value ?? "";
      const character = field("character");
      const truth = field("truth");
      const lie: RpgStandingLie = { character, type: field("type"), truth, reason: field("reason"), messageId: message.messageId };
      const lies = byCharacter.get(character) ?? new Map<string, RpgStandingLie>();
      lies.set(truth, lie); // most-recent-wins per truth (later message overwrites; Map keeps first-insert order)
      byCharacter.set(character, lies);
    }
  }
  return [...byCharacter.entries()].map(([character, lies]) => ({ character, lies: [...lies.values()] }));
}

/** The pure host-reveal projection (§3.6): the assistant bodies (selected-variant lineage, chronological) →
 *  the per-message parsed hidden spans + the standing-lie inventory. Messages with no hidden spans are OMITTED
 *  from `messages` (the eye only shows on a message that has hidden content); the inventory reads across all. */
export function buildRevealView(bodies: readonly RevealBodyRow[]): RpgRevealView {
  const messages: RpgRevealedMessage[] = [];
  for (const body of bodies) {
    const spans = revealBodySpans(body.content);
    if (spans.length > 0) {
      messages.push({ messageId: body.messageId, spans });
    }
  }
  return { messages, standingLies: buildStandingLies(messages) };
}
