// One preset row in the Presets LIST — a shared `LibraryRow` (§13.2 entity row → RowActionsMenu). Clicking
// it opens the preset in the editor. The system-default row is marked (editing it COWs into a fork
// server-side) and cannot be deleted. The active-for-generation preset carries a passive amber Badge (a
// status marker, not a make-active affordance — activation is the LIST dropdown only). The Rename/Duplicate/
// Delete menu + its delete-confirm live in LibraryRow; the delete copy warns when the row is the active preset.

import type { PresetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/Lock fine (the credential-key-row.tsx precedent).
import { Icon, Lock } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import { LibraryRow } from "#components";

/** The minimal preset shape the row renders (a `PresetSummary` — tRPC-inferred at the surface). */
interface PresetRowItem {
  readonly id: PresetId;
  readonly name: string;
  readonly isSystemDefault: boolean;
}

export interface PresetLibraryRowProps {
  readonly preset: PresetRowItem;
  readonly selected: boolean;
  /** The row is the ACTIVE-for-generation preset (`preset.id === seeds.defaultPresetId`) — passive marker. */
  readonly active: boolean;
  readonly onSelect: (id: PresetId) => void;
  readonly onDelete: (id: PresetId) => void;
  readonly onDuplicate: (id: PresetId) => void;
  readonly onRename: (id: PresetId) => void;
}

/** A single preset library row (its Rename/Duplicate/Delete menu + delete-confirm come from LibraryRow). */
export function PresetLibraryRow({
  preset,
  selected,
  active,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
}: PresetLibraryRowProps): ReactElement {
  let leading: ReactNode;
  if (active) {
    leading = <ActiveMarker />;
  } else if (preset.isSystemDefault) {
    leading = <Icon icon={Lock} size="sm" />;
  }

  return (
    <LibraryRow
      onSelect={(): void => onSelect(preset.id)}
      selected={selected}
      title={preset.name}
      {...(leading === undefined ? {} : { leading })}
      {...(preset.isSystemDefault
        ? { subtitle: "Built-in default" }
        : {
            actions: {
              name: preset.name,
              onRename: (): void => onRename(preset.id),
              onDuplicate: (): void => onDuplicate(preset.id),
              onDelete: (): void => onDelete(preset.id),
              deleteDescription: active
                ? "This is your active preset for generation. Deleting it clears the active pick — new chats fall back to the built-in default. This can't be undone."
                : "This permanently removes the preset. This can't be undone.",
            },
          })}
    />
  );
}

/** The leading passive amber ACTIVE marker (a compact `Badge`, primary intent — the amber accent). */
function ActiveMarker(): ReactElement {
  return (
    <Badge intent="primary" size="sm">
      Active
    </Badge>
  );
}
