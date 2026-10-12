// assembly/context — the null-anchor fallback, persona description placement, the both-personas swap rule and the people block.

import type { AssembleContext, AssemblePersona } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { assemblePrompt } from "#server/domain/chat/assembly/assemble.ts";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../_support.ts";
import type { InputOver } from "./_context-support.ts";
import { attachChatEntry, besidesMarker, buildAssembleContext, cardOf, ctxWithCard, db, inputOf } from "./_context-support.ts";

describe("buildAssembleContext — the null-anchor fallback (dual-persona rule)", () => {
  const alice = { name: "Alice", description: "a bold captain" };
  const bob = { name: "Bob", description: "a quiet scholar" };

  test("no anchor: the ACTIVE persona anchors card-derived {{user}} (never the literal 'User')", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active: alice },
    });

    // The pinned (card-POV) slot fell back to the active persona — {{user}} in card text is Alice.
    expect(out.pinnedPersona).toEqual(alice);
    expect(out.activePersona).toEqual(alice);
  });

  test("a SET anchor holds (no fallback): card POV stays the anchor while active differs", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: bob, active: alice },
    });

    expect(out.pinnedPersona).toEqual(bob);
    expect(out.activePersona).toEqual(alice);
  });

  test("no personas at all: both slots stay null (the macro layer's 'User' floor is the last resort)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    expect(out.pinnedPersona).toBeNull();
    expect(out.activePersona).toBeNull();
  });
});

describe("buildAssembleContext — persona description placement (FINAL-Persona §A.6b gap #1)", () => {
  test("at_depth: the ACTIVE persona's description rides an in_chat ChatInjection; the {{persona}} marker is silenced", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "at_depth", depth: 3, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    const injected = (out.chatInjections ?? []).find((i) => i.content === "a wandering scholar");
    expect(injected).toMatchObject({ position: "in_chat", depth: 3, role: "system" });
    // The single-placement rule: at_depth SILENCES the {{persona}} marker so it can't ALSO emit.
    expect(out.personaMarkerActive).toBe(false);
  });

  test("in_prompt (the default): no ChatInjection is emitted — the description rides {{persona}} only", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "in_prompt" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    expect(besidesMarker(out.chatInjections)).toEqual([]);
    // {{persona}} still resolves off the SAME AssemblePersona (macros.test.ts pins the macro-layer half).
    expect(out.activePersona?.description).toBe("a wandering scholar");
    // in_prompt ⇒ the marker EMITS the description (the prompt slot).
    expect(out.personaMarkerActive).toBe(true);
  });

  test("none: no ChatInjection is emitted AND the {{persona}} marker is silenced (ST opt-out)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "none" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    expect(besidesMarker(out.chatInjections)).toEqual([]);
    expect(out.personaMarkerActive).toBe(false);
  });

  test("no placement set (a fixture/legacy caller): degrades to the in_prompt no-op (marker emits, no injection)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = { name: "Nyx", description: "a wandering scholar" };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    expect(besidesMarker(out.chatInjections)).toEqual([]);
    expect(out.personaMarkerActive).toBe(true);
  });

  // The single-placement rule proven END-TO-END through assemblePrompt: at_depth must not ALSO surface in
  // the system prompt via the {{persona}} marker (the default preset ships an enabled persona marker).
  test("at_depth does NOT double-emit: the description is absent from the assembled system prompt", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });
    const prompt = assemblePrompt(DEFAULT_PROMPT_CONFIG, out);
    // The description rode the in_chat injection (SHAPE splices it), so the marker-driven system halves omit it.
    expect(`${prompt.static}\n${prompt.dynamic}`).not.toContain("a wandering scholar");
  });

  test("in_prompt DOES emit the description via the {{persona}} marker in the assembled system prompt", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "in_prompt" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });
    const prompt = assemblePrompt(DEFAULT_PROMPT_CONFIG, out);
    expect(`${prompt.static}\n${prompt.dynamic}`).toContain("a wandering scholar");
  });
});

describe("buildAssembleContext — the BOTH-PERSONAS context rule on a swap (FINAL-Persona §A.6b gap #1)", () => {
  test("no swap (anchor == active): ONE injection, byte-identical to the solo (anchor-null) output", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "at_depth", depth: 3, role: "system" } as const,
    };

    const solo = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });
    // anchor is the SAME persona (a fresh structurally-equal projection, as loadPersona would produce).
    const noSwap = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: { ...active }, active },
    });

    // The solo invariant: the anchor adds NOTHING when it is the active persona.
    expect(noSwap.chatInjections).toEqual(solo.chatInjections);
    expect(noSwap.personaMarkerActive).toBe(solo.personaMarkerActive);
    expect(besidesMarker(noSwap.chatInjections).length).toBe(1);
  });

  test("swap: ACTIVE injects per its own config (in_chat), ANCHOR injects in card-context (in_static, framed)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const anchor = {
      name: "Alex",
      description: "Alex is a knight",
      placement: { kind: "in_prompt" } as const,
    };
    const active = {
      name: "Steve",
      description: "Steve is a mage",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor, active },
    });
    const injections = out.chatInjections ?? [];

    // ACTIVE (prompt-context) — its own at_depth config, UNFRAMED.
    const activeInj = injections.find((i) => i.position === "in_chat");
    expect(activeInj?.content).toBe("Steve is a mage");
    expect(activeInj).toMatchObject({ depth: 2, role: "system" });
    expect(activeInj?.content).not.toContain("The person the character knows");

    // ANCHOR (card-context) — a FIXED in_static system block, framed as the established identity.
    const anchorInj = injections.find((i) => i.position === "in_static");
    expect(anchorInj).toMatchObject({ position: "in_static", role: "system" });
    expect(anchorInj?.content).toContain("Alex is a knight");
    expect(anchorInj?.content).toContain("The person the character knows as the user is Alex");
  });

  // PROSE-1 census 74 — the lead-in clause is a per-USER slot resolved against the ROOM HOST through
  // `ctx.resolveChatProse`; the brackets, the name and the description stay the injection's grammar.
  test("swap: a host override REPLACES the anchor identity lead-in, keeping the name/description frame", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      resolveChatProse: () => Promise.resolve({ "chat.assembly.anchorIdentity": { text: "Your operator is", baseVersion: 1 } }),
    });

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: {
        anchor: { name: "Alex", description: "Alex is a knight", placement: { kind: "in_prompt" } as const },
        active: { name: "Steve", description: "Steve is a mage", placement: { kind: "at_depth", depth: 2, role: "system" } as const },
      },
    });

    const anchorInj = (out.chatInjections ?? []).find((i) => i.position === "in_static");
    expect(anchorInj?.content).toBe("[Your operator is Alex: Alex is a knight]");
  });

  // The host's prose must reach the DOWNSTREAM stages too (the merged co-speaker headings in the BUILD walk,
  // the note frames in the SHAPE splice, the round nudge in the driver) — all of which read it off the ONE
  // immutable ctx rather than re-resolving the host. This pins the carry + the system-block frame together.
  test("the resolved host prose is CARRIED on the ctx, and a user-tier note-frame key is INERT (the 2026-08-07 re-home)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // The user blob carries BOTH: a genuinely user-homed slot, and the note frame that USED to live here. The
    // frame moved to `promptConfig.prose` (owner ruling 2026-08-07), and `composeProse` keeps every key only
    // from the storage its slot actually homes in — so the stale key is dropped rather than silently winning
    // from a home the resolver no longer reads. Pre-launch NO-LEGACY: nothing migrated it, so "inert" is the
    // behavior an owner who edited it before the ruling will see.
    const proseFromSettings = {
      "chat.assembly.anchorIdentity": { text: "The one you answer to is", baseVersion: 1 },
      "chat.injection.userNote": { text: "((stale user-tier frame: {{note}}))", baseVersion: 1 },
    };
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      resolveChatProse: () => Promise.resolve(proseFromSettings),
    });

    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        userInjections: [{ position: "in_prompt", depth: 0, role: "user", content: "keep it short" }],
        injectionTokenBudget: 64,
      }),
    );

    // Carried: the user-homed slot. Dropped: the re-homed one.
    expect(out.prose).toStrictEqual({ "chat.assembly.anchorIdentity": { text: "The one you answer to is", baseVersion: 1 } });
    const framed = (out.chatInjections ?? []).find((i) => i.position === "in_prompt");
    expect(framed?.content).toBe("[Note from user: keep it short]");
  });

  test("swap with anchor descriptionPosition='none': the anchor is NOT injected in either role", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const anchor = {
      name: "Alex",
      description: "Alex is a knight",
      placement: { kind: "none" } as const,
    };
    const active = {
      name: "Steve",
      description: "Steve is a mage",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor, active },
    });
    const injections = out.chatInjections ?? [];

    // The active still injects; the anchor opted out ⇒ no in_static card block.
    expect(injections.some((i) => i.position === "in_chat" && i.content === "Steve is a mage")).toBe(true);
    expect(injections.some((i) => i.position === "in_static")).toBe(false);
  });

  test("each description resolves {{user}} against ITS OWN persona (no cross-contamination)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const anchor = {
      name: "Alex",
      description: "{{user}} is a doctor",
      placement: { kind: "in_prompt" } as const,
    };
    const active = {
      name: "Steve",
      description: "{{user}} is a soldier",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor, active },
    });
    const allContent = (out.chatInjections ?? []).map((i) => i.content).join(" || ");

    expect(allContent).toContain("Alex is a doctor"); // anchor desc resolved against Alex
    expect(allContent).toContain("Steve is a soldier"); // active desc resolved against Steve
    // The owner-flagged cross-contamination bug MUST NOT happen:
    expect(allContent).not.toContain("Steve is a doctor");
    expect(allContent).not.toContain("Alex is a soldier");
  });
});

// ── The people block: every other present human's persona rides the `persona` marker, headed ─────────────
describe("buildAssembleContext — the people block", () => {
  const alice = { name: "Alice", description: "ALICE-DESC", placement: { kind: "in_prompt" } as const };
  const bob = { name: "Bob", description: "BOB-DESC", placement: { kind: "in_prompt" } as const };
  const cara = { name: "Cara", description: "CARA-DESC", placement: { kind: "in_prompt" } as const };
  const heading = (name: string): string => resolveProseText("chat.group.personaHeading", {}, { name });
  // One seeded room per build, so a test may build twice on the same db.
  let room = 0;

  async function build(people: readonly AssemblePersona[], over: InputOver = {}, active: AssemblePersona = alice): Promise<AssembleContext> {
    room += 1;
    const host = await seedUser(db, castId<Handle>(`host-${String(room)}`));
    const chatId = await seedChat(db, `room-${String(room)}`);
    const charId = await seedCharacter(db, host, `aria-${String(room)}`);
    return await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
      ...inputOf(chatId, host, [charId], over),
      personas: { anchor: active, active, people },
    });
  }

  test("two humans in_prompt: the voice description, then the other human's heading and description", async () => {
    const solo = assemblePrompt(DEFAULT_PROMPT_CONFIG, await build([])).static;
    const withBob = assemblePrompt(DEFAULT_PROMPT_CONFIG, await build([bob])).static;

    // Control: no people is today's bytes, the voice description alone.
    expect(solo).toContain("ALICE-DESC");
    expect(solo).not.toContain(heading("Bob"));
    expect(withBob).toBe(solo.replace("ALICE-DESC", `ALICE-DESC\n\n${heading("Bob")}\nBOB-DESC`));
  });

  test("three humans: the others follow in the people list's (join) order", async () => {
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, await build([bob, cara])).static;

    expect(out).toContain(`ALICE-DESC\n\n${heading("Bob")}\nBOB-DESC\n\n${heading("Cara")}\nCARA-DESC`);
  });

  test("an at_depth person: a heading-only entry, plus their own in_chat injection labelled with their name", async () => {
    const bobAtDepth = { ...bob, placement: { kind: "at_depth", depth: 3, role: "system" } as const };
    const ctx = await build([bobAtDepth]);
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, ctx);

    expect(out.static).toContain(`ALICE-DESC\n\n${heading("Bob")}`);
    expect(`${out.static}\n${out.dynamic}`).not.toContain("BOB-DESC");
    expect(besidesMarker(ctx.chatInjections).filter((i) => i.origin === "persona")).toEqual([
      { position: "in_chat", depth: 3, role: "system", content: "BOB-DESC", origin: "persona", originLabel: "Bob" },
    ]);
  });

  test("a none person: a heading-only entry and no injection", async () => {
    const ctx = await build([{ ...bob, placement: { kind: "none" } }]);
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, ctx);

    expect(out.static.endsWith(`ALICE-DESC\n\n${heading("Bob")}`)).toBe(true);
    expect(`${out.static}\n${out.dynamic}`).not.toContain("BOB-DESC");
    expect(besidesMarker(ctx.chatInjections)).toEqual([]);
  });

  test("a blank description: a heading-only entry", async () => {
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, await build([{ ...bob, description: "   " }])).static;

    expect(out.endsWith(`ALICE-DESC\n\n${heading("Bob")}`)).toBe(true);
  });

  test("an entry resolves {{user}} against its own persona while the preset still addresses the voice", async () => {
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, await build([{ ...bob, description: "{{user}} likes tea" }])).static;

    expect(out).toContain(`${heading("Bob")}\nBob likes tea`);
    expect(out).toContain("roleplay with Alice");
    expect(out).not.toContain("Alice likes tea");
  });

  test("a voice persona at_depth still leaves the other people in the block", async () => {
    const aliceAtDepth = { ...alice, placement: { kind: "at_depth", depth: 2, role: "system" } as const };
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, await build([bob], {}, aliceAtDepth)).static;

    expect(out).not.toContain("ALICE-DESC");
    expect(out).toContain(`${heading("Bob")}\nBOB-DESC`);
  });

  // An impersonate draft by Bob in an Alice-anchored room: the anchor (Alice) differs from the voice (Bob) AND is a
  // people entry. Her description must reach the model once, through her people entry.
  test("an anchor persona that is also a people entry renders its description once", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const built = await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: alice, active: bob, people: [alice] },
    });
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, built);
    // The system halves already include every system-block injection; only in_chat ones ride elsewhere.
    const inChat = (built.chatInjections ?? []).filter((i) => i.position === "in_chat").map((i) => i.content);
    const delivered = [out.static, out.dynamic, ...inChat].join("\n");

    expect(delivered.split("ALICE-DESC")).toHaveLength(2);
    expect(out.static).toContain(`BOB-DESC\n\n${heading("Alice")}\nALICE-DESC`);
  });

  test("an anchor persona that is NOT a people entry still rides the card-context anchor block (the swap rule)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const built = await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: alice, active: bob, people: [cara] },
    });

    expect((built.chatInjections ?? []).filter((i) => i.content.includes("ALICE-DESC"))).toHaveLength(1);
  });

  test("the people's names join the world-info keyword haystack", async () => {
    // A chat book keyed on "cara"; nothing in the recent messages names her.
    const lore = async (people: readonly AssemblePersona[]): Promise<string> => {
      room += 1;
      const host = await seedUser(db, castId<Handle>(`host-${String(room)}`));
      const chatId = await seedChat(db, `room-${String(room)}`);
      const charId = await seedCharacter(db, host, `aria-${String(room)}`);
      await attachChatEntry(host, chatId, `cara-lore-${String(room)}`, { content: "CARA LORE", keys: ["cara"] });
      const ctx = await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
        ...inputOf(chatId, host, [charId], { recentMessages: ["nothing here"] }),
        personas: { anchor: alice, active: alice, people },
      });
      return ctx.worldInfoBeforeDynamic ?? "";
    };

    expect(await lore([])).not.toContain("CARA LORE");
    expect(await lore([cara])).toContain("CARA LORE");
  });
});
