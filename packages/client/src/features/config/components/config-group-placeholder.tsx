// config-group-placeholder — the honest "not built yet" body for a config group whose real surface hasn't
// landed (the `{ placeholder: true }` body arm; the distinct-copy discipline). A thin
// wrap of @orb/ui's teaching EmptyState with the group's OWN copy (its `description`), so a deferred group
// reads as "this specific thing isn't built yet", never a generic sparkle. Feature-tier (NOT app-shell's
// SectionPlaceholder — features can't import app-shell); composed from @orb/ui only. No production group
// carries the arm today (#696) — the CT keeps it a live subject through a synthetic registry.

import { Badge } from "@orb/ui/badge";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Sparkles } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { CONFIG_UNBUILT_MARKER } from "../lib/config-copy.ts";

export interface ConfigGroupPlaceholderProps {
  readonly title: string;
  readonly description: string;
}

/** The teaching placeholder for an unbuilt config group (its distinct copy from the registry).
 *
 *  IT SAYS "NOT BUILT YET" IN WORDS (side-eye 2026-08-06 P3; [[empty-states-are-load-bearing]]). A pane
 *  title and one sentence, centred in an otherwise blank column, is indistinguishable from a pane whose
 *  controls FAILED to render — the reader is left deciding whether the app is broken or they are. The chip
 *  is the missing half: nothing here is switched off, hidden or lost, the surface simply does not exist
 *  yet. Deliberately NOT the EmptyState `action` slot — a status is not a next step, and dropping a
 *  non-CTA into that slot would flip `empty-state-has-action` green over a dead end it still is (this
 *  file's own ALLOWLIST reason: a generic placeholder has no pane-specific next step to offer; the
 *  pane's OWN `description` is where a "meanwhile, X lives at Y" pointer belongs). */
export function ConfigGroupPlaceholder({ title, description }: ConfigGroupPlaceholderProps): ReactElement {
  return (
    <Stack align="center" className="h-full justify-center" gap="block">
      {/* This `<Stack align="center">` once collapsed EmptyState to a one-word-per-line ribbon: its `@container`
          root ignores its contents, so shrink-to-fit centering resolved it to width 0. The floor now lives in
          the PRIMITIVE (`empty-state/variants.ts` root `w-full`, gap-audit 2026-08-08 fence #2) so no consumer
          has to remember it; align="center" just centers the Badge below. */}
      {/* @orb-waive empty-state-has-action(EmptyState): the config-group equivalent of the app-shell section-placeholder — the settings-pane placeholder re-homed by the config revamp (#866 S1), with no group-specific next step to offer. Ends when the placeholder is deleted with the last unbuilt config group. */}
      <EmptyState icon={<Icon icon={Sparkles} size="lg" />} title={title} description={description} />
      {/* ONE SPELLING, TWO SURFACES (#925 ruling 2): the LIST row that opens this body wears the same phrase
          from the same home, so the map and the pane cannot drift into two claims about one arm. */}
      <Badge intent="neutral" size="sm">
        {CONFIG_UNBUILT_MARKER}
      </Badge>
    </Stack>
  );
}
