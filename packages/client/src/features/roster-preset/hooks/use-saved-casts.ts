// The saved-cast reads: the library list (suspense — the picker body sits in a QueryBoundary) and the
// ACTIVE-room projection the picker's chat-scoped affordances gate on ("Add to this chat" / "Save current
// cast"). The room read is the `useSuspenseQueries` dynamic-array idiom (use-chat-context-state.ts's
// exact shape) so it suspends ONLY when a room is open; the cross-feature channel is `trpc.chat.getChat`
// (cache-first — the open room's detail is already warm), never a chat-feature import. Wire types come
// from `@orb/contracts/roster-preset` (one home); the active-room projection is deliberately UN-exported
// (no-inline-types — a consumer derives it via `ReturnType<typeof useActiveCastChat>`).

import type { RulePresetId, RulePresetKnobValueInputs } from "@orb/contracts/automation";
import { rulePresetKnobBagToInputs } from "@orb/contracts/automation";
import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import { skipToken, useQuery, useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import { useActiveChatId } from "#state";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;
type RoomRule = inferOutput<Trpc["automation"]["listRules"]>[number];

/** The caller's saved casts, name-sorted (suspends; bus-driven fresh via `rosterPresetsChanged`). */
export function useSavedCasts(): readonly RosterPresetSummary[] {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.rosterPreset.list.queryOptions());
  return data;
}

/** The open room the picker's chat-scoped affordances act on — `null` when nothing is open. Carries the
 *  full detail (participants + group + anchor) because "Save current cast" snapshots exactly those.
 *  NOT exported as a named type — derive `NonNullable<ReturnType<typeof useActiveCastChat>>`. */
interface ActiveCastChat {
  readonly chatId: ChatDetail["id"];
  readonly isHost: boolean;
  readonly detail: ChatDetail;
}

export function useActiveCastChat(): ActiveCastChat | null {
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

/** One captured rule as "Save current cast" sends it — the wire spec (id + the knob INPUT bag). */
export interface CapturedCastRule {
  readonly rulePresetId: RulePresetId;
  readonly knobs: RulePresetKnobValueInputs;
}

/** The room's ENABLED rule presets, derived from `listRules` mint provenance (B10 §6.3): enabled rows
 *  carrying a `rulePresetId`, ONE spec per preset, the LATEST mint's bag winning a knob conflict (two
 *  live mints of one preset is the rare power case; the capture takes the current setting). Order
 *  follows the room's own rule positions (`listRules` is position-ordered; Map insertion preserves it).
 *  A hand-authored or hand-EDITED rule carries no provenance and is deliberately not capturable — a
 *  cast stores rule-preset instances, never raw CEL. */
function deriveEnabledCastRules(rules: readonly RoomRule[]): CapturedCastRule[] {
  const byPreset = new Map<RulePresetId, { readonly spec: CapturedCastRule; readonly createdAt: number }>();
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

/** The save-cast surface's rules capture (B10's rules rider): the open HOST room's enabled rule
 *  presets, ready to ride `create` — plus the catalogue titles the include-line renders. Both reads
 *  gate on hosting (a member's `listRules` collapses to a leak-free NOT_FOUND server-side; the gate
 *  here just avoids asking a question whose answer is a designed refusal). `rules` is `null` until the
 *  reads settle — the surface disables Save on null rather than silently saving a rules-free cast. */
export function useCastRuleCapture(active: ActiveCastChat | null): { rules: readonly CapturedCastRule[] | null; titleOf: (id: RulePresetId) => string } {
  const trpc = useTRPC();
  const hostChatId = active !== null && active.isHost ? active.chatId : null;
  // `skipToken` keeps the key unbuilt for a non-host / no-room mount (the use-readout-binding gate idiom).
  const rulesQuery = useQuery(trpc.automation.listRules.queryOptions(hostChatId === null ? skipToken : { chatId: hostChatId }));
  const catalogueQuery = useQuery({ ...trpc.automation.listRulePresets.queryOptions(), enabled: hostChatId !== null });
  const titles = new Map((catalogueQuery.data ?? []).map((preset) => [preset.id, preset.title]));
  return {
    rules: rulesQuery.data === undefined ? null : deriveEnabledCastRules(rulesQuery.data),
    titleOf: (id): string => titles.get(id) ?? id,
  };
}
