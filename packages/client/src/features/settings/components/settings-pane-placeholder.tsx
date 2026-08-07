// settings-pane-placeholder — the honest "not built yet" body for a settings category whose real surface
// hasn't landed (ux-flow-revamp J11; the J10 distinct-copy discipline). A thin wrap of @orb/ui's teaching
// EmptyState with the category's OWN copy (from its SettingsPaneDefinition), so a deferred pane reads as "this
// specific thing isn't built yet", never a generic sparkle. Feature-tier (NOT app-shell's SectionPlaceholder
// — features can't import app-shell); composed from @orb/ui only. Swapped for the real surface, pane by
// pane, as each category's feature lane lands (the way Appearance already is real today).

import { Badge } from "@orb/ui/badge";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

export interface SettingsPanePlaceholderProps {
  readonly title: string;
  readonly description: string;
}

/** The teaching placeholder for an unbuilt settings category (its distinct copy from the nav registry).
 *
 *  IT SAYS "NOT BUILT YET" IN WORDS (side-eye 2026-08-06 P3; [[empty-states-are-load-bearing]]). A pane
 *  title and one sentence, centred in an otherwise blank column, is indistinguishable from a pane whose
 *  controls FAILED to render — the reader is left deciding whether the app is broken or they are. The chip
 *  is the missing half: nothing here is switched off, hidden or lost, the surface simply does not exist
 *  yet. Deliberately NOT the EmptyState `action` slot — a status is not a next step, and dropping a
 *  non-CTA into that slot would flip `empty-state-has-action` green over a dead end it still is (this
 *  file's own ALLOWLIST reason: a generic placeholder has no pane-specific next step to offer; the
 *  pane's OWN `description` is where a "meanwhile, X lives at Y" pointer belongs). */
export function SettingsPanePlaceholder({ title, description }: SettingsPanePlaceholderProps): ReactElement {
  return (
    <Stack align="center" className="h-full justify-center" gap="block">
      <EmptyState icon={<Icon icon={Sparkles} size="lg" />} title={title} description={description} />
      <Badge intent="neutral" size="sm">
        Not built yet
      </Badge>
    </Stack>
  );
}
