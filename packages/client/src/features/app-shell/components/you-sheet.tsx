// YouSheet — the body of the mobile "You" bottom sheet. The mobile bottom bar is a curated four; everything
// else folds in here: the account/settings/theme footer affordances the desktop rail shows directly, plus
// the overflow sections (derived, never a parallel list). Each row composes the existing surfaces by
// opening them in the shared modal slot — a single-slot layered handoff, not a nested modal.
//
// Shell-tier, domain-agnostic: this surface only calls #state writers and reads the rail's own section
// registry, so it renders directly from MODAL_SLOTS as a real body.

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve LucideIcon fine (the settings-shell-surface.tsx precedent).
import type { LucideIcon } from "@orb/ui/icons";
// biome-ignore lint/correctness/noUnresolvedImports: same @orb/ui/icons resolver gap as above — tsc/vite resolve Icon/glyphs fine.
import { CircleUser, Icon, Settings, SunMoon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ModalSlotId, SectionId } from "#state";
import {
  closeModal,
  openModal,
  setActiveSection,
  useActiveSection,
  useSectionRegistry,
} from "#state";

/** The account/settings/theme rows — the desktop rail's footer affordances, folded into the You sheet. */
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
  const overflowSections = useSectionRegistry()
    .list()
    .filter((d) => d.rail.mobilePrimary !== true);

  const openYouModal = (id: ModalSlotId): void => {
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
          {overflowSections.map((d) => (
            <ListRow
              key={d.id}
              clickable={true}
              leading={<Icon icon={d.rail.icon} size="sm" />}
              onClick={(): void => goToSection(d.id)}
              selected={d.id === activeSection}
              title={d.rail.label}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
