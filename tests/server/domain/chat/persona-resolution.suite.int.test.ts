// persona-resolution — the INVARIANT SUITE for the persona {{user}}/{{persona}} resolution model.
// Cross-cutting (buildAssembleContext + assemblePrompt +
// renderHistoryMacros + the chat-lifecycle/roster verbs) — mirror-exempt (`.suite.int.test.ts`), same class as
// `solo-byte-identical.suite.int.test.ts`. This file does NOT re-litigate ground already pinned elsewhere — it
// adds the pieces that were missing:
//   • the FOUR WORKED EXAMPLES (§A.2), run end-to-end through the REAL renderer (buildAssembleContext →
//     assemblePrompt), not just the isolated `resolvePersonaDescriptionCandidates` unit shape.
//   • CARD {{persona}} → the anchor's description (§A.1's "orb pins the whole persona object" claim), the one
//     leg of the three-{{persona}}-contexts table not yet exercised at the assemble level.
//   • CANON FREEZE at the verb boundary — swapping the Chat persona (#3, `setParticipantActivePersona`) or
//     re-pinning the Anchor (#4, `setChatAnchorPersona`) must NEVER rewrite an existing `messages.personaId`
//     stamp. `reattributePersona` (edit.int.test.ts) is the ONLY writer — proven there; this file proves the
//     NEGATIVE (the other two verbs are silent on `messages`).
//
// Already pinned elsewhere (read, do not duplicate):
//   • the three {{user}} contexts' row-stamp-wins-over-both-anchor-and-active fixture, {{persona}} history
//     resolution, {{char}} row-stamp — assembly/macros.test.ts.
//   • both-personas dedup (byte-identical no-swap), the swap injecting into two slots, `descriptionPosition`
//     routing, the personaMarkerActive single-placement rule, per-persona no-cross-contamination —
//     assembly/context.int.test.ts "BOTH-PERSONAS" + "persona description placement" describes.
//   • the chat-open seed chain (explicit > connected > current > default, every rung) — verbs/start-chat.int.test.ts.
//   • setChatAnchorPersona host-gate / ownership / null-clears — verbs/chat-lifecycle.int.test.ts.
//   • send-time personaId stamp (PD-100: explicit ?? active) — verbs/turn.int.test.ts.
//   • reattributePersona as the sole history re-stamper — verbs/edit.int.test.ts.
import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { CharacterId, ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { assemblePrompt } from "../../../../packages/server/src/domain/chat/assembly/assemble.ts";
import { buildAssembleContext } from "../../../../packages/server/src/domain/chat/assembly/context.ts";
import { renderHistoryMacros } from "../../../../packages/server/src/domain/chat/assembly/macros.ts";
import type { ChatContext } from "../../../../packages/server/src/domain/chat/context.ts";
import type { ActiveTurns } from "../../../../packages/server/src/domain/chat/contract/active-turns.ts";
import type { HistoryMacroNames } from "../../../../packages/server/src/domain/chat/contract/results.ts";
import { createChatLifecycle } from "../../../../packages/server/src/domain/chat/verbs/chat-lifecycle.ts";
import { setParticipantActivePersona } from "../../../../packages/server/src/domain/chat/verbs/participants.ts";
import { freshDb } from "../../../support/db.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedPersona, seedUser } from "./_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** A minimal character card, description overridable — the worked examples put `{{user}}`/`{{persona}}`
 *  tokens INSIDE the card's own description field (the real-world card-author shape, per §A.2's "whose card
 *  description contains '{{user}} is my brother'"). */
function cardOf(name: string, description: string): CharacterCard {
  return {
    name,
    description,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
}

function ctxWithCard(card: CharacterCard): ChatContext {
  return makeChatContext(db, { getCard: () => Promise.resolve(card) });
}

function inputOf(
  chatId: ChatId,
  ownerId: UserId,
  castIds: CharacterId[],
  personas: Parameters<typeof buildAssembleContext>[1]["personas"],
): Parameters<typeof buildAssembleContext>[1] {
  return {
    chatId: castId(chatId),
    ownerId,
    characterIds: castIds,
    personaIds: [],
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas,
    recentMessages: [],
    userInjections: [],
    variableValues: {},
    model: "test-model",
    injectionTokenBudget: 0,
  };
}

/** Assemble against `DEFAULT_PROMPT_CONFIG` + flatten both halves — the default preset's `main_prompt`
 *  ("...ongoing roleplay with {{user}}...") is the PROMPT-context probe (renders against the ACTIVE persona,
 *  assemble.ts `renderOverridableMarker`); `char_description` (default template `{{description}}`, which
 *  recursively macro-expands a card field that itself contains `{{` — `kit/macro/registry.ts` `charField`)
 *  is the CARD-context probe (renders against the PINNED/anchor persona). */
async function assembledText(
  ctx: ChatContext,
  input: Parameters<typeof buildAssembleContext>[1],
): Promise<{ out: Awaited<ReturnType<typeof buildAssembleContext>>; full: string }> {
  const out = await buildAssembleContext(ctx, input);
  const prompt = assemblePrompt(DEFAULT_PROMPT_CONFIG, out);
  return { out, full: `${prompt.static}\n${prompt.dynamic}` };
}

/** This suite drives ONLY `setChatAnchorPersona`, which must never touch in-flight turns. `delete` is the
 *  one lifecycle verb that sweeps them (it aborts before dropping the row), so a REAL registry here would
 *  silently absorb an accidental reach — every arm throws instead, per `_support.ts`'s notStubbed idiom. */
const NO_TURNS: ActiveTurns = {
  register: (): never => {
    throw new Error("activeTurns.register: persona resolution must not touch in-flight turns");
  },
  abort: (): never => {
    throw new Error("activeTurns.abort: persona resolution must not touch in-flight turns");
  },
  abortAll: (): never => {
    throw new Error("activeTurns.abortAll: persona resolution must not touch in-flight turns");
  },
  countActive: (): never => {
    throw new Error("activeTurns.countActive: persona resolution must not touch in-flight turns");
  },
};

describe("THE FOUR WORKED EXAMPLES (FINAL-Persona §A.2 — the headline acceptance tests)", () => {
  test("worked example 1 — anchor=Alex, active=Alex: card AND prompt {{user}} both resolve to Alex", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "mary");
    const ctx = ctxWithCard(cardOf("Mary", "{{user}} is my brother"));
    const alex = { name: "Alex", description: "Alex is a doctor" };

    const { full } = await assembledText(ctx, inputOf(chatId, host, [charId], { anchor: alex, active: alex }));

    expect(full).toContain("Alex is my brother"); // card {{user}} → anchor
    expect(full).toContain("roleplay with Alex"); // prompt {{user}} → active
  });

  test("worked example 2 — swap (anchor=Alex, active=Steve): card stays Alex, prompt is Steve, and a pre-existing Alex-stamped message stays Alex in history", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "mary");
    const ctx = ctxWithCard(cardOf("Mary", "{{user}} is my brother"));
    const alex = { name: "Alex", description: "Alex is a doctor" };
    const steve = { name: "Steve", description: "Steve is a soldier" };

    const { out, full } = await assembledText(ctx, inputOf(chatId, host, [charId], { anchor: alex, active: steve }));

    // Card {{user}} is STILL Alex (Anchor unchanged — Mary is not told "Steve is my brother").
    expect(full).toContain("Alex is my brother");
    expect(full).not.toContain("Steve is my brother");
    // Prompt {{user}} is Steve (the live turn's speaker).
    expect(full).toContain("roleplay with Steve");
    expect(full).not.toContain("roleplay with Alex");

    // History: a message authored BEFORE the swap (stamped Alex) resolves {{user}} to Alex, not the
    // now-active Steve — the row's OWN stamp wins over `ctx.activePersona` (Chat-Macro-Resolution §2).
    const nateId = castId<PersonaId>("persona_nate");
    const producer: HistoryMacroNames = {
      characterNamesById: new Map<CharacterId, { name: string }>(),
      personaNamesById: new Map([[nateId, { name: "Alex", description: "Alex is a doctor" }]]),
    };
    const resolved = renderHistoryMacros(
      "{{user}} waves",
      { characterId: null, personaId: nateId },
      out, // out.activePersona is Steve — proves the fallback is NOT taken
      { producer },
    );
    expect(resolved).toBe("Alex waves");
  });

  test("worked example 3 — re-pin (anchor=Steve, active=Steve): card {{user}} TRANSFERS to Steve", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "mary");
    const ctx = ctxWithCard(cardOf("Mary", "{{user}} is my brother"));
    const steve = { name: "Steve", description: "Steve is a soldier" };

    // The re-pin lands as a fresh `personas.anchor` resolution (the composition root re-resolves the ANCHOR
    // off `chats.anchorPersonaId` after `setChatAnchorPersona` writes it — FLAG[cross-domain-inputs], this
    // producer's own header). This ties the DB-level re-pin (chat-lifecycle.int.test.ts) to its assemble-level
    // consequence: after the pin moves, the card relationship follows it.
    const { full } = await assembledText(ctx, inputOf(chatId, host, [charId], { anchor: steve, active: steve }));

    expect(full).toContain("Steve is my brother"); // the relationship TRANSFERRED to the new anchor
    expect(full).not.toContain("Alex is my brother");
  });

  test("worked example 4 (BROWN-HAIR) — the anchor's description survives a swap in card-context, then drops on re-pin", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "mary");
    const ctx = ctxWithCard(cardOf("Mary", "Mary the innkeeper"));
    const alex = { name: "Alex", description: "my hair is brown" };
    const steve = { name: "Steve", description: "Steve is a mage" };

    // Mid-swap: anchor=Alex (established card identity), active=Steve (the current speaker). the owner's
    // description reaches the model via the framed in_static card-context block (§A.6b gap #1) so the
    // character retains it even though Alex isn't speaking.
    const swapped = await assembledText(ctx, inputOf(chatId, host, [charId], { anchor: alex, active: steve }));
    expect(swapped.full).toContain("my hair is brown");

    // Re-pin: anchor becomes Steve too (== active) — the dedup rule (`sameProjectedPersona`) fires, the
    // anchor card-context block disappears (byte-identical to the no-swap case; context.int.test.ts pins the
    // dedup shape directly — this proves its CONSEQUENCE on the assembled text).
    const rePinned = await assembledText(ctx, inputOf(chatId, host, [charId], { anchor: steve, active: steve }));
    expect(rePinned.full).not.toContain("my hair is brown");
  });
});

describe("the three {{persona}} (description) contexts — identical routing to {{user}} (§A.1)", () => {
  test("CARD {{persona}} resolves the ANCHOR's description, never the active speaker's", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "mary");
    // The card's own description field uses {{persona}} — the "orb pins the whole persona object, not just a
    // name string" claim (§A.1): a card written with {{persona}} gets the ANCHOR's description, matching how
    // {{user}} in the same field gets the anchor's NAME.
    const ctx = ctxWithCard(cardOf("Mary", "About the user: {{persona}}"));
    const alex = { name: "Alex", description: "a traveling doctor" };
    const steve = { name: "Steve", description: "a hardened soldier" };

    const { full } = await assembledText(ctx, inputOf(chatId, host, [charId], { anchor: alex, active: steve }));

    expect(full).toContain("About the user: a traveling doctor"); // anchor's description
    expect(full).not.toContain("About the user: a hardened soldier"); // never the active's
  });
});

describe("canon freeze — swapping the Chat persona (#3) or the Anchor (#4) NEVER rewrites messages.personaId", () => {
  const emitted: ChatBusEvent[] = [];
  const emit = (event: ChatBusEvent): Promise<void> => {
    emitted.push(event);
    return Promise.resolve();
  };

  test("setParticipantActivePersona (Chat persona #3) leaves an existing message's personaId stamp untouched", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const alex = await seedPersona(db, host, "alex");
    const steve = await seedPersona(db, host, "steve");
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: host,
      personaId: alex,
      content: "{{user}} waves",
    });

    // The live swap: this chat's Chat persona flips Alex → Steve.
    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId: steve });

    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.personaId).toBe(alex); // untouched — canon is frozen
  });

  test("setChatAnchorPersona (Anchor #4 re-pin) leaves an existing message's personaId stamp untouched", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const alex = await seedPersona(db, host, "alex");
    const steve = await seedPersona(db, host, "steve");
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: host,
      personaId: alex,
      content: "{{user}} waves",
    });
    const life = createChatLifecycle(makeChatContext(db), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit,
      emitLive: (): void => undefined,
      activeTurns: NO_TURNS,
    });

    // The Anchor re-pin: this chat's card {{user}} moves Alex → Steve.
    await life.setChatAnchorPersona({ principal: principal(host), chatId, personaId: steve });

    const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(row?.personaId).toBe(alex); // untouched — only `reattributePersona` (edit.int.test.ts) may re-stamp
  });
});
