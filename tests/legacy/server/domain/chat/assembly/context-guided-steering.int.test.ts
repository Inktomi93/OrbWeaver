// assembly/context — guided steering and its delivery depth, the new-chat marker, the owner-verified roster, and the immutable/pure ctx (§5).

import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG, promptConfigSchema } from "@orb/contracts/preset";
import { ZWSP } from "@orb/kit/guided";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../_support.ts";
import {
  attachCharacterEntry,
  attachChatEntry,
  buildAssembleContext,
  cardOf,
  ctxWithCard,
  db,
  inputOf,
  PARITY_CONCISE,
  PARITY_PAST,
} from "./_context-support.ts";

describe("buildAssembleContext — guided steering (the chat design doc §6)", () => {
  test("system placement (the default): the action template resolves to ctx.guidedInstruction — template macros live, untrusted {{input}} neutralized", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: {
        ...DEFAULT_GUIDED_ACTIONS,
        response: { prompt: "[Steer for {{char}}: {{input}}]", role: "system" as const },
      },
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "response", input: "watch the {{tone}} closely" },
    });
    // Template macros resolve ({{char}} → the primary character); the user's steering text is spliced in with
    // its braces ZWSP-neutralized (a typed {{tone}} can NEVER re-trigger macro evaluation).
    expect(out.guidedInstruction).toBe(`[Steer for Aria: watch the {${ZWSP}{tone}${ZWSP}} closely]`);
    // System placement adds NO injection.
    expect(out.chatInjections?.some((i) => i.content.includes("watch the"))).toBe(false);
  });

  test("inject placement: a depth-0 in_chat injection with the CHOSEN role (never pinned); no marker text", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: {
        action: "response",
        input: "be brief",
        placement: { kind: "inject", role: "assistant" },
      },
    });
    const guided = out.chatInjections?.find((i) => i.content.includes("be brief"));
    expect(guided).toMatchObject({ position: "in_chat", depth: 0, role: "assistant" });
    expect(out.guidedInstruction).toBeUndefined();
  });

  // P5 — the wand's one-shot GAME steers (`guided.gameSteer`): the kit template resolves through the
  // macro engine (rpg data macros read the gather feed) and lands as ONE depth-0 SYSTEM injection —
  // the ephemeral channel; `input` and the preset action config are ignored by design.
  test("P5 gameSteer twist: the kit template resolves rpg macros from the gather feed → depth-0 system injection; input ignored", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      rpgMacros: { rpgSceneState: "Scene: the tavern", rpgQuests: "- Find the bone key" },
      guided: { action: "response", input: "MUST-NOT-APPEAR", gameSteer: "twist" },
    });
    const steer = out.chatInjections?.find((i) => i.content.includes("complication"));
    expect(steer).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    // The template's {{rpgSceneState}}/{{rpgQuests}} resolved against the staged feed (live state).
    expect(steer?.content).toContain("the tavern");
    expect(steer?.content).toContain("Find the bone key");
    // `input` is IGNORED on the gameSteer arm (the wire carries only the enum kind).
    expect(steer?.content).not.toContain("MUST-NOT-APPEAR");
    // Never the marker channel — the game steer is an ephemeral injection, not the preset's guided slot.
    expect(out.guidedInstruction).toBeUndefined();
  });

  test("P5 gameSteer choices: the one-shot 'Offer choices' steer teaches the :::choices fence for THIS turn", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", gameSteer: "choices" },
    });
    const steer = out.chatInjections?.find((i) => i.content.includes(":::choices"));
    expect(steer).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    expect(out.guidedInstruction).toBeUndefined();
  });

  test("F2: a scaffold-only action (response) with a BLANK steer injects NOTHING (no dangling scaffold)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "" },
    });
    // Neither arm fires: no `{{guided_instruction}}` value and no depth-0 guided injection.
    expect(out.guidedInstruction).toBeUndefined();
    expect(out.chatInjections?.some((i) => i.content.includes("special consideration"))).toBe(false);
  });

  // ── ARM B: the Rewrite modal's toggle KINDS compose SERVER-side (the templating fork, owner 2026-08-09) ──
  // The client used to join `REWRITE_TOGGLES[].fragment` in the browser and ship the composed string. It now
  // ships the picked ids; assembly resolves each id's `preset.rewriteToggle.*` slot against the turn's prose
  // and runs the SAME pure join. These three pin the whole property set: BYTE PARITY with what the browser
  // used to send, CATALOG order regardless of wire order, and a host override actually reaching the model.
  test("ARM B byte parity: server-composed toggle bytes equal the old client-composed steer, in CATALOG order", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      // WIRE ORDER is reversed on purpose — the composed order is the CATALOG's.
      guided: { action: "rewrite", input: "keep the plot beats", rewriteToggles: ["past-tense", "concise"] },
    });
    // The exact string `composeRewriteSteer` produced in the browser pre-fork, now spliced as the rewrite
    // template's `{{input}}` (system role ⇒ the marker value). The DOUBLE period after the free text is
    // byte-parity, not a defect: the composer terminates the steer and the template's own `{{input}}.`
    // follows it — the same two characters the pre-fork wire produced.
    expect(out.guidedInstruction).toBe(
      `[OOC: Answer me out of character. Don't continue the RP. Instead, rewrite Aria's last response to reflect the following: ${PARITY_CONCISE}. ${PARITY_PAST}. keep the plot beats.. Don't make any other changes besides this.]`,
    );
  });

  test("ARM B: toggles alone (no typed text) compose a complete steer; no toggles is byte-identical to a plain steer", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const togglesOnly = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "rewrite", rewriteToggles: ["concise"] },
    });
    expect(togglesOnly.guidedInstruction).toContain(`${PARITY_CONCISE}.`);

    // The un-toggled path is the pre-fork path, unchanged: the free text rides verbatim.
    const plain = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "rewrite", input: "keep the plot beats" },
    });
    expect(plain.guidedInstruction).toContain("following: keep the plot beats.");
    expect(plain.guidedInstruction).not.toContain("concise");
  });

  test("ARM B: a preset's prose OVERRIDE of a toggle slot reaches the model — which is the point of slotting them", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    // Parsed from an untyped literal so this tier also compiles against the pre-fork source (where the wire
    // has no `rewriteToggles` and the slot does not exist) — there it fails on the BYTES, not on types.
    const promptConfig = promptConfigSchema.parse({
      ...DEFAULT_PROMPT_CONFIG,
      prose: { "preset.rewriteToggle.concise": { text: "Cut it to the bone", baseVersion: 1 } },
    });
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId], { promptConfig }),
      guided: { action: "rewrite", rewriteToggles: ["concise"] },
    });
    expect(out.guidedInstruction).toContain("Cut it to the bone.");
    expect(out.guidedInstruction).not.toContain(PARITY_CONCISE);
  });

  test("F2: a standalone action (impersonate) with a BLANK steer STILL fires unsteered", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "impersonate", input: "" },
    });
    // The default impersonate template carries a standalone instruction (role system → the marker value).
    expect(out.guidedInstruction).toBeDefined();
    expect(out.guidedInstruction?.length ?? 0).toBeGreaterThan(0);
  });

  // §10 addendum / F8: a system-placement steer against a preset with NO `guided_instruction` marker used
  // to land NOWHERE (the marker never renders `ctx.guidedInstruction`). Now it falls back to a depth-0
  // injection on the same ChatInjection channel + flips the loud-warning flag the engine reads.
  test("F8: marker PRESENT (default) — system steer still lands via ctx.guidedInstruction, NO fallback, NO injection", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "be brief" },
    });
    expect(out.guidedInstruction).toBeDefined();
    expect(out.guidedPlacedAsInjection).not.toBe(true);
    expect(out.chatInjections?.some((i) => i.content.includes("be brief"))).toBe(false);
  });

  test("F8: marker ABSENT — a system steer FALLS BACK to a depth-0 system injection + flags the loud warning (never vanishes)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    // Strip the guided_instruction marker from the preset — the config-editor's "no marker" case.
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      sections: DEFAULT_PROMPT_CONFIG.sections.filter((s) => !(s.type === "marker" && s.marker === "guided_instruction")),
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "response", input: "be brief" },
    });
    // The marker home is gone, so nothing is staged there…
    expect(out.guidedInstruction).toBeUndefined();
    // …instead the resolved steer rides a depth-0 SYSTEM injection (the convergence channel).
    const guided = out.chatInjections?.find((i) => i.content.includes("be brief"));
    expect(guided).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    // …and the loud-warning signal is set (the engine emits `guided_placed_as_injection` off this).
    expect(out.guidedPlacedAsInjection).toBe(true);
  });

  test("F8: marker DISABLED (present but off) — same fallback as absent", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      sections: DEFAULT_PROMPT_CONFIG.sections.map((s) => (s.type === "marker" && s.marker === "guided_instruction" ? { ...s, enabled: false } : s)),
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "response", input: "be brief" },
    });
    expect(out.guidedInstruction).toBeUndefined();
    expect(out.chatInjections?.find((i) => i.content.includes("be brief"))).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    expect(out.guidedPlacedAsInjection).toBe(true);
  });

  test("the per-action config role decides the DEFAULT placement (role:user → a depth-0 user injection)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: {
        ...DEFAULT_GUIDED_ACTIONS,
        impersonate: { prompt: "[As {{user}}: {{input}}]", role: "user" as const },
      },
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "impersonate", input: "storm out" },
    });
    const guided = out.chatInjections?.find((i) => i.content.includes("storm out"));
    expect(guided).toMatchObject({ position: "in_chat", depth: 0, role: "user" });
    expect(out.guidedInstruction).toBeUndefined();
  });
});

describe("buildAssembleContext — immutable/pure (§5)", () => {
  test("two calls with the same inputs produce equal injection lists (deterministic, no mutation)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "LORE" });
    const ctx = ctxWithCard(cardOf("Aria"));
    const a = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    const b = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(a.chatInjections).toEqual(b.chatInjections);
    // The characters resolved via the injected getCard (D28) — the primary is the first card.
    expect(a.character.name).toBe("Aria");
  });
});

// ── G10: the guided action's own delivery DEPTH (redesign §5.0 — depth is a delivery property) ─────
describe("buildAssembleContext — guided delivery depth (G10)", () => {
  test("an action's `depth` rides its in_chat injection; absent stays the tail (byte-identical)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const withDepth = {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "[Steer: {{input}}]", role: "user" as const, depth: 4 } },
    };

    const deep = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: withDepth,
      guided: { action: "response", input: "be brief" },
    });
    expect(deep.chatInjections?.find((i) => i.content.includes("be brief"))).toMatchObject({ position: "in_chat", depth: 4, role: "user" });

    const noDepth = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: { ...withDepth, guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "[Steer: {{input}}]", role: "user" as const } } },
      guided: { action: "response", input: "be brief" },
    });
    expect(noDepth.chatInjections?.find((i) => i.content.includes("be brief"))?.depth).toBe(0);
  });
});

// ── G9: the new-chat boundary marker (`formatStrings.newChatMarker`; ST `new_chat_prompt`) ─────────────────
// Owner ruling: the marker ships ON as `[Start a new chat]` and is always a USER row at the top of the history, so
// a greeting-first chat opens on a user row on every route. The text is editable; the role is not.
describe("buildAssembleContext — the new-chat marker (G9)", () => {
  test("the shipped default emits one USER injection at the TOP of the history", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const out = await buildAssembleContext(ctxWithCard(cardOf("Aria")), inputOf(chatId, host, [charId]));
    const markers = out.chatInjections?.filter((i) => i.origin === "new-chat-marker") ?? [];
    // MAX_SAFE_INTEGER is "the top of the history" — the SHAPE splice clamps it to the history length.
    expect(markers).toMatchObject([{ position: "in_chat", depth: Number.MAX_SAFE_INTEGER, role: "user", content: "[Start a new chat]" }]);
  });

  test("SET: the preset's own text, macros resolved, still a user row", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const out = await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
      ...inputOf(chatId, host, [charId]),
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, formatStrings: { newChatMarker: "[Start of the chat with {{char}}.]" } },
    });
    const marker = out.chatInjections?.find((i) => i.origin === "new-chat-marker");
    expect(marker).toMatchObject({ position: "in_chat", depth: Number.MAX_SAFE_INTEGER, role: "user" });
    expect(marker?.content).toBe("[Start of the chat with Aria.]");
  });

  test("a BLANK stored marker inherits the shipped text (format strings are blank-means-default)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const out = await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
      ...inputOf(chatId, host, [charId]),
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, formatStrings: { newChatMarker: "   " } },
    });
    expect(out.chatInjections?.find((i) => i.origin === "new-chat-marker")?.content).toBe("[Start a new chat]");
  });
});

// ── #1396: GATHER runs on the OWNER-VERIFIED roster, not the raw input ids ───────────────────────────
// `buildAssembleContext` already resolves every input characterId to a card under `input.ownerId` and keeps
// only the ones that came back (`present`) — then handed `input.characterIds` to the WI pool anyway, so a
// card the owner-scoped read REFUSED still contributed its character-scope lore to the prompt. The filtered
// roster it had already computed is the honest input. Both belts are kept (the pool's own owner predicate is
// pinned in `world-info/pool.int.test.ts`): this one is about WHICH IDS, that one about WHOSE BOOK.
describe("buildAssembleContext — the WI pool receives the owner-verified roster (#1396)", () => {
  test("SECURITY: a character whose owner-scoped card read RESOLVED NOTHING contributes no character-scope lore", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const aria = await seedCharacter(db, host, "aria");
    const ghost = await seedCharacter(db, host, "ghost");
    // Both books are the HOST's own, so the pool's owner predicate cannot be what drops the ghost's lore —
    // only the roster filter can. (With one belt doing both jobs this test would pass for the wrong reason.)
    await attachCharacterEntry(host, aria, "seen", "ARIA LORE");
    await attachCharacterEntry(host, ghost, "unseen", "GHOST LORE");
    // The owner-scoped card read answers for `aria` and REFUSES `ghost` (deleted mid-turn / not this owner's).
    const ctx = makeChatContext(db, { getCard: ({ characterId }) => Promise.resolve(characterId === aria ? cardOf("Aria") : null) });

    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [aria, ghost]));

    // An always-scope entry lands in the system-half anchor text (`worldInfoBefore`), not `chatInjections`.
    const lore = `${out.worldInfoBefore ?? ""}\n${out.worldInfoAfter ?? ""}`;
    expect(lore).toContain("ARIA LORE");
    expect(lore).not.toContain("GHOST LORE");
    // …and the ghost never even reached the pool, so it is not a budget drop either.
    expect(out.wiTrace?.included).toBe(1);
  });
});
