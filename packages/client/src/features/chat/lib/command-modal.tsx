// The Command-palette modal as ONE co-located definition (client-architecture-lockdown.md §6d).
// Self-contained like a section: `goToSections` derives from the section registry here, not a prop —
// a section definition never took one either.

import { Command } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { useSectionRegistry } from "#state";
import type { GoToSection } from "../surfaces/command-palette-surface.tsx";
import { CommandPaletteSurface } from "../surfaces/command-palette-surface.tsx";

function CommandModalBody(): ReturnType<typeof CommandPaletteSurface> {
  const registry = useSectionRegistry();
  const goToSections: readonly GoToSection[] = registry.list().map((d) => ({ id: d.id, label: d.rail.label }));
  return <CommandPaletteSurface goToSections={goToSections} />;
}

export const commandModal: ModalDefinition = {
  id: "command",
  title: "Jump to…",
  // The trigger IS the ⌘K chip's chrome entry (#1789): `order: -10` is where the chip's lead position in
  // the trail is spelled — ahead of every feature-contributed widget, which start at 0 — and `mobile:
  // "sheet"` is the ruled phone fate (the chip is desktop-shaped and a 320px row cannot afford it, side-eye
  // P1; the You sheet lists it as a row instead). Both used to be JSX positions in app-shell.tsx.
  trigger: { placement: "topbar.trail", label: "Jump to…", icon: Command, order: -10, mobile: "sheet" },
  body: CommandModalBody,
};
