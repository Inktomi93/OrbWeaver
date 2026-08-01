// The new-chat character picker: the modal body every "new chat" affordance opens first, so a
// characterless draft survives only as an explicit "Blank chat" pick. The searchable character list is the
// shared `CharacterPicker` composite (cmdk-based — not createCollectionSurface, it's not virtualized and
// cmdk owns search/filtering/keyboard nav for free). Multi-select keeps the palette open on select and
// toggles a trailing check per row, with a "Start chat with N" confirm item and a "Blank chat" escape hatch
// in the picker's leading group. Writes intent through #state module actions (startNewChat/setActiveSection/
// closeModal).

import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { CommandGroup, CommandItem } from "@orb/ui/command";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { CharacterPicker } from "#components";
import { useFocusOnMount } from "#lib";
import { clearNewChatPreset, closeModal, setActiveSection, startNewChat, useNewChatPreset } from "#state";

const SKELETON_ROW_COUNT = 6;

export function NewChatPicker(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const [selected, setSelected] = useState<ReadonlySet<CharacterId>>(() => new Set<CharacterId>());
  // The seed this open was PRESET with (the home temp-chat tile's `temporary: true`). Cleared when the
  // modal unmounts — dismissing the picker must not leave the intent armed for the next plain New chat.
  const preset = useNewChatPreset();
  useEffect(() => clearNewChatPreset, []);

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
    const seed = { ...preset, ...(characterIds.length > 0 ? { characterIds } : {}) };
    startNewChat(Object.keys(seed).length > 0 ? seed : undefined);
    setActiveSection("chats");
    closeModal();
  };

  const selectedCount = selected.size;

  return (
    <Stack ref={surfaceRef} className="outline-none" tabIndex={-1}>
      {/* The preset is a CREATION-ONLY flag the user can't change later, so the picker states it up front
          rather than surprising them in the room (temp tile → this modal → a room born Temporary). */}
      {preset?.temporary === true ? (
        <Row align="center" gap="field" padding="block">
          <Badge intent="neutral" tone="soft">
            Temporary
          </Badge>
          <Text size="label" tone="muted">
            This room won't join your chats list, and you can't switch it later.
          </Text>
        </Row>
      ) : null}
      <CharacterPicker
        emptyText="No characters match."
        isSelected={(id): boolean => selected.has(id)}
        label="Choose characters"
        leadingGroup={
          <CommandGroup heading="Start">
            <CommandItem disabled={selectedCount === 0} keywords={["start", "chat", "group"]} onSelect={(): void => found([...selected])} value="__start__">
              <Icon icon={MessagesSquare} size="sm" />
              {selectedCount === 0 ? "Pick a character to start" : `Start chat with ${selectedCount} character${selectedCount === 1 ? "" : "s"}`}
            </CommandItem>
            <CommandItem keywords={["blank", "assistant", "solo"]} onSelect={(): void => found([])} value="__blank__">
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
