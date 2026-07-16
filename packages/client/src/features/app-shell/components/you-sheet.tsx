// YouSheet — the body of the mobile "You" bottom sheet. The mobile bottom bar is a curated four; everything
// else folds in here: the rail-footer + avatar modals (theme, settings, account) the desktop rail shows
// directly (label + icon DERIVED from the modal registry, never a parallel id list), plus the overflow
// sections (derived from the section registry). Each row opens its surface in the shared modal slot.

import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ModalSlotId, SectionId } from "#state";
import { closeModal, openModal, setActiveSection, useActiveSection, useModalRegistry, useSectionRegistry } from "#state";

/** The You bottom-sheet body: the desktop-rail-footer + avatar modals, in the same order the desktop
 *  rail renders them (rail-footer group, then avatar) + the overflow (`mobile: "sheet"`) sections. */
export function YouSheet(): ReactElement {
  const activeSection = useActiveSection();
  const modals = useModalRegistry().list();
  const modalRows = modals
    .filter((def) => def.trigger.placement === "rail-footer" || def.trigger.placement === "avatar")
    .map((def) => ({ id: def.id, label: def.title, icon: def.trigger.icon }));
  const overflowSections = useSectionRegistry()
    .list()
    .filter((d) => d.rail.mobile === "sheet");

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
        {modalRows.map((row) => (
          <ListRow key={row.id} clickable={true} leading={<Icon icon={row.icon} size="sm" />} onClick={(): void => openYouModal(row.id)} title={row.label} />
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
