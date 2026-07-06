// settings-shell-surface — the full-bleed settings overlay's body (ux-flow-revamp J11 · UI-Arch §4.2
// region map). A left category nav (USER/APP groups, micro-caps headings + `ListRow`s) + a settings-search
// field above it + one scrolling content column that mounts ONLY the active category's pane (lazy panes).
// The route composes this over the `settings` modal slot (home-page.tsx `modals={{settings}}`); the modal
// itself is the Dialog `full` presentation variant (modal-slots.tsx `size: "full"` + ModalHost's
// flex-column popup). The surface is the containment CONSUMER (§2.1) — its root is a `<Container>`.
//
// REAL vs PLACEHOLDER (J11): Appearance is the ONE real pane today (the #31 AppearanceSettingsSurface
// migrates in as the exemplar — setting-row grammar per UIP-404); every other category renders its own
// distinct teaching placeholder (SettingsPanePlaceholder + the category's copy) — the same honesty as the
// section placeholders (J10), never a blank pane. Generation config is NOT here (it is the Presets rail
// section — the governing split). The nav uses the LIST-panel selected-row grammar (ListRow clickable +
// selected), per the region map.

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Icon fine (the character-library-surface.tsx precedent).
import { Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useDeferredValue, useState } from "react";
import { SettingsPanePlaceholder } from "../components/settings-pane-placeholder";
import type { SETTINGS_CATEGORY_IDS } from "../lib/settings-nav";
import {
  categoryIdsForGroup,
  SETTINGS_CATEGORIES,
  SETTINGS_GROUP_LABELS,
  SETTINGS_GROUPS,
} from "../lib/settings-nav";
import { AppearanceSettingsSurface } from "./appearance-settings-surface";

// The active-category id — a LOCAL (non-exported) alias derived from the tuple (an exported alias would be
// the types-in-contract leak the nav registry avoids; local is fine).
type CategoryId = (typeof SETTINGS_CATEGORY_IDS)[number];

/** The settings overlay body: nav (search + grouped rows) on the left, the active pane on the right. */
export function SettingsShell(): ReactElement {
  const [active, setActive] = useState<CategoryId>("appearance");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query, "");
  const needle = deferredQuery.trim().toLowerCase();

  // The search filter over category LABELS (client-side, the filter-characters posture). An empty query
  // matches everything; a group with zero matches drops its heading entirely.
  const matches = (id: CategoryId): boolean =>
    needle === "" || SETTINGS_CATEGORIES[id].label.toLowerCase().includes(needle);

  return (
    <Container className="h-full">
      {/* align="start": top-align the nav + content. `<Row>` defaults to `items-center`, which in a tall
          settings modal floats both columns vertically-centered (a big dead gap above the search + below
          the pane). They fill the height and scroll on their own — anchor them to the top. */}
      <Row align="start" className="h-full min-h-0" gap="section">
        <Stack className="w-(--width-sidebar-sm) min-h-0 shrink-0 overflow-y-auto" gap="section">
          <Input
            aria-label="Search settings"
            onValueChange={setQuery}
            placeholder="Search settings…"
            value={query}
          />
          {SETTINGS_GROUPS.map((group) => {
            const ids = categoryIdsForGroup(group).filter(matches);
            if (ids.length === 0) {
              return null;
            }
            return (
              <Stack key={group} gap="row">
                <Text size="micro" weight="semibold" tone="muted" transform="caps">
                  {SETTINGS_GROUP_LABELS[group]}
                </Text>
                {ids.map((id) => {
                  const category = SETTINGS_CATEGORIES[id];
                  return (
                    <ListRow
                      key={id}
                      clickable={true}
                      leading={<Icon icon={category.icon} size="sm" />}
                      onClick={(): void => setActive(id)}
                      selected={active === id}
                      title={category.label}
                    />
                  );
                })}
              </Stack>
            );
          })}
        </Stack>

        <Stack className="min-h-0 flex-1 overflow-y-auto">
          <SettingsPane category={active} />
        </Stack>
      </Row>
    </Container>
  );
}

/** The active pane — Appearance is real (the exemplar); every other category is a teaching placeholder. */
function SettingsPane({ category }: { readonly category: CategoryId }): ReactElement {
  const def = SETTINGS_CATEGORIES[category];
  if (category === "appearance") {
    return <AppearanceSettingsSurface />;
  }
  return <SettingsPanePlaceholder title={def.label} description={def.description} />;
}
