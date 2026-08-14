// The new-chat character picker: the modal body every "new chat" affordance opens first, so a characterless
// chat survives only as an explicit "Blank chat" pick. The searchable character list is the shared
// `CharacterPicker` composite (cmdk-based — not createCollectionSurface, it's not virtualized and cmdk owns
// search/filtering/keyboard nav for free). Multi-select keeps the palette open on select and toggles a
// trailing check per row, with a "Start chat with N" confirm item and a "Blank chat" escape hatch in the
// picker's leading group.
//
// THE START CLICK MINTS THE ROOM (chat-creation-draft-mode-replacement.md §4.1, fork F1(a)). It used to write
// client state and hand a "draft" — a rowless room backed by a whole parallel client runtime — to the chat
// surface. It now awaits the REAL `chat.startChat` (`useStartChat`, `#data`) and lands in the REAL room,
// committed from frame one. Two properties of that are deliberate and load-bearing:
//   · BACK STILL MINTS NOTHING. D123's interception principle is preserved exactly — dismissing this modal
//     costs zero rows. The row is minted by the explicit Start click, which IS the first real edit: a
//     deliberate creation act naming a cast.
//   · A ROOM STARTED AND ABANDONED IS A HUSK, not litter. It is hidden from the chats list by a server lens,
//     claimed by its first real activity, and reaped on nav-away + a TTL belt. The picker knows none of that.
//
// The modal stays OPEN for the one round-trip, with the confirm item reading its pending state, and closes
// only on success — a failed create leaves the user's cast picked and the mutation's own toast explaining
// why, instead of dismissing them into a landing screen with nothing to retry.

import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { CommandGroup, CommandItem } from "@orb/ui/command";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { CharacterPicker } from "#components";
import { useStartChat } from "#data";
import { useFocusOnMount } from "#lib";
import { clearNewChatIntent, closeModal, useNewChatIntent } from "#state";

const SKELETON_ROW_COUNT = 6;

export function NewChatPicker(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const [selected, setSelected] = useState<ReadonlySet<CharacterId>>(() => new Set<CharacterId>());
  // The creation parameters this open was PRE-ARMED with (the home temp-chat tile's `temporary: true`).
  // Cleared when the modal unmounts — dismissing the picker must not leave them armed for the next plain
  // New chat.
  const intent = useNewChatIntent();
  useEffect(() => clearNewChatIntent, []);
  const { startChat, isPending } = useStartChat();

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
    if (isPending) {
      return; // one creation at a time — a double-fire would mint two rooms for one intent.
    }
    // `startChat` navigates into the new room itself (it owns the cache seed + the enter action). A failure
    // is already toasted by the mutation; we simply do not close, so the picked cast survives for a retry.
    startChat({ ...intent, ...(characterIds.length > 0 ? { characterIds } : {}) })
      .then(closeModal)
      .catch(() => undefined);
  };

  const selectedCount = selected.size;
  const pickLabel = selectedCount === 0 ? "Pick a character to start" : `Start chat with ${selectedCount} character${selectedCount === 1 ? "" : "s"}`;
  // Hoisted out of JSX: a ternary between two STRING variables in a JSX child is `noLeakedRender`-shaped.
  const startLabel = isPending ? "Starting…" : pickLabel;

  return (
    <Stack ref={surfaceRef} className="outline-none" tabIndex={-1}>
      {/* The temporary flag is a CREATION-ONLY parameter the user can't change later, so the picker states
          it up front rather than surprising them in the room (temp tile → this modal → a room born
          Temporary). */}
      {intent?.temporary === true ? (
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
            <CommandItem
              disabled={selectedCount === 0 || isPending}
              keywords={["start", "chat", "group"]}
              onSelect={(): void => found([...selected])}
              value="__start__"
            >
              <Icon icon={MessagesSquare} size="sm" />
              {startLabel}
            </CommandItem>
            <CommandItem disabled={isPending} keywords={["blank", "assistant", "solo"]} onSelect={(): void => found([])} value="__blank__">
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
