// The INERT card — the Tier-A presentation of an `html-card` block.
//
// WHY THIS EXISTS. D44 §12.2 splits card rendering in two: Tier B (the opt-in per-character trust tier) is
// the sandboxed `SandboxFrame` mini-UI with the card's own CSS; Tier A is the DEFAULT inert sanitized
// allowlist in the main DOM, and it FORBIDS `<style>` and inline `style=`. So a Tier-A card is a card whose
// styling has been discarded by law — structurally intact, visually nothing.
//
// Before this component, that case rendered the sanitized body straight into the prose flow with no frame
// and no label. The content did not disappear; its IDENTITY did — an unstyled `<div>` soup inside a message
// is indistinguishable from the model having written plain text badly, which is exactly how the defect was
// reported ("cards just vanish"). The untrusted-MEDIA path has had a visible gate all along
// (`message-media-placeholder` — "External media — load from …?"), and this is the missing twin for cards:
// the same posture of REFUSING VISIBLY instead of degrading silently.
//
// It renders the sanitized content (nothing is withheld — Tier A is safe by construction) inside the card
// frame, labelled, with one line saying why it is plain and what turns it on. Dashed borders distinguish it
// from a live Tier-B card at a glance without inventing a new visual language.

import type { ReactElement, ReactNode } from "react";
import { Badge } from "../../primitives/badge/index.ts";
import { inertCardVariants } from "./variants.ts";

/** Matches `ImmersiveCard`'s untitled fallback so the two states label identically. */
const UNTITLED_LABEL = "Card";
const PLAIN_BADGE = "Plain view";

export interface InertCardProps {
  /** The `:::card title="…"` label; absent renders the untitled label. */
  readonly title?: string | undefined;
  /** Who authored the card — names the subject of the hint ("Rich HTML is off for Charlotte"). Absent
   *  degrades to the generic phrasing rather than printing an empty name. */
  readonly authorName?: string | undefined;
  /** The already-sanitized Tier-A render of the card body. This component NEVER sanitizes — it frames. */
  readonly children: ReactNode;
  readonly className?: string;
}

/** The hint copy. One sentence of cause, one of remedy — the media gate's register, not a paragraph. */
function hintText(authorName: string | undefined): string {
  const subject = authorName === undefined || authorName === "" ? "this character" : authorName;
  return `Shown as plain content because rich HTML is off for ${subject}. Turn on "Trust HTML" in the character's settings to render interactive cards.`;
}

/**
 * `@orb/ui` — the Tier-A (inert) presentation of a card block. Pairs with `ImmersiveCard` (Tier B): same
 * frame, dashed to read as degraded, plus the reason and the remedy. See the file header for why a silent
 * degrade was the defect.
 */
export function InertCard({ title, authorName, children, className }: InertCardProps): ReactElement {
  const slots = inertCardVariants();
  const label = title !== undefined && title !== "" ? title : UNTITLED_LABEL;
  return (
    <div className={slots.root({ className })} data-slot="inert-card">
      <div className={slots.header()} data-slot="inert-card-header">
        <span className={slots.title()} data-slot="inert-card-title">
          {label}
        </span>
        {/* The house chip primitive — `tone="soft"` is the status-chip look, quieter than the card title
            it sits beside. Never a hand-rolled pill (ui-package-design §6.1). */}
        <Badge tone="soft" size="sm" data-slot="inert-card-badge">
          {PLAIN_BADGE}
        </Badge>
      </div>
      <div className={slots.body()} data-slot="inert-card-body">
        {children}
      </div>
      {/* Not a `title=` tooltip: the whole point is that the reason is visible without a hover a touch
          user cannot perform (`[[base-ui-disabled-menuitem-title]]` is the inverse case — there the element
          was unfocusable; here the text simply has to be READ, so it is text). */}
      <p className={slots.hint()} data-slot="inert-card-hint">
        {hintText(authorName)}
      </p>
    </div>
  );
}
