// settings-pane-placeholder — the honest "not built yet" body for a settings category whose real surface
// hasn't landed (ux-flow-revamp J11; the J10 distinct-copy discipline). A thin wrap of @orb/ui's teaching
// EmptyState with the category's OWN copy (from its SettingsPaneDefinition), so a deferred pane reads as "this
// specific thing isn't built yet", never a generic sparkle. Feature-tier (NOT app-shell's SectionPlaceholder
// — features can't import app-shell); composed from @orb/ui only. Swapped for the real surface, pane by
// pane, as each category's feature lane lands (the way Appearance already is real today).

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Sparkles } from "@orb/ui/icons";
import type { ReactElement } from "react";

export interface SettingsPanePlaceholderProps {
  readonly title: string;
  readonly description: string;
}

/** The teaching placeholder for an unbuilt settings category (its distinct copy from the nav registry). */
export function SettingsPanePlaceholder({ title, description }: SettingsPanePlaceholderProps): ReactElement {
  return <EmptyState className="h-full justify-center" icon={<Icon icon={Sparkles} size="lg" />} title={title} description={description} />;
}
