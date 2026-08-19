// The new-chat character picker: the modal body every "new chat" affordance opens first, so a characterless
// chat survives only as an explicit "Blank chat" pick. The searchable character list is the shared
// `CharacterPicker` composite (cmdk-based — not createCollectionSurface, it's not virtualized and cmdk owns
// search/filtering/keyboard nav for free). Multi-select keeps the palette open on select and toggles a
// trailing check per row.
//
// THE START/BLANK ACTIONS LIVE IN A PERSISTENT FOOTER, NOT INSIDE THE SCROLLING LIST (#334). They used to
// be a `CommandGroup` handed to the picker's `leadingGroup` — which cmdk renders INSIDE the `CommandList`,
// so once the user scrolled down the character list to pick someone, the (now-enabled) "Start" affordance
// had scrolled off the top and there was nowhere left to click to begin. The actions are now real
// `<Button>`s in a footer BELOW the picker: the character list scrolls INSIDE the picker's own max-height
// region, so the footer never moves, and `sticky bottom-0` pins it in view even when the modal body itself
// scrolls on a short viewport. The "Start" button stays rendered but DISABLED at zero selection (teaching
// "Pick a character to start"), so the affordance is discoverable before it is usable.
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
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
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
  // Cleared by a real modal dismiss — never component cleanup, which React Strict Mode probes while this
  // modal remains logically open. Every opener also overwrites it before opening.
  const intent = useNewChatIntent();
  const { startChat, isPending } = useStartChat();

  const dismiss = (): void => {
    clearNewChatIntent();
    closeModal();
  };

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
        listClassName="max-h-96"
        onEscape={dismiss}
        onSelect={toggle}
        placeholder="Search characters…"
        rowsHeading="Characters"
        skeletonCount={SKELETON_ROW_COUNT}
      />
      {/* PERSISTENT ACTION FOOTER (#334). Below the picker's own scrolling list, so a pick made deep in the
          list still has the Start action in view. `sticky bottom-0` keeps it pinned when the modal body
          scrolls; `bg-popover` matches the modal surface so scrolled rows don't bleed through. */}
      <Row align="center" className="sticky bottom-0 border-border border-t bg-popover" gap="field" justify="end" padding="block">
        <Button disabled={isPending} intent="ghost" onClick={(): void => found([])}>
          <Icon icon={Plus} size="sm" />
          Blank chat
        </Button>
        <Button disabled={selectedCount === 0 || isPending} intent="primary" onClick={(): void => found([...selected])}>
          <Icon icon={MessagesSquare} size="sm" />
          {startLabel}
        </Button>
      </Row>
    </Stack>
  );
}
