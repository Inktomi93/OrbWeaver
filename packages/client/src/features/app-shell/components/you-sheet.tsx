// YouSheet — the body of the mobile "You" bottom sheet (L6/J12 · D62 P3). The mobile bottom bar is a
// curated four (Chats · Characters · Corpus · You); everything else folds in HERE: the account/settings/
// theme footer affordances the desktop rail shows directly, plus the OVERFLOW sections (the non-
// `mobilePrimary` rail sections — derived, never a parallel list). Each row COMPOSES the existing L5
// surfaces by OPENING them in the shared modal slot (`openModal`) — a single-slot layered handoff (the
// You sheet closes as settings/theme opens), NOT a nested modal or a re-implementation.
//
// SHELL-TIER, DOMAIN-AGNOSTIC (why it's a real in-registry modal body, not route-injected): this surface
// only calls `#state` writers (`setActiveSection` / `openModal` / `closeModal`) + reads the rail's OWN
// section registry — zero Chat/Character knowledge. So it lives legitimately in app-shell and renders
// directly from MODAL_SLOTS (no `placeholder: true` — it's a real body, and the `modal-body-not-
// placeholder` gate is satisfied because it never returns a SectionPlaceholder).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve LucideIcon fine (the settings-shell-surface.tsx precedent).
import type { LucideIcon } from "@orb/ui/icons";
// biome-ignore lint/correctness/noUnresolvedImports: same @orb/ui/icons resolver gap as above — tsc/vite resolve Icon/glyphs fine.
import { CircleUser, Icon, Settings, SunMoon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ModalSlotId, SectionId } from "#state";
import { closeModal, openModal, setActiveSection, useActiveSection } from "#state";
import { RAIL_SECTIONS } from "../lib/rail-slots";

/** The account/settings/theme rows — the desktop rail's footer affordances, folded into the You sheet.
 *  Each opens its L5 surface in the shared modal slot (the You sheet closes, that modal opens). */
const YOU_MODAL_ROWS: readonly {
  readonly id: ModalSlotId;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "account", label: "Account", icon: CircleUser },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "theme", label: "Theme", icon: SunMoon },
];

/** The You bottom-sheet body: account/settings/theme + the overflow (non-`mobilePrimary`) sections. */
export function YouSheet(): ReactElement {
  const activeSection = useActiveSection();
  // The OVERFLOW sections — every rail section NOT on the mobile bottom bar (derived from the registry, so
  // a new section shows up here automatically, never silently dropped — the mobilePrimary contract).
  const overflowSections = RAIL_SECTIONS.filter((s) => s.mobilePrimary !== true);

  const openYouModal = (id: ModalSlotId): void => {
    // Single-slot handoff: opening the target modal REPLACES the `you` sheet in the shared `openModal`
    // slot (not a stacked modal). `openModal` overwrites the open id, so no explicit close is needed.
    openModal(id);
  };
  const goToSection = (id: SectionId): void => {
    setActiveSection(id);
    closeModal();
  };

  return (
    <Stack gap="section">
      <Stack gap="row" aria-label="Account and settings" role="group">
        {YOU_MODAL_ROWS.map((row) => (
          <ListRow
            key={row.id}
            clickable={true}
            leading={<Icon icon={row.icon} size="sm" />}
            onClick={(): void => openYouModal(row.id)}
            title={row.label}
          />
        ))}
      </Stack>

      {overflowSections.length === 0 ? null : (
        <Stack gap="row">
          <Text size="micro" weight="semibold" tone="muted" transform="caps">
            More
          </Text>
          {overflowSections.map((s) => (
            <ListRow
              key={s.id}
              clickable={true}
              leading={<Icon icon={s.icon} size="sm" />}
              onClick={(): void => goToSection(s.id)}
              selected={s.id === activeSection}
              title={s.label}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
