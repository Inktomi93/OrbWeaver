// THE GM-VOICE KNOB (#1032, the viewgap WIRE batch) — `rpg_games.gmPresetId`, the ONE genuinely per-room
// preset binding there is (`entry/compose/preset-usage.ts`), and until now the only knob on `RpgConfigView`
// with no control anywhere. The view served it, the write door took it (`updateConfig({gmPresetId})`), the
// turn assembled it (`chat-ops/index.ts::resolvePresetOverride`), the preset library counted rooms by it
// (`preset.listUsage` → the usage readout's "GM VOICE" rows) — and a host could reach it from nothing. It is
// the #320/#321 dropped-knob family: stored, wired, editor-less.
//
// IT IS NOT IN THE SCALAR AUTOSAVE FORM, for the `RpgRulesetControl` reason plus one of its own: that form
// writes its whole value bag on every save, and this knob's options come from a REMOTE list (`preset.list`)
// that can be in flight or can have lost the row this game points at. A path-scoped
// `updateConfig({gmPresetId})` on change is the same shape the ruleset control and the trackers/hints
// editors use — one knob per commit.
//
// THE DANGLING ARM IS SHOWN, NEVER SILENTLY RESET. A game can point at a preset the viewer no longer owns
// (a delete, or a host handoff whose heal has not run — `chat-ops/handoff-heal.ts` nulls exactly this). The
// picker renders that id as its own degraded option rather than displaying "your default", which would be a
// lie about what the next turn will assemble, and rather than writing a clear the host never asked for.
// Same posture the roster surfaces take for a rule preset the catalogue has lost.
//
// THE WORD IS "GM VOICE", AND THAT IS NOT A BREACH OF THE NO-GM RULE. `rpg-game-tab.tsx`'s header rules
// that the PERSON running a lite room is the HOST, never the GM, and every user-visible string in that
// console obeys it. This knob does not name a person: it names the preset a game's turns speak in, and
// "GM voice" is already the app's live user-facing word for exactly this binding — the preset panel's
// usage readout says it in shipped copy ("…unless a game points its GM voice somewhere else",
// `features/preset/components/readout/usage-readout.tsx`). Minting a second word for one concept, one
// screen apart, would be the worse outcome; the two surfaces say the same thing.

import type { RpgConfigView } from "@orb/contracts/rpg";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useUpdateConfig } from "../hooks/use-rpg-mutations.ts";
import { Kicker } from "./rpg-kicker.tsx";

/** The "no override" arm's option value. The knob's absence IS a `null` column, and a Select deals in
 *  strings — this is the one place the two vocabularies meet, so the mapping lives here and nowhere else. */
const NO_OVERRIDE = "";

/** The options the host can pick from: the no-override arm, the readable library, and — only when the game
 *  points somewhere the library cannot name — the dangling id as its own visibly-degraded row. */
function gmVoiceItems(presets: readonly { readonly id: PresetId; readonly name: string }[] | undefined, current: string | null): SelectItems<string> {
  const items = [
    { value: NO_OVERRIDE, label: "Your own preset", description: "Turns in this room assemble whichever preset is active for you — nothing is pinned." },
    ...(presets ?? []).map((preset) => ({ value: preset.id, label: preset.name })),
  ];
  if (current !== null && !(presets ?? []).some((preset) => preset.id === current)) {
    items.push({
      value: current,
      label: current,
      description: "This game points at a preset you can't read any more — it was deleted, or it belongs to the previous host.",
    });
  }
  return items;
}

/** The GM-voice preset redirect — the one per-room preset binding (rpg §4.11 #1). */
export function RpgGmVoice({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const { data: presets } = useQuery(trpc.preset.list.queryOptions());
  const current = config.gmPresetId;
  return (
    <Stack gap="field" data-slot="rpg-gm-voice">
      <Kicker>GM voice</Kicker>
      <Select
        aria-label="GM voice preset"
        // The list is what makes the choice answerable; offering a picker over nothing invites a pick that
        // silently means "clear it". The current value still shows while it loads.
        disabled={presets === undefined}
        items={gmVoiceItems(presets, current)}
        value={current ?? NO_OVERRIDE}
        onValueChange={(next): void => {
          const picked = typeof next === "string" ? next : NO_OVERRIDE;
          if (picked === (current ?? NO_OVERRIDE)) {
            return; // re-picking the shown value is not an edit — never spend a write on it.
          }
          updateConfig.mutate({ chatId, gmPresetId: picked === NO_OVERRIDE ? null : castId<PresetId>(picked) });
        }}
      />
      <Text voice="gloss">
        The preset a turn in this room assembles. Pinning one here changes this room only — your own active preset, and every other room, are untouched.
      </Text>
    </Stack>
  );
}
