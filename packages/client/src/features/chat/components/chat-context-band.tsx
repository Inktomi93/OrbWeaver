// The chat CONTEXT pane's HEAD BAND — the room's identity in the context bracket's band slot (#860, owner-ruled
// 2026-08-30; the mock is `docs/design/mocks/context-bracket/ChatRoom.dc.html`): the room's TITLE over three
// chips — members · memory · preset. It is fed through chat's `defineContextTabs` `header` slot
// (`chats-section.tsx`), the slot CP-1 left empty "for CP-4's scene banner"; the Waystone band takes the same
// slot on a game chat through the rpg region claim. One slot, one content at a time, never a second head.
//
// THE TITLE'S ONE HOME MOVES HERE (#846 by relocation). The topbar identity used to be the only place the
// room was named, and at 1280×800 with both panes docked it rendered "Example — …" (104 of 220px). While the
// context pane is DOCKED the topbar sheds its title + the two chips whose home is this pane (shell.css keys
// on `data-context-mode`), so the name lives in exactly one place while this band is on screen. Two lines
// are allowed (`line-clamp-2` + `text-balance` — the band owns the name's budget: the chips go BELOW the name,
// never beside it, DESIGN.md), and `title` carries the full string for the rare name longer than two lines.
// `deriveChatTitle` is the ONE title derivation the topbar identity already uses (a blank stored title never
// renders).
//
// THE CHIPS:
//   · MEMBERS — `RosterChipButton`, the topbar's own roster chip with the word beside the digit; it opens the
//     Members cell (the ONE roster doorway, chat-header §2/§9 — one chip, two mounts, one accessible name).
//   · MEMORY — `ChatRecallIndicator`, the standing recall control, mounted verbatim (its popover, its
//     aria-label and its pulse are its own; this band is only where it stands now).
//   · PRESET — the viewer's ACTIVE-for-generation preset by name. A chat carries NO preset binding (D58 rules
//     that impossible and a gate enforces it): the chip names the preset that governs generation for the
//     viewer in this room — `settings.config.seeds.defaultPresetId` (null = the built-in), resolved against
//     `preset.list` — the same two cache-first reads the preset library hub makes. Plain `useQuery`: the band
//     never suspends on its own account.

import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import type { ChatContextState, ChatContextTabId } from "#lib";
import { deriveChatTitle } from "#lib";
import { setContextTab, useContextTab } from "#state";
import { filterCharacters } from "../lib/roster.ts";
import { RosterChipButton } from "./chat-header.tsx";
import { ChatRecallIndicator } from "./chat-recall-indicator.tsx";

/** What the preset chip says while the built-in preset governs generation (the seed stores "no explicit
 *  preset" as `null`, never the built-in row's own id — `preset-library-surface.tsx`). */
const BUILT_IN_PRESET_LABEL = "Built-in preset";

export interface ChatContextBandProps {
  readonly state: ChatContextState;
}

/** The viewer's active preset NAME, cache-first (`undefined` while either read is still on its way — the
 *  chip then renders nothing rather than a guess). */
function useActivePresetName(): string | undefined {
  const trpc = useTRPC();
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const { data: presets } = useQuery(trpc.preset.list.queryOptions());
  if (settings === undefined) {
    return;
  }
  const activeId = settings.config.seeds.defaultPresetId;
  if (activeId === null) {
    return BUILT_IN_PRESET_LABEL;
  }
  return presets?.find((preset) => preset.id === activeId)?.name;
}

/** The Members cell's id — ONE spelling, read by both the chip's action and its is-this-the-view test. */
const MEMBERS_TAB = "members" satisfies ChatContextTabId;

/** Open the Members cell — the roster chip's action; the pane is already open when this band renders. */
function openMembersCell(): void {
  setContextTab(MEMBERS_TAB);
}

/** Is pressing the members chip a NO-OP right now (#878 F18)? That is the question the chip's SHAPE
 *  answers, and it has two arms:
 *   · the stored selection IS `members`; or
 *   · NOTHING is stored yet — the §4.1 resolver deliberately does not write the store when it falls back
 *     (the `ctx-tab-store` = "unset" at first paint, pinned in `context-bracket.ct.tsx`), and with no
 *     `defaultTab` flag it lands on the DECLARED-ORDER FIRST meta tab, which for a chat room is `members`
 *     (`chats-section.tsx`). So an unset store means the pane is sitting on Members.
 *  THE GAME-CHAT CASE IS NOT AN EXCEPTION, it is a non-case: `rpg.status` flags `defaultTab`, so a game
 *  room lands on Status — and a game room's band is the WAYSTONE (the rpg region claims the head band), so
 *  this component is not mounted there at all. RE-CHECK THIS if a normal room's meta tab ever takes a
 *  `defaultTab` flag; that is the one input that would make the second arm lie. */
function membersHoldsTheView(stored: string | null): boolean {
  return stored === null || stored === MEMBERS_TAB;
}

export function ChatContextBand({ state }: ChatContextBandProps): ReactElement {
  const cast = filterCharacters(state.participants);
  const title = deriveChatTitle(
    state.title,
    cast.map((c) => c.displayName),
  );
  const memberCount = state.participants.filter((p) => p.leftSeq === null).length;
  const presetName = useActivePresetName();
  const membersIsCurrent = membersHoldsTheView(useContextTab());
  return (
    <Stack gap="row" data-slot="chat-context-band" className="min-w-0">
      {/* A real heading — the pane's own h2, like the LIST band's — so the room is a landmark a rotor can jump
          to; the title step + semibold are the level's own, never a type axis picked here. */}
      <Heading level={2} data-slot="chat-context-band-title" className="line-clamp-2 text-balance" title={title}>
        {title}
      </Heading>
      <Row gap="field" align="center" className="flex-wrap">
        {/* THE MEMBERS CHIP IS A DATUM WHILE MEMBERS IS THE VIEW (#878 F18, side-eye 2026-08-30). It writes
            `setContextTab("members")` — and `members` is the tab the pane OPENS on, so at rest the most
            prominent actionable chip in the band did nothing visible until you had navigated away from the
            default. A door that is already open is not a door; it is a count. So the shape follows the
            state: while its target cell holds the view the chip renders as the same inert pill the preset
            wears (F12's grammar — a pill you cannot press), and it becomes the pressable outline chip again
            the moment the view is elsewhere. Derived from the ONE selection seam, never a second store. */}
        {membersIsCurrent ? (
          <Badge tone="soft" size="sm" intent="neutral" data-slot="chat-context-band-members">
            {memberCount === 1 ? "1 member" : `${memberCount} members`}
          </Badge>
        ) : (
          <RosterChipButton count={memberCount} onClick={openMembersCell} wordy={true} />
        )}
        {/* `wordy` here too (#878 F11): the mock draws a labelled `Memory idle` pill and the band shipped a
            bare squiggle — its accessible name was right and its visible name did not exist, which serves a
            screen-reader user and fails everyone reading the screen. The topbar mount stays glyph-only; the
            band has the room the topbar row does not. */}
        <ChatRecallIndicator chatId={state.chatId} viewerIsHost={state.isHost} wordy={true} />
        {presetName === undefined ? null : (
          <Badge tone="soft" size="sm" intent="neutral" data-slot="chat-context-band-preset" title="The preset that governs generation for you in this room">
            {presetName}
          </Badge>
        )}
      </Row>
    </Stack>
  );
}
