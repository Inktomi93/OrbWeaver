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
import { setContextTab } from "#state";
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

/** Open the Members cell — the roster chip's action; the pane is already open when this band renders. */
function openMembersCell(): void {
  setContextTab("members" satisfies ChatContextTabId);
}

export function ChatContextBand({ state }: ChatContextBandProps): ReactElement {
  const cast = filterCharacters(state.participants);
  const title = deriveChatTitle(
    state.title,
    cast.map((c) => c.displayName),
  );
  const memberCount = state.participants.filter((p) => p.leftSeq === null).length;
  const presetName = useActivePresetName();
  return (
    <Stack gap="row" data-slot="chat-context-band" className="min-w-0">
      {/* A real heading — the pane's own h2, like the LIST band's — so the room is a landmark a rotor can jump
          to; the title step + semibold are the level's own, never a type axis picked here. */}
      <Heading level={2} data-slot="chat-context-band-title" className="line-clamp-2 text-balance" title={title}>
        {title}
      </Heading>
      <Row gap="field" align="center" className="flex-wrap">
        <RosterChipButton count={memberCount} onClick={openMembersCell} wordy={true} />
        <ChatRecallIndicator chatId={state.chatId} viewerIsHost={state.isHost} />
        {presetName === undefined ? null : (
          <Badge tone="soft" size="sm" intent="neutral" data-slot="chat-context-band-preset" title="The preset that governs generation for you in this room">
            {presetName}
          </Badge>
        )}
      </Row>
    </Stack>
  );
}
