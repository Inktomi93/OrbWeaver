// The Command-palette modal as ONE co-located definition (client-architecture-lockdown.md §6d).
// Self-contained like a section: `goToSections` derives from the section registry here, not a prop —
// a section definition never took one either.

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve the Command glyph fine (the rail-slots precedent).
import { Command } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { useSectionRegistry } from "#state";
import type { GoToSection } from "../surfaces/command-palette-surface";
import { CommandPaletteSurface } from "../surfaces/command-palette-surface";

function CommandModalBody(): ReturnType<typeof CommandPaletteSurface> {
  const registry = useSectionRegistry();
  const goToSections: readonly GoToSection[] = registry
    .list()
    .map((d) => ({ id: d.id, label: d.rail.label }));
  return <CommandPaletteSurface goToSections={goToSections} />;
}

export const commandModal: ModalDefinition = {
  id: "command",
  title: "Jump to…",
  trigger: { placement: "topbar-command", label: "Jump to…", icon: Command },
  body: CommandModalBody,
};
