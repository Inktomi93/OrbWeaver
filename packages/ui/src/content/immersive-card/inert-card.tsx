// The INERT card — the Tier-A presentation of an `html-card` block.
//
// WHY THIS EXISTS. docs/law/UI-Theming-and-Content.md §12.2 splits card rendering in two: Tier B (a trusted author, or a room that turned
// immersive HTML on) is the sandboxed `SandboxFrame` mini-UI with the card's own CSS; Tier A is the inert
// sanitized allowlist in the main DOM for every other row, and it FORBIDS `<style>` and inline `style=`. So a Tier-A card is a card whose
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
// frame, labelled. Why it is plain is said once for the whole message, under it, by the caller's `PlainNotice`, so
// this component states no reason of its own. Dashed borders distinguish it from a live Tier-B card at a glance
// without inventing a new visual language.

import type { ReactElement, ReactNode } from "react";
import { Badge } from "#primitives/badge";
import { inertCardVariants } from "./variants.ts";

/** Matches `ImmersiveCard`'s untitled fallback so the two states label identically. */
const UNTITLED_LABEL = "Card";
const PLAIN_BADGE = "Plain view";

export interface InertCardProps {
  /** The `:::card title="…"` label; absent renders the untitled label. */
  readonly title?: string | undefined;
  /** The already-sanitized Tier-A render of the card body. This component NEVER sanitizes — it frames. */
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * `@orb/ui` — the Tier-A (inert) presentation of a card block. Pairs with `ImmersiveCard` (Tier B): same
 * frame, dashed to read as degraded. See the file header for why a silent
 * degrade was the defect.
 */
export function InertCard({ title, children, className }: InertCardProps): ReactElement {
  const slots = inertCardVariants();
  const label = title !== undefined && title !== "" ? title : UNTITLED_LABEL;
  return (
    <div className={slots.root({ className })} data-slot="inert-card">
      <div className={slots.header()} data-slot="inert-card-header">
        <span className={slots.title()} data-slot="inert-card-title">
          {label}
        </span>
        {/* The house chip primitive — the default `soft` style is the status-chip look, quieter than the card title
            it sits beside. Never a hand-rolled pill (ui-package-design §6.1). */}
        <Badge size="sm" data-slot="inert-card-badge">
          {PLAIN_BADGE}
        </Badge>
      </div>
      <div className={slots.body()} data-slot="inert-card-body">
        {children}
      </div>
    </div>
  );
}
