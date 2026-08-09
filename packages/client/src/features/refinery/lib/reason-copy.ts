// The typed drop-reason → English map (the apply-and-selection mock's law note: "each needs its own
// English, because a silent drop reads as data loss"). The closed `ApplyDropReason` axis DERIVES from
// the tRPC WIRE (the client never imports `@orb/server` — physics; `inferOutput` is the sanctioned
// channel, the R2 hooks' own posture), so a new server member fails tsc HERE before a drop can render
// blank. The two SHAPE reasons are diagnostic (they can only occur on a malformed client call).

import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

/** The wire's dropped-entry shape + its reason union — ONE derivation (non-exported aliases; consumers
 *  re-derive from the same wire, the §7.4 client posture). */
type DroppedFieldWire = inferOutput<Trpc["refinery"]["applyFields"]>["dropped"][number];
type ApplyDropReason = DroppedFieldWire["reason"];

export interface DropReasonCopy {
  /** The word-primary chip label. */
  readonly chip: string;
  /** The one-line consequence copy under the row. */
  readonly why: string;
  /** Destructive-tinted (the belt-9 class) vs warning-tinted (applicability drift). */
  readonly tone: "bad" | "warn";
}

export const DROP_REASON_COPY: Record<ApplyDropReason, DropReasonCopy> = {
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  not_in_rewrite: {
    chip: "not in this rewrite",
    why: "The chosen rewrite run produced no entry for it. Re-run rewrite, or apply from the run that did.",
    tone: "warn",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  not_selected: {
    chip: "outside your scope",
    why: "This session never put the field in scope — the model was never given it to rewrite, so an entry for it is invented.",
    tone: "bad",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  greeting_index_missing: {
    chip: "malformed accept",
    why: "A greetings accept arrived without its slot number — this looks like a bug; the run record has the details.",
    tone: "bad",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  greeting_index_invalid: {
    chip: "slot no longer exists",
    why: "That greeting was deleted from the card after this session started. A rewrite is never re-created as a new greeting by index.",
    tone: "warn",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  greeting_index_forbidden: {
    chip: "malformed accept",
    why: "A slot number arrived on a non-greetings field — this looks like a bug; the run record has the details.",
    tone: "bad",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  not_applicable: {
    chip: "no longer applicable",
    why: "The card's depth note has been removed. The rewrite only carries the note's text — it cannot invent the depth/role directive.",
    tone: "warn",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  would_leave_no_greeting: {
    chip: "last greeting",
    why: "Clearing this slot would leave the card with no first message — the last surviving greeting refuses to be emptied away.",
    tone: "warn",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  greeting_cap_reached: {
    chip: "no room for another greeting",
    why: "This card already holds the maximum number of greetings. Remove one first, or keep this text somewhere else.",
    tone: "warn",
  },
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire drop-reason member (refinery `applyFields.dropped[].reason`) — a camelCase respell would break the exhaustive Record.
  diverged_since_session: {
    chip: "changed since the session started",
    why: "The live card's text moved under this session. Re-open the block and confirm which version wins — nothing is overwritten blind.",
    tone: "warn",
  },
};
