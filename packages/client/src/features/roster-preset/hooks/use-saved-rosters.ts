// The saved-roster reads: the library list (suspense — the picker body sits in a QueryBoundary) and the
// ACTIVE-room projection the picker's chat-scoped affordances gate on ("Add to this chat" / "Save current
// roster"). The room read is the `useSuspenseQueries` dynamic-array idiom (use-chat-context-state.ts's
// exact shape) so it suspends ONLY when a room is open; the cross-feature channel is `trpc.chat.getChat`
// (cache-first — the open room's detail is already warm), never a chat-feature import. Wire types come
// from `@orb/contracts/roster-preset` (one home); the active-room projection is deliberately UN-exported
// (no-inline-types — a consumer derives it via `ReturnType<typeof useActiveRosterChat>`).

import type { RulePresetId, RulePresetKnobValueInputs, RulePresetView } from "@orb/contracts/automation";
import { rulePresetKnobBagToInputs } from "@orb/contracts/automation";
import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import type { RpgGameTemplate } from "@orb/contracts/rpg";
import { skipToken, useQuery, useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import { useActiveChatId } from "#state";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;
type RoomRule = inferOutput<Trpc["automation"]["listRules"]>[number];

/** The caller's saved rosters, name-sorted (suspends; bus-driven fresh via `rosterPresetsChanged`). */
export function useSavedRosters(): readonly RosterPresetSummary[] {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.rosterPreset.list.queryOptions());
  return data;
}

/** The open room the picker's chat-scoped affordances act on — `null` when nothing is open. Carries the
 *  full detail (participants + group + anchor) because "Save this room's roster" snapshots exactly those.
 *  NOT exported as a named type — derive `NonNullable<ReturnType<typeof useActiveRosterChat>>`. */
interface ActiveRosterChat {
  readonly chatId: ChatDetail["id"];
  readonly isHost: boolean;
  readonly detail: ChatDetail;
}

export function useActiveRosterChat(): ActiveRosterChat | null {
  const chatId = useActiveChatId();
  const trpc = useTRPC();
  const chatQueries = useSuspenseQueries({
    queries: (chatId === null ? [] : [chatId]).map((id) => trpc.chat.getChat.queryOptions({ chatId: id })),
  });
  const chatQuery = chatQueries[0];
  if (chatId === null || chatQuery === undefined) {
    return null;
  }
  return { chatId, isHost: chatQuery.data.viewerIsHost === true, detail: chatQuery.data };
}

/** One captured rule as "Save this room's roster" sends it — the wire spec (id + the knob INPUT bag). */
export interface CapturedRosterRule {
  readonly rulePresetId: RulePresetId;
  readonly knobs: RulePresetKnobValueInputs;
}

/** The room's ENABLED rule presets, derived from `listRules` mint provenance (B10 §6.3): enabled rows
 *  carrying a `rulePresetId`, ONE spec per preset, the LATEST mint's bag winning a knob conflict (two
 *  live mints of one preset is the rare power case; the capture takes the current setting). Order
 *  follows the room's own rule positions (`listRules` is position-ordered; Map insertion preserves it).
 *  A hand-authored or hand-EDITED rule carries no provenance and is deliberately not capturable — a
 *  roster stores rule-preset instances, never raw CEL. */
function deriveEnabledRosterRules(rules: readonly RoomRule[]): CapturedRosterRule[] {
  const byPreset = new Map<RulePresetId, { readonly spec: CapturedRosterRule; readonly createdAt: number }>();
  for (const rule of rules) {
    if (!rule.enabled || rule.rulePresetId === null || rule.rulePresetKnobs === null) {
      continue;
    }
    const held = byPreset.get(rule.rulePresetId);
    if (held === undefined || rule.createdAt > held.createdAt) {
      byPreset.set(rule.rulePresetId, {
        spec: { rulePresetId: rule.rulePresetId, knobs: rulePresetKnobBagToInputs(rule.rulePresetKnobs) },
        createdAt: rule.createdAt,
      });
    }
  }
  return [...byPreset.values()].map((held) => held.spec);
}

/** The rule-preset CATALOGUE as every roster surface reads it — the picker's include-line, its apply
 *  reports, and the library editor all need the same two answers about a stored `rulePresetId`: what is it
 *  CALLED, and what do its knob keys MEAN (the knob labels the gloss is built from — `lib/roster-copy.ts`).
 *  One query key, so the surfaces share one cache entry. A stored id the catalogue no longer offers falls
 *  back to the raw id — degraded but visible, matching what the apply reports as a skip. */
export function useRulePresetCatalogue(enabled: boolean): {
  presetOf: (id: RulePresetId) => RulePresetView | undefined;
  titleOf: (id: RulePresetId) => string;
} {
  const trpc = useTRPC();
  const catalogueQuery = useQuery({ ...trpc.automation.listRulePresets.queryOptions(), enabled });
  const byId = new Map((catalogueQuery.data ?? []).map((preset) => [preset.id, preset]));
  return {
    presetOf: (id): RulePresetView | undefined => byId.get(id),
    titleOf: (id): string => byId.get(id)?.title ?? id,
  };
}

/** The save-roster surface's rules capture (B10's rules rider): the open HOST room's enabled rule presets,
 *  ready to ride `create`. The read gates on hosting (a member's `listRules` collapses to a leak-free
 *  NOT_FOUND server-side; the gate here just avoids asking a question whose answer is a designed refusal).
 *
 *  THE THREE ARMS ARE NAMED, not collapsed into a nullable (side-eye 2026-08-29 P2-3). `rules === null` for
 *  any un-settled read meant "loading", "this room has no rules" and "the read FAILED" rendered the same
 *  nothing — and since Save waits for the capture (a roster silently missing its rules is the worse failure),
 *  a failed `listRules` disabled "Save this room's roster" forever with no reason and no retry. `retry` is the
 *  affordance that arm owes. */
export interface RosterRuleCapture {
  readonly status: "loading" | "error" | "ready";
  /** The captured specs — empty on every arm but `ready`. */
  readonly rules: readonly CapturedRosterRule[];
  readonly retry: () => void;
}

export function useRosterRuleCapture(active: ActiveRosterChat | null): RosterRuleCapture {
  const trpc = useTRPC();
  const hostChatId = active !== null && active.isHost ? active.chatId : null;
  // `skipToken` keeps the key unbuilt for a non-host / no-room mount (the use-readout-binding gate idiom).
  const rulesQuery = useQuery(trpc.automation.listRules.queryOptions(hostChatId === null ? skipToken : { chatId: hostChatId }));
  const retry = (): void => {
    rulesQuery.refetch().catch(() => undefined); // the query's own error state carries the failure
  };
  if (rulesQuery.isError) {
    return { status: "error", rules: [], retry };
  }
  if (rulesQuery.data === undefined) {
    return { status: "loading", rules: [], retry };
  }
  return { status: "ready", rules: deriveEnabledRosterRules(rulesQuery.data), retry };
}

/** The open HOST room's game as "Save this room's roster" captures it (D264): `none` for a room without a game
 *  (nothing to offer), `loading` while the ruleset is read, `error` with a retry when the read failed, and
 *  `ready` with the template the roster stores. */
type RoomGameCapture =
  | { readonly status: "none" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | { readonly status: "ready"; readonly template: RpgGameTemplate };

export function useRoomGameCapture(active: ActiveRosterChat | null): RoomGameCapture {
  const trpc = useTRPC();
  const gameChatId = active !== null && active.isHost && active.detail.rpg !== null ? active.chatId : null;
  const gameQuery = useQuery(trpc.rpg.getGame.queryOptions(gameChatId === null ? skipToken : { chatId: gameChatId }));
  if (gameChatId === null) {
    return { status: "none" };
  }
  // A failed read must not hold Save forever: the error case lets the roster save without a game.
  if (gameQuery.isError) {
    return {
      status: "error",
      retry: (): void => {
        gameQuery.refetch().catch(() => undefined); // the query's own error state carries the failure
      },
    };
  }
  if (gameQuery.data === undefined) {
    return { status: "loading" };
  }
  return { status: "ready", template: { ruleset: gameQuery.data.publicConfig.ruleset } };
}
