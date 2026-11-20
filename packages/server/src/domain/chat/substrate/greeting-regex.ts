// substrate/greeting-regex — the save pass on a seeded greeting. A card greeting is a character's reply that no
// generation wrote, so the host's AI_OUTPUT save scripts run on it before it is stored, as they run on a generated
// reply. The three greeting writes call this one helper: the founding greetings (`verbs/start-chat.ts`), a character
// added while the greeting window is open (`verbs/participants.ts`) and the step to a card alternate (`verbs/edit.ts`).
//
// The pass runs on the card's own text, never on a stored row, so a step to another alternate cannot apply it twice.
// The greeting text stays macro-raw (FLAG[greeting-macro], persistence/greeting-seed.ts): a pattern sees the
// greeting's `{{user}}` and `{{char}}` as written, while a pattern's own macros and a replacement's resolve against
// the room, `{{char}}` as the greeting's own character.
//
// The tiers resolve under the host, as on a turn (D19): a hostless room, or a host who no longer consents, stores the
// greeting as written. The save pass is not retroactive: a script attached later leaves a stored greeting alone.
//
// A greeting write must commit, so its gather never fails on retrieval: it skips recall and the databank when no
// script the pass runs can read them, and reads a failed retrieval as empty when one can.

import type { HostTierRegexAllow } from "@orb/contracts/chat";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import type { RandomSource } from "@orb/kit/macro";
import type { RegexPassCall } from "@orb/kit/regex";
import { regexCallReadsRetrieval } from "@orb/kit/regex";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../contract/context.ts";
import type { ResolveForeignInputsOp } from "../contract/foreign.ts";
import { buildTurnMacroContext } from "./assembly-access.ts";
import { classifyParticipant } from "./participant-actor.ts";
import { hostConsentOf, humanSeatPersonasOf } from "./participants-humans.ts";
import { resolveHostTierRegexScripts } from "./regex-tier.ts";

/** One greeting as the card wrote it, by the character that speaks it, under the card's name. */
interface GreetingText {
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly text: string;
}

/** What the greeting save pass reads off the room it seeds into. */
export interface GreetingRoom {
  readonly chatId: ChatId;
  /** The room's seats, founding rows included before they commit. */
  readonly participants: Parameters<typeof hostConsentOf>[1] & Parameters<typeof humanSeatPersonasOf>[0];
  readonly anchorPersonaId: PersonaId | null;
  readonly regexAllow: HostTierRegexAllow;
}

const GREETING_SAVE_CALL = { pass: "save", target: "AI_OUTPUT", edit: false } as const satisfies RegexPassCall;

/** The greeting save pass for one room: each greeting's text with the host's save scripts applied, in order. */
export type SaveGreetingTexts = <T extends GreetingText>(room: GreetingRoom, greetings: readonly T[]) => Promise<T[]>;

export function createSaveGreetingTexts(
  ctx: ChatContext,
  deps: { readonly resolveForeignInputs: ResolveForeignInputsOp; readonly prng: RandomSource },
): SaveGreetingTexts {
  return async (room, greetings) => {
    const consent = await hostConsentOf(ctx, room.participants);
    if (consent.kind !== "consents" || greetings.every(({ text }) => text.trim().length === 0)) {
      return [...greetings];
    }
    const { hostUserId, consentSet } = consent;
    const characterIds = room.participants.flatMap((seat) => {
      const actor = classifyParticipant(seat);
      return actor?.kind === "character" ? [actor.characterId] : [];
    });
    const foreign = await deps.resolveForeignInputs({
      chatId: room.chatId,
      runAsUserId: hostUserId,
      anchorPersonaId: room.anchorPersonaId,
      presentHumanUserIds: consentSet,
      humanSeats: humanSeatPersonasOf(room.participants, consentSet),
      trigger: { kind: "human", userId: hostUserId, personaId: room.anchorPersonaId },
      voice: "anchor",
    });
    const scripts = resolveHostTierRegexScripts({
      ...(await ctx.resolveRegexSources({ ownerId: hostUserId, presetId: foreign.presetId ?? null, characterIds, chatId: room.chatId })),
      allow: room.regexAllow,
    });
    if (scripts.length === 0) {
      return [...greetings];
    }
    const assembleContext = await ctx.gatherAssembleContext(
      {
        chatId: room.chatId,
        retrieval: regexCallReadsRetrieval(scripts, GREETING_SAVE_CALL) ? "degrade" : "none",
        // A greeting is a write the request commits whole, so only shutdown may end its gather.
        signal: ctx.backgroundSignal,
        runAsUserId: hostUserId,
        model: "",
        characterIds,
        personaIds: room.anchorPersonaId === null ? [] : [room.anchorPersonaId],
        timeZone: undefined,
        prng: deps.prng,
        choicePicks: "stable",
      },
      foreign,
    );
    const macroCtx = buildTurnMacroContext({ assembleCtx: assembleContext, model: "", chatId: room.chatId, random: deps.prng });
    return greetings.map((greeting) => ({
      ...greeting,
      // One pass per greeting: each is its own single text, as an edit's re-apply is.
      text: ctx.openRegexPass().execute({
        text: greeting.text,
        scripts,
        call: GREETING_SAVE_CALL,
        ctx: { ...macroCtx, char: greeting.characterName },
        onScriptFailure: (err, script) =>
          getLog(ctx.logger).warn(
            { err, target: "AI_OUTPUT", findRegex: script.findRegex },
            "chat: host-tier regex script failed on a greeting (D53 watchdog)",
          ),
      }),
    }));
  };
}
