// The chat CONTEXT pane's HEAD BAND — the room's identity in the context bracket's band slot (#860, owner-ruled
// 2026-08-30, D150): the room's TITLE over three
// chips — members · memory · preset. It is fed through chat's `defineContextTabs` `header` slot
// (`chats-section.tsx`), the slot CP-1 left empty "for CP-4's scene banner"; the Waystone band takes the same
// slot on a game chat through the rpg region claim. One slot, one content at a time, never a second head.
//
// THE TITLE'S ONE HOME MOVES HERE (#846 by relocation). The topbar identity used to be the only place the
// room was named, and at 1280×800 with both panes docked it rendered "Example — …" (104 of 220px). While the
// context pane is DOCKED the topbar sheds its title + the two chips whose home is this pane (shell.css keys
// on `data-context-mode`), so the name lives in exactly one place while this band is on screen. Two lines
// are allowed (`line-clamp-2` + `text-balance` — the band owns the name's budget: the chips go BELOW the name,
// never beside it, the mock design), and `title` carries the full string for the rare name longer than two lines.
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
//     never suspends on its own account, so the chip has THREE states and says which one it is in
//     (`PresetChipState`): a name, "still reading", or "could not name it". It never renders nothing —
//     absence was indistinguishable from a band that has no preset chip at all (#1502).

import { Badge } from "@orb/ui/badge";
import { Row, Stack } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import type { ChatContextState, ChatContextTabId } from "#lib";
import { deriveChatTitle, memberCountPhrase } from "#lib";
import { setContextTab, useContextTab } from "#state";
import { filterCharacters, presentMemberCount } from "../lib/roster.ts";
import { RosterChipButton } from "./chat-header.tsx";
import { ChatRecallIndicator } from "./chat-recall-indicator.tsx";

/** What the preset chip says while the built-in preset governs generation (the seed stores "no explicit
 *  preset" as `null`, never the built-in row's own id — `preset-library-surface.tsx`). */
const BUILT_IN_PRESET_LABEL = "Built-in preset";

export interface ChatContextBandProps {
  readonly state: ChatContextState;
}

/** What the preset chip says when the reads have SETTLED and still cannot name the preset — the list read
 *  failed, or the seed points at a preset that is no longer there. Either way the honest statement is that
 *  the name is unavailable, not that there is no preset. */
const UNNAMEABLE_PRESET_LABEL = "Preset unavailable";

/** What the chip says while the two reads are still on their way. The chip STAYS ON SCREEN saying this:
 *  rendering nothing is what made a loading band and a preset-less one look identical. */
const PENDING_PRESET_LABEL = "Preset…";

/**
 * The preset chip's state — THREE arms, because "we have not looked yet", "we looked and could not name
 * it" and "the built-in governs" are three different facts about the room (#1502).
 *
 * They used to collapse into one `string | undefined`, and the chip rendered nothing for `undefined`. A
 * band still fetching, a band whose `preset.list` read failed, and a band on a chat with no preset chip at
 * all were therefore pixel-identical — and the one of those three that is a real answer ("the built-in
 * preset governs generation for you here") never got to be told apart from the two that are not.
 */
type PresetChipState = { readonly kind: "pending" } | { readonly kind: "unnameable" } | { readonly kind: "named"; readonly name: string };

/** What the chip's `title` explains, per arm — a mapped Record over the union, so a fourth arm fails tsc
 *  here rather than shipping a chip with no explanation (§5.5). */
const PRESET_CHIP_TITLES: Record<PresetChipState["kind"], string> = {
  named: "The preset that governs generation for you in this room",
  pending: "Reading which preset governs generation for you in this room…",
  unnameable: "Couldn't name the preset that governs generation for you here — the preset list didn't load, or the one you had is gone",
};

/** The chip's visible text, per arm. */
function presetChipLabel(state: PresetChipState): string {
  if (state.kind === "named") {
    return state.name;
  }
  return state.kind === "pending" ? PENDING_PRESET_LABEL : UNNAMEABLE_PRESET_LABEL;
}

/** The viewer's active preset, cache-first. `pending` only while a read is genuinely still in flight —
 *  a SETTLED read that cannot produce a name is `unnameable`, never pending forever. */
function useActivePresetChip(): PresetChipState {
  const trpc = useTRPC();
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const presetsQuery = useQuery(trpc.preset.list.queryOptions());
  const settings = settingsQuery.data;
  if (settings === undefined) {
    return settingsQuery.isError ? { kind: "unnameable" } : { kind: "pending" };
  }
  const activeId = settings.config.seeds.defaultPresetId;
  if (activeId === null) {
    // The seed stores "no explicit preset" as `null`, never the built-in row's own id — this is an ANSWER,
    // and it needs no second read to be true.
    return { kind: "named", name: BUILT_IN_PRESET_LABEL };
  }
  const name = presetsQuery.data?.find((preset) => preset.id === activeId)?.name;
  if (name !== undefined) {
    return { kind: "named", name };
  }
  // A named preset the list has not yet delivered is PENDING; one the list settled without is UNNAMEABLE
  // (the read failed, or the seed points at a row that is gone).
  return presetsQuery.data === undefined && !presetsQuery.isError ? { kind: "pending" } : { kind: "unnameable" };
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
  const characters = filterCharacters(state.participants);
  const title = deriveChatTitle(
    state.title,
    characters.map((c) => c.displayName),
  );
  const memberCount = presentMemberCount(state.participants);
  const preset = useActivePresetChip();
  const membersIsCurrent = membersHoldsTheView(useContextTab());
  return (
    <Stack gap="row" data-slot="chat-context-band" className="min-w-0">
      {/* A real heading — the pane's own h2, like the LIST band's — so the room is a landmark a rotor can jump
          to; the title step + semibold are the level's own, never a type axis picked here. */}
      <Heading level={2} data-slot="chat-context-band-title" className="line-clamp-2 text-balance" title={title}>
        {title}
      </Heading>
      {/* THE CHIP ROW DOES NOT WRAP — IT SCROLLS (#899 N4, post-fix verification 2026-08-30). At a 383px
          pane it wrapped 2+1: `3 members` and `Memory — idle` on row one, `Built-in preset` alone on row
          two with the whole right half empty — the exact ragged-void shape #875 F14 had just fixed for
          the orb row, in the row directly above it. Same fix, same reason, and now the two rows of this
          band behave alike: only a set that folds EVENLY folds, everything else keeps its whole item and
          scrolls (`context-rail.tsx` `RAIL_TRACK_CLASSES`, the house ruling). */}
      <Row gap="field" align="center" className="min-w-0 overflow-x-auto">
        {/* THE MEMBERS CHIP IS A DATUM WHILE MEMBERS IS THE VIEW (#878 F18, side-eye 2026-08-30). It writes
            `setContextTab("members")` — and `members` is the tab the pane OPENS on, so at rest the most
            prominent actionable chip in the band did nothing visible until you had navigated away from the
            default. A door that is already open is not a door; it is a count. So the shape follows the
            state: while its target cell holds the view the chip renders as the same inert pill the preset
            wears (F12's grammar — a pill you cannot press), and it becomes the pressable outline chip again
            the moment the view is elsewhere. Derived from the ONE selection seam, never a second store. */}
        {membersIsCurrent ? (
          <Badge tone="soft" size="sm" intent="neutral" data-slot="chat-context-band-members">
            {memberCountPhrase(memberCount)}
          </Badge>
        ) : (
          <RosterChipButton count={memberCount} onClick={openMembersCell} wordy={true} />
        )}
        {/* `wordy` here too (#878 F11): the mock draws a labelled `Memory idle` pill and the band shipped a
            bare squiggle — its accessible name was right and its visible name did not exist, which serves a
            screen-reader user and fails everyone reading the screen. The topbar mount stays glyph-only; the
            band has the room the topbar row does not. */}
        <ChatRecallIndicator chatId={state.chatId} viewerIsHost={state.isHost} wordy={true} />
        {/* THE CHIP IS ALWAYS THERE, and it SAYS which of its three states it is in (#1502). It used to
            render nothing whenever the name was not in hand, so "still loading" and "the list read failed"
            were the same absence as a band that simply has no preset chip — the reader could not tell a
            missing answer from a missing feature, and the slot moved under them when the name arrived. The
            same inert `Badge` the members chip wears at rest carries all three; `data-preset-state` is the
            automatable fact, and the `title` says WHY on the two arms that are not an answer. */}
        <Badge
          tone="soft"
          size="sm"
          intent="neutral"
          data-slot="chat-context-band-preset"
          data-preset-state={preset.kind}
          title={PRESET_CHIP_TITLES[preset.kind]}
        >
          {presetChipLabel(preset)}
        </Badge>
      </Row>
    </Stack>
  );
}
