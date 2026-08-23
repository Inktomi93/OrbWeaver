// SettingsNavColumn — the settings shell's LEFT column: the two named tiers, their category rows, and the
// active category's indented subcategory rows. Split out of `settings-shell-surface.tsx` when that file hit
// the 450-line component cap (`component-size`); it is a pure renderer over already-resolved data — every
// decision (which panes are visible, what is active, what a click does) stays with the surface, which is the
// only thing that owns settings navigation STATE.
//
// THE TIERS ARE NAMED GROUPS, NOT BARE PARAGRAPHS (side-eye 2026-08-16 ARIA rider). "User" and "App" rendered
// as plain text, so the `navigation` landmark announced one flat run of rows and a reader navigating by
// structure could not tell where the user tier ended and the app tier began. `role="group"` +
// `aria-labelledby` pointed at the rendered kicker is the honest wiring: the visible name and the announced
// one are the same node, so they cannot drift. Deliberately NOT a heading — that would put two heading ranks
// inside a landmark that already carries its own accessible name, and a kicker labels a group of controls
// rather than opening a document section.

import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { SettingsCategoryId, SettingsGroup, SettingsPaneDefinition, SettingsSubcategory } from "#state";
import { SETTINGS_GROUP_LABELS, settingsGroupLabelId } from "../lib/settings-nav-model.ts";

export interface SettingsNavColumnProps {
  /** The tiers to render, in order — the surface owns the vocabulary. */
  readonly groups: readonly SettingsGroup[];
  /** Already filtered by the viewer's `when` gates: a pane a viewer may not see never reaches here. */
  readonly visiblePanes: readonly SettingsPaneDefinition[];
  readonly active: SettingsCategoryId;
  readonly activeSub: string | null;
  /** Nav ids whose section failed to save — the row wears the marker. */
  readonly erroredSubIds: ReadonlySet<string>;
  /** The marker text for a failed save (the surface owns the copy). */
  readonly saveFailedMarker: string;
  readonly subcategoriesFor: (pane: SettingsPaneDefinition) => readonly SettingsSubcategory[];
  readonly onSelectCategory: (id: SettingsCategoryId) => void;
  readonly onSelectSub: (id: SettingsCategoryId, subId: string) => void;
  /** The push-detail arm: at `@max-md` the column hides once a pane is pushed over it. */
  readonly pushed: boolean;
}

export function SettingsNavColumn({
  groups,
  visiblePanes,
  active,
  activeSub,
  erroredSubIds,
  saveFailedMarker,
  subcategoriesFor,
  onSelectCategory,
  onSelectSub,
  pushed,
}: SettingsNavColumnProps): ReactElement {
  return (
    <Stack
      role="navigation"
      aria-label="Settings sections"
      className={`relative w-(--width-sidebar-sm) min-h-0 shrink-0 overflow-y-auto @max-md:w-full ${pushed ? "@max-md:hidden" : ""}`}
      gap="section"
    >
      {groups.map((group) => (
        <Stack key={group} gap="row" role="group" aria-labelledby={settingsGroupLabelId(group)}>
          <Text voice="kicker" id={settingsGroupLabelId(group)}>
            {SETTINGS_GROUP_LABELS[group]}
          </Text>
          {visiblePanes
            .filter((pane) => pane.group === group)
            .map((pane) => {
              const isActive = active === pane.id;
              const subs = subcategoriesFor(pane);
              return (
                <Stack key={pane.id} gap="field">
                  {/* A pane WITH sections is a disclosure GROUP, not a nav leaf: it expands (`aria-expanded`)
                      and its children carry the one "you are here" marker. A pane with no sections IS the
                      leaf, so it keeps `aria-current` itself. Two `aria-current` rows for one location was
                      the side-eye a11y defect.

                      THE TWO TOKENS ARE DELIBERATE, NOT AN INCONSISTENCY — RULED, NOT CHURNED (side-eye
                      se-verify-4, the `aria-current` nit; recorded here so it is not re-filed). The finding
                      is that this column's rows announce `aria-current="true"` while the app RAIL announces
                      `aria-current="page"` (`app-shell/components/rail-button.tsx`), and asks for one
                      token. They are answering different questions, and ARIA has a token for each: the rail
                      switches SECTIONS — the app's page-level navigation, which is exactly what `page`
                      names — while these rows move within ONE settings surface, where no more specific
                      token applies and `true` is the spec's own fallback. Collapsing them to one spelling
                      would make the rail claim less than it knows, or make a scroll-spy row claim to be a
                      different page. No change; the divergence is the correct reading of the same law. */}
                  <ListRow
                    clickable={true}
                    leading={<Icon icon={pane.icon} size="sm" />}
                    onClick={(): void => onSelectCategory(pane.id)}
                    title={pane.label}
                    {...(subs.length > 0 ? { expanded: isActive } : { selected: isActive })}
                  />
                  {isActive && subs.length > 0 ? (
                    <Stack className="ps-(--spacing-section)" gap="field">
                      {subs.map((sub) => (
                        // The nav row renders `navLabel` when the section declares one — a name too long for
                        // the 220px column is ABBREVIATED here, never renamed at its heading. The full
                        // `label` rides `fullTitle` so hovering recovers it.
                        <ListRow
                          key={sub.id}
                          clickable={true}
                          {...(erroredSubIds.has(sub.id) ? { meta: saveFailedMarker } : {})}
                          fullTitle={sub.label}
                          onClick={(): void => onSelectSub(pane.id, sub.id)}
                          selected={activeSub === sub.id}
                          title={sub.navLabel ?? sub.label}
                        />
                      ))}
                    </Stack>
                  ) : null}
                </Stack>
              );
            })}
        </Stack>
      ))}
    </Stack>
  );
}
