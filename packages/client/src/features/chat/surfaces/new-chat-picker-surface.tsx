// The new-chat character picker: the modal body every "new chat" affordance opens first, so a
// characterless draft survives only as an explicit "Blank chat" pick. The searchable character list is the
// shared `CharacterPicker` composite (cmdk-based — not createCollectionSurface, it's not virtualized and
// cmdk owns search/filtering/keyboard nav for free). Multi-select keeps the palette open on select and
// toggles a trailing check per row, with a "Start chat with N" confirm item and a "Blank chat" escape hatch
// in the picker's leading group. Writes intent through #state module actions (startNewChat/setActiveSection/
// closeModal).

import type { CharacterId } from "@orb/kit/ids";
import { CommandGroup, CommandItem } from "@orb/ui/command";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { CharacterPicker } from "#components";
import { useFocusOnMount } from "#lib";
import { closeModal, setActiveSection, startNewChat } from "#state";

const SKELETON_ROW_COUNT = 6;

export function NewChatPicker(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const [selected, setSelected] = useState<ReadonlySet<CharacterId>>(() => new Set<CharacterId>());

  const toggle = (id: CharacterId): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const found = (characterIds: readonly CharacterId[]): void => {
    startNewChat(characterIds.length > 0 ? { characterIds } : undefined);
    setActiveSection("chats");
    closeModal();
  };

  const selectedCount = selected.size;

  return (
    <Stack ref={surfaceRef} className="outline-none" tabIndex={-1}>
      <CharacterPicker
        emptyText="No characters match."
        isSelected={(id): boolean => selected.has(id)}
        label="Choose characters"
        leadingGroup={
          <CommandGroup heading="Start">
            <CommandItem
              disabled={selectedCount === 0}
              keywords={["start", "chat", "group"]}
              onSelect={(): void => found([...selected])}
              value="__start__"
            >
              <Icon icon={MessagesSquare} size="sm" />
              {selectedCount === 0
                ? "Pick a character to start"
                : `Start chat with ${selectedCount} character${selectedCount === 1 ? "" : "s"}`}
            </CommandItem>
            <CommandItem
              keywords={["blank", "assistant", "solo"]}
              onSelect={(): void => found([])}
              value="__blank__"
            >
              <Icon icon={Plus} size="sm" />
              Blank chat
            </CommandItem>
          </CommandGroup>
        }
        listClassName="max-h-96"
        onEscape={closeModal}
        onSelect={toggle}
        placeholder="Search characters…"
        rowsHeading="Characters"
        skeletonCount={SKELETON_ROW_COUNT}
      />
    </Stack>
  );
}
