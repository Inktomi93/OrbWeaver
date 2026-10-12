// assembly/context — the character depthPrompt, muted seats, the retired room author's note, and the WORLD_INFO regex and host-tier union.

import type { CharacterCard } from "@orb/contracts/character";
import { cardDepthPromptSchema } from "@orb/contracts/character";
import { speakerKey } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG, promptConfigSchema } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { spliceInChatInjections } from "#server/domain/chat/assembly/injections.ts";
import { renderMacros } from "#server/domain/chat/assembly/macros.ts";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../_support.ts";
import type { ChatContext } from "./_context-support.ts";
import { attachChatEntry, besidesMarker, buildAssembleContext, cardOf, ctxWithCard, db, inputOf, regexScript } from "./_context-support.ts";

// ── Character's-Note-@-Depth (card `depthPrompt`) → per-member in_chat injection (the CHARACTER sibling of
//    the persona depth candidate) ────────────────────────────────────────────────────────────────────────
type DepthNote = NonNullable<CharacterCard["depthPrompt"]>;
function cardWithNote(name: string, note: DepthNote | null): CharacterCard {
  return { ...cardOf(name), depthPrompt: note };
}
/** A ChatContext whose getCard maps each characterId → its card (multi-member rooms). */
function ctxWithCards(byId: Record<string, CharacterCard>): ChatContext {
  return makeChatContext(db, {
    getCard: ({ characterId }) => Promise.resolve(byId[characterId] ?? null),
  });
}
/** The in_chat notes filtered by role != undefined would be ambiguous; select by known content instead. */

describe("buildAssembleContext — character depthPrompt (Character's Note @ Depth)", () => {
  test("a solo character's non-empty note injects exactly once as in_chat at its depth/role", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Aria stays cryptic.");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
    expect(out.authorsNoteSource).toBe("from Aria");
  });

  test("a null depthPrompt injects nothing + leaves authorsNoteSource unset", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", null));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    expect(besidesMarker(out.chatInjections)).toHaveLength(0);
    expect(out.authorsNoteSource).toBeUndefined();
  });

  test("an empty-prompt note (whitespace-only) injects nothing", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "   ", depth: 4, role: "system" }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    expect(besidesMarker(out.chatInjections)).toHaveLength(0);
    expect(out.authorsNoteSource).toBeUndefined();
  });

  test("an absent role defaults to system", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "no explicit role", depth: 3 }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    const note = (out.chatInjections ?? []).find((i) => i.content === "no explicit role");
    expect(note).toMatchObject({ position: "in_chat", depth: 3, role: "system" });
  });

  test("{{char}} in each member's note binds to THAT member (per-member render ctx)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({
      [ariaId]: cardWithNote("Aria", {
        prompt: "{{char}} guards a secret.",
        depth: 4,
        role: "system",
      }),
      [branId]: cardWithNote("Bran", { prompt: "{{char}} owes a debt.", depth: 2, role: "user" }),
    });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [ariaId, branId]));
    const contents = (out.chatInjections ?? []).map((i) => i.content);

    // Each note's {{char}} resolved to its OWN owner, not the primary character.
    expect(contents).toContain("Aria guards a secret.");
    expect(contents).toContain("Bran owes a debt.");
    const aria = (out.chatInjections ?? []).find((i) => i.content === "Aria guards a secret.");
    const bran = (out.chatInjections ?? []).find((i) => i.content === "Bran owes a debt.");
    expect(aria).toMatchObject({ depth: 4, role: "system" });
    expect(bran).toMatchObject({ depth: 2, role: "user" });
    expect(out.authorsNoteSource).toBe("merged (present characters)");
  });

  test("multiple notes at the SAME depth stack in roster order (primary first in the array)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({
      [ariaId]: cardWithNote("Aria", { prompt: "Aria note.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran note.", depth: 4, role: "system" }),
    });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [ariaId, branId]));
    const order = (out.chatInjections ?? []).map((i) => i.content);

    // Array order = output order for same-depth in_chat injections (the SHAPE splice is stable on ties):
    // primary (Aria) precedes the member (Bran), so the primary's note lands on top after the splice.
    expect(order.indexOf("Aria note.")).toBeLessThan(order.indexOf("Bran note."));
  });

  test("the note splices into runner history at its depth (SHAPE placement, N from the tail)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // The spliced row wears the user-note frame; the assertion reads the note's own text inside it.
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 2, role: "user" }));
    const built = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    const history = [1, 2, 3, 4, 5].map((n) => ({ role: "user" as const, content: `m${n}` }));
    const spliced = spliceInChatInjections(history, besidesMarker(built.chatInjections));
    // depth 2 → inserted 2 slots from the tail (index length-2 = 3 in the original 5-msg history).
    expect(spliced).toHaveLength(6);
    expect(spliced.findIndex((m) => m.content.includes("Aria stays cryptic."))).toBe(3);
  });

  // ── the note FRAMINGS are PRESET-homed (owner ruling 2026-08-07) ────────────────────────────────────
  // The frames used to be `UserSettings.prose` rows and reached assembly through `resolveChatProse` alone.
  // They now live in `promptConfig.prose` and reach it through `composeProse`, so the proof has to run the
  // WHOLE hop — a preset blob in, the delivered wire row out — not the framing function in isolation.
  //
  // The config is built through `promptConfigSchema.parse` of an untyped literal ON PURPOSE: that is the tier
  // that also compiles against the pre-ruling source, where the schema has no `prose` key and strips it. On
  // that source these assertions fail because the shipped frame ships — a real defect proof, not a type error.
  test("a preset's `prose` override reaches the DELIVERED note frame; an absent one is byte-identical", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "Keep it terse.", depth: 1, role: "user" }));
    const promptConfig = promptConfigSchema.parse({
      ...DEFAULT_PROMPT_CONFIG,
      prose: { "chat.injection.userNote": { text: "<<table rule — {{note}}>>", baseVersion: 1 } },
    });

    const built = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { promptConfig }));
    const history = [1, 2, 3].map((n) => ({ role: "user" as const, content: `m${n}` }));
    const framed = spliceInChatInjections(history, built.chatInjections, undefined, { prose: built.prose });
    expect(framed.map((r) => r.content)).toContain("<<table rule — Keep it terse.>>");

    // Same room, same note, DEFAULT preset: the shipped frame, byte-for-byte.
    const plain = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    const plainFramed = spliceInChatInjections(history, plain.chatInjections, undefined, { prose: plain.prose });
    expect(plainFramed.map((r) => r.content)).toContain(resolveProseText("chat.injection.userNote", {}, { note: "Keep it terse." }));
  });

  test("D66-B: assistant@depth-0 is ACCEPTED at the WRITE boundary; safety moved to the SHAPE delivery gate", () => {
    // The write-reject was REMOVED (W5, ruling A) — authored prefill is persistable. A stored
    // assistant@depth-0 note now round-trips the write schema; the SHAPE splice normalizes it to depth 1
    // (the only assistant placement both runners express) unless the model's `assistantPrefill` is honored.
    expect(cardDepthPromptSchema.safeParse({ prompt: "x", depth: 0, role: "assistant" }).success).toBe(true);
    expect(cardDepthPromptSchema.safeParse({ prompt: "x", depth: 1, role: "assistant" }).success).toBe(true);
  });
});

// ── the muted-character subset (`unmutedCharacters` → `{{groupNotMuted}}`, R1/F1): a muted seat (character OR agent)
//    stays in `characters` for its lore/soul but drops from the non-muted subset, keyed on the same seat `disabled`
//    axis `loadRoom` derives `mutedSpeakerKeys` from. `{{group}}` renders all; `{{groupNotMuted}}` the survivors.
describe("buildAssembleContext — unmutedCharacters / {{groupNotMuted}} (R1/F1)", () => {
  test("a muted character drops from unmutedCharacters / {{groupNotMuted}} but stays in characters / {{group}}", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({ [ariaId]: cardOf("Aria"), [branId]: cardOf("Bran") });
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [ariaId, branId], { mutedSpeakerKeys: new Set([speakerKey({ kind: "character", characterId: branId })]) }),
    );

    expect((out.characters ?? []).map((c) => c.name)).toEqual(["Aria", "Bran"]);
    expect((out.unmutedCharacters ?? []).map((c) => c.name)).toEqual(["Aria"]);
    expect(renderMacros("{{group}}", out, null)).toBe("Aria, Bran");
    expect(renderMacros("{{groupNotMuted}}", out, null)).toBe("Aria");
  });

  test("no muted seats ⇒ unmutedCharacters equals the full character set (byte-identical fallback)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({ [ariaId]: cardOf("Aria"), [branId]: cardOf("Bran") });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [ariaId, branId]));

    expect((out.unmutedCharacters ?? []).map((c) => c.name)).toEqual(["Aria", "Bran"]);
    expect(renderMacros("{{groupNotMuted}}", out, null)).toBe(renderMacros("{{group}}", out, null));
  });
});

// ── The RETIRED room author's note (owner ruling 2026-08-01). `roomOverrides.authorsNote` was a SECOND
//    producer of the same at-depth splice `chat_injections` already owns, so the arm was deleted: the
//    per-chat note is now just an injection (system @ depth 4 IS the author's note). These pin that the
//    branch is GONE — a room note can no longer suppress the characters' card notes, and the surviving door
//    lands at the identical position. ───────────────────────────────────────────────────────────────────
describe("buildAssembleContext — the room author's-note override is GONE (owner ruling 2026-08-01)", () => {
  test("a chat injection at depth 4 / system IS the author's note — same position, budget-exempt", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", null));
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        userInjections: [{ position: "in_chat", depth: 4, role: "system", content: "Keep it tense.", origin: "user" }],
      }),
    );

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Keep it tense.");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
    // No override arm survives to claim the trace slot — the label names CARD contributors only.
    expect(out.authorsNoteSource).toBeUndefined();
  });

  test("room overrides no longer suppress the character's card notes (the deleted branch)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const cards = {
      [ariaId]: cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran owes a debt.", depth: 2, role: "system" }),
    };
    const out = await buildAssembleContext(
      ctxWithCards(cards),
      inputOf(chatId, host, [ariaId, branId], {
        roomOverrides: { scenario: "a quiet tavern" },
        userInjections: [{ position: "in_chat", depth: 4, role: "system", content: "The chat note.", origin: "user" }],
      }),
    );
    const contents = (out.chatInjections ?? []).map((i) => i.content);

    // The chat-level note and BOTH card notes coexist — nothing suppresses anything.
    expect(contents).toContain("The chat note.");
    expect(contents).toContain("Aria stays cryptic.");
    expect(contents).toContain("Bran owes a debt.");
    expect(out.authorsNoteSource).toBe("merged (present characters)");
  });

  test("REGRESSION PIN: a set room override leaves the card notes byte-identical to the bare build", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const cards = {
      [ariaId]: cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran owes a debt.", depth: 2, role: "user" }),
    };
    const bare = await buildAssembleContext(ctxWithCards(cards), inputOf(chatId, host, [ariaId, branId]));
    const withOverride = await buildAssembleContext(
      ctxWithCards(cards),
      inputOf(chatId, host, [ariaId, branId], { roomOverrides: { scenario: "a quiet tavern" } }),
    );

    expect(withOverride.chatInjections).toStrictEqual(bare.chatInjections);
    expect(withOverride.authorsNoteSource).toBe(bare.authorsNoteSource);
    expect(bare.authorsNoteSource).toBe("merged (present characters)");
  });
});

describe("buildAssembleContext — WORLD_INFO regex runs through the watchdog (D53)", () => {
  test("a throwing watchdog skips the WORLD_INFO script (the entry content is unchanged)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "GOLD hoard" }); // always-scope, always fires
    // The injected watchdog THROWS → the kit executor's per-script try/catch skips it → "GOLD" survives. The
    // default native replace would have produced "SILVER", so the unchanged content proves the seam was used.
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      applyRegexReplace: () => {
        throw new Error("timed out");
      },
    });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { hostTierRegexScripts: [regexScript("w", "GOLD", "SILVER", "WORLD_INFO")] }));
    expect(out.worldInfoBefore).toContain("GOLD hoard");
  });
});

// F2: the WORLD_INFO leg read `promptConfig.regexScripts` — the PRESET slice — while every other shared leg
// (USER_INPUT here, AI_OUTPUT/REASONING in engine/pipeline) runs the RESOLVED host-tier union (D53:
// host-global ∪ chat-preset ∪ present characters, `substrate/regex-tier`). A host-global or card script whose
// placement includes WORLD_INFO (the settings default placement set INCLUDES it) therefore never fired.
describe("buildAssembleContext — the WORLD_INFO leg runs the RESOLVED host-tier union (F2, D53)", () => {
  test("a host-tier WORLD_INFO script rewrites the entry content", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "GOLD hoard" }); // always-scope, always fires
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { hostTierRegexScripts: [regexScript("w", "GOLD", "SILVER", "WORLD_INFO")] }));
    expect(out.worldInfoBefore).toContain("SILVER hoard");
    expect(out.worldInfoBefore).not.toContain("GOLD");
  });

  // ── THE PER-WI-ENTRY ORDER PIN (D121-E's order table) ────────────────────────────────────────────────
  // The law for this leg: macro render → WORLD_INFO regex → wiFormat wrap. Each of the three neighbours is
  // covered on its own elsewhere; this pins the CHAIN, so swapping any two breaks here. Order-as-prose
  // rots (the readout drifted on exactly this kind of claim), which is why the table gets an executable
  // twin per leg rather than a doc sentence.
  test("WI ENTRY ORDER: macros render → WORLD_INFO regex → wiFormat wrap, in that order", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // The entry's content is a MACRO. If regex ran first it would see the literal `{{char}}` and miss.
    await attachChatEntry(host, chatId, "k", { content: "{{char}} hoards GOLD" });
    const config = { ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "[Lore: {{entry}}]" } };
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      // The find pattern only matches the POST-macro text ("Aria hoards GOLD"), so a hit proves the macro
      // pass ran FIRST; the replacement would be re-wrapped if wiFormat had already run.
      hostTierRegexScripts: [regexScript("w", "Aria hoards GOLD", "Aria guards SILVER", "WORLD_INFO")],
    });

    // macros-then-regex: the macro resolved to the primary character AND the regex matched the resolved text.
    expect(out.worldInfoBefore).toContain("Aria guards SILVER");
    expect(out.worldInfoBefore).not.toContain("{{char}}");
    expect(out.worldInfoBefore).not.toContain("GOLD");
    // regex-then-wrap: the wiFormat scaffold is on the OUTSIDE, wrapping the rewritten body exactly once.
    expect(out.worldInfoBefore).toContain("[Lore: Aria guards SILVER]");
  });

  test("a WORLD_INFO script does NOT rewrite the wiFormat SCAFFOLD (the wrap is applied after it)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "plain body" });
    const config = { ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "[Lore: {{entry}}]" } };
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      // Targets the SCAFFOLD word, which only exists after the wrap. It must NOT match.
      hostTierRegexScripts: [regexScript("w", "Lore", "Legend", "WORLD_INFO")],
    });

    // The scaffold survives untouched — the script ran on the entry body, before the wrap existed.
    expect(out.worldInfoBefore).toContain("[Lore: plain body]");
    expect(out.worldInfoBefore).not.toContain("Legend");
  });

  test("the raw preset field is NOT a second source — only the resolved union feeds the leg", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "GOLD hoard" });
    const ctx = ctxWithCard(cardOf("Aria"));

    // D121-E: the WI leg consumes the RESOLVED UNION (F2's fix), which `assemble-gather` builds from the four
    // scope junctions via `ctx.resolveRegexSources`. This pin feeds the union directly — reading any single
    // scope here would be a second, differently-ordered source of the same set.
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      hostTierRegexScripts: [regexScript("w", "GOLD", "SILVER", "WORLD_INFO")],
    });
    // The union DID feed the leg: the entry's "GOLD hoard" came out rewritten.
    expect(out.worldInfoBefore).toContain("SILVER hoard");
  });
});
