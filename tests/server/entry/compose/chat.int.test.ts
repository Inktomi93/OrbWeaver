// entry/compose/chat — the D53 ReDoS watchdog END-TO-END at the compose seam this file mirrors
// (packages/server/src/entry/compose/chat.ts). THE gap this closes: the injection
// `applyRegexReplace: createRegexApplyReplace()` (chat.ts) — the ONLY site that puts the real
// node:vm-sandboxed replace onto the live `ChatContext` — had zero coverage. The watchdog's FIRING is
// unit-covered (packages/server/src/kit/regex) and the edit verb's runOnEdit re-apply is covered with a FAKE
// `applyRegexReplace` (domain/chat/verbs/edit.int.test.ts) — but nothing proved the REAL composition wires the
// real guard. `ChatComposeResult` never exposes the `ChatContext`, so the only faithful observation is
// end-to-end: seed the host's `UserSettings.regex.scripts` (through the REAL settings verb) with the canonical
// ReDoS-shaped pattern `(a+)+$` (a runOnEdit USER_INPUT script — the heuristic explicitly lets this one
// through), then `services.chat.editMessage` a user slot and prove the composed watchdog interrupts the
// catastrophic backtrack: the per-script catch skips the rule and the content survives UNCHANGED (never hangs
// the event loop). The REVERSE pin (a benign script DOES apply through the SAME path) proves the seam is LIVE —
// a broken injection that no-op'd every script would pass the ReDoS case vacuously. Runs over the REAL
// composition root (`createServices`, vLLM disabled — the `app`/`services` fixture).
//
// THE TRIPWIRE is the scoped 10s test timeout: an unwired watchdog hangs the catastrophic backtrack
// over REDOS_INPUT for MINUTES, so the run dies red on that alone. #831 additionally restores an EXPLICIT
// elapsed assertion (the sub-second ceiling below) so the test does not rely solely on the outer timeout
// to notice a slow-but-not-hung regression — Date.now/performance.now are banned under tests/ by
// test-determinism and the frozen fixture clock can't measure wall time, so the assertion uses
// `process.hrtime()` under the shared `@orb-gate-ignore test-determinism` marker (#828). Direct timing
// evidence, from a standalone probe over the composed `createRegexApplyReplace()`: the guard THROWS in
// ~52ms (`Script execution timed out after 50ms`, REGEX_APPLY_TIMEOUT_MS), while the native unguarded replace
// over the SAME 40-`a` input never completes (killed at 90s) — that is exactly the hang the guard prevents.
//
// SECOND BLOCK (bottom of the file): the other composed-injection gap at this seam — `resolveSeatDeco`'s
// tighten-only external-media combine, likewise stubbed everywhere else. Its own header explains the exploit.

import process from "node:process";
import type { Principal } from "@orb/contracts/identity";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { rpgGames } from "@orb/db";
import type { ChatId, Handle, MessageId, PersonaId, PresetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { Services } from "@orb/server/transport/trpc";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";
import { seedPreset } from "../../domain/preset/_support.ts";
import { seedGame } from "../../domain/rpg/_support.ts";

/** The host `Principal` (role-irrelevant here — the edit gate matches on author identity; the host-tier regex
 *  set resolves under this user's `UserSettings`). `via:"header"` mirrors the fixture callers. */
function hostPrincipal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId("host"), externalId: null, via: "header" };
}

/** The canonical ReDoS shape (`(a+)+$`) — ONE quantifier stack, so the kit pre-compile heuristic (which
 *  counts stacks, not nesting) lets it COMPILE; the catastrophic backtrack against a long all-`a` run capped
 *  by a non-`a` tail (`$` can never match) is what the node:vm per-call timeout must interrupt. */
const REDOS_SCRIPT = (): RegexScriptRow =>
  regexScriptSchema.parse({
    id: mintTypeId(ID_PREFIX.regexScript),
    name: "redos",
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: "(a+)+$",
    replaceString: "SHOULD_NOT_APPLY",
    placement: ["USER_INPUT"],
    runOnEdit: true,
  });

/** A benign runOnEdit USER_INPUT rule — the reverse pin. Applies cleanly through the SAME composed watchdog
 *  (a real find/replace completes in microseconds; the vm guard is transparent to a non-pathological rule). */
const BENIGN_SCRIPT = (): RegexScriptRow =>
  regexScriptSchema.parse({
    id: mintTypeId(ID_PREFIX.regexScript),
    name: "benign",
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: "badword",
    replaceString: "****",
    placement: ["USER_INPUT"],
    runOnEdit: true,
  });

/** 40 `a`s + a non-`a` tail — 2^39 backtracking partitions if the guard is absent (minutes of CPU), a hard
 *  50ms interrupt if it is present. Enough that a broken/unwired watchdog blows well past the vitest timeout. */
const REDOS_INPUT = `${"a".repeat(40)}!`;

interface SeededEditTarget {
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly principal: Principal;
}

describe("D53 ReDoS watchdog — composed at the editMessage seam (real createServices)", () => {
  /** Seed the host + their `UserSettings.regex.scripts` (through the REAL settings verb — not blob-poking) +
   *  a solo room with one host-authored USER slot. Returns the ids the edit call needs. */
  async function seedEditTarget(db: Db, services: Services, scripts: readonly RegexScriptRow[], content: string): Promise<SeededEditTarget> {
    const host = await seedUser(db, castId<Handle>("host"));
    const principal = hostPrincipal(host);

    // The heavyweight, faithful seed: write the scripts through the REGEX front door and attach them at the
    // GLOBAL scope (D121-E), so the real `resolveRegexSources` dereferences them at edit time exactly as a
    // live turn does. The old settings-section patch is gone with the section.
    for (const script of scripts) {
      const { id: _cardId, name, enabled, ...behavior } = script;
      const row = await services.regex.createScript({ principal, input: { name, enabled, ...behavior } });
      await services.regex.attachGlobal({ principal, scriptId: row.id });
    }

    const chatId = await seedChat(db, "redos");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: host,
      content,
    });
    return { host, chatId, messageId, principal };
  }

  // The scoped 10s timeout is the HARD tripwire: an unwired watchdog hangs the catastrophic backtrack
  // over REDOS_INPUT for minutes → the run dies red (see the file header for the standalone timing evidence).
  test("the ReDoS pattern is interrupted by the composed watchdog: content UNCHANGED", { timeout: 10_000 }, async ({ db, services }) => {
    const { chatId, messageId, principal } = await seedEditTarget(db, services, [REDOS_SCRIPT()], "orig");

    // @orb-gate-ignore test-determinism: the SUBJECT is elapsed real time — proving the watchdog actually FIRED (well under a second) rather than the call merely completing under vitest's outer timeout (#831)
    const started = process.hrtime();
    const view = await services.chat.editMessage({
      principal,
      chatId,
      messageId,
      content: REDOS_INPUT,
    });
    // @orb-gate-ignore test-determinism: the SUBJECT is elapsed real time — reading the same monotonic start above; no frozen clock can measure a real wall-clock race (#831)
    const [seconds] = process.hrtime(started);

    // The per-script catch skipped the timed-out rule → the edited content survives verbatim (the replace
    // never landed; `SHOULD_NOT_APPLY` is nowhere). If the guard were unwired this call would hang.
    expect(view.content).toBe(REDOS_INPUT);
    expect(view.content).not.toContain("SHOULD_NOT_APPLY");
    // The watchdog throws at ~52ms (REGEX_APPLY_TIMEOUT_MS); a native unguarded replace over the same input
    // never completes. 1s is generous slack over CI/host jitter while still refuting "it just finished in
    // time" — an unwired guard hangs for MINUTES, not fractions of a second.
    expect(seconds).toBeLessThan(1);
  });

  test("REVERSE pin: a benign runOnEdit USER_INPUT script DOES apply through the same composed path (seam is live)", async ({ db, services }) => {
    const { chatId, messageId, principal } = await seedEditTarget(db, services, [BENIGN_SCRIPT()], "orig");

    const view = await services.chat.editMessage({
      principal,
      chatId,
      messageId,
      content: "say badword now",
    });

    // The composed watchdog is transparent to a non-pathological rule → the find/replace lands. This is
    // what forbids a vacuous pass of the ReDoS case (an injection that no-op'd every script would fail HERE).
    expect(view.content).toBe("say **** now");
  });
});

// The OTHER live-injection gap at this seam: `resolveSeatDeco` (chat.ts) is the ONLY site that combines the
// deployment external-media ceiling with a card's tri-state override into the `RenderPolicy` the client
// renders from — and `domain/chat`'s own suite stubs it, so nothing proved the COMPOSED combine. Owner
// ruling 2026-08-01: that combine is TIGHTEN-ONLY. The exploit this closes, end to end over the real
// composition root: a card whose owner picked "Allow" (`forbidExternalMedia: false`, written through the
// REAL update verb the Appearance tab fires) on a deployment whose floor BLOCKS external media used to
// resolve to `forbidExternalMedia: false` — the transcript then rendered the third-party `<img>`/`<video>`
// (a tracking-pixel/exfil beacon on every view) and only the document CSP, which is built from the
// DEPLOYMENT value alone, stopped the fetch. The reverse pin (trustHtml still escalates through the SAME
// read) forbids a vacuous pass by a resolver that just returned the floor for everything.
describe("resolveSeatDeco — the tighten-only external-media ceiling, composed (real createServices)", () => {
  test("a card opting IN to external media does NOT widen past the blocking deployment floor", async ({ db, services }) => {
    const host = await seedUser(db, castId<Handle>("mediahost"));
    const principal = hostPrincipal(host);
    const characterId = await seedCharacter(db, host, "mediacard");
    // The card's own opt-in + an HTML opt-in, through the real front door.
    await services.character.update({ principal, characterId, input: { forbidExternalMedia: false, trustHtml: true } });

    const chatId = await seedChat(db, "media");
    await seedParticipant(db, { chatId, key: "mediahost", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "mediacard", characterId });

    const roster = await services.chat.listParticipants({ principal, chatId });
    const seat = roster.find((p) => p.characterId === characterId);

    // No stored AppSettings override ⇒ the born-in-DB floor (forbid) stands, and the card cannot lift it.
    expect(seat?.renderPolicy?.forbidExternalMedia).toBe(true);
    // …while the SAME read still honours the trustHtml escalation — the seam is live, not a blanket deny.
    expect(seat?.renderPolicy?.htmlTrust).toBe("trusted");
    // The human seat keeps the bare deployment floor.
    expect(roster.find((p) => p.userId === host)?.renderPolicy).toEqual({ htmlTrust: "untrusted", forbidExternalMedia: true });
  });
});

// ── #759 — the composed preset-read catches narrow to PresetNotFoundError, END TO END ──────────────────────
// `resolvePromptConfigFor` (compose/chat.ts) is reachable through `chat.getVariables` (the picker-pane read
// that folds the host's default-preset ChoiceBlock declarations); `resolvePromptConfigWithOverride`'s own
// try/catch (the GM-voice preset REDIRECT) is reachable through `chatRpgOps.resolveChatPresetProse`. Both
// closures are internal to `ChatComposeResult` — these are the only two seams that surface them without
// re-deriving a full turn. `services.preset` is the SAME instance the composed `ChatComposeInput.preset`
// closes over (compose-observe-via-service-spyon), so `vi.spyOn` intercepts the real injected read.
describe("compose/chat.ts — the preset-read catches narrow to PresetNotFoundError (#759)", () => {
  test("getVariables (resolvePromptConfigFor): a non-not-found preset rejection PROPAGATES", async ({ db, services }) => {
    const host = await seedUser(db, castId<Handle>("presethost1"));
    const chatId = await seedChat(db, "presetchat1");
    await seedParticipant(db, { chatId, key: "presethost1", userId: host, role: "host" });
    await services.settings.updateUserSettingsSection({
      principal: hostPrincipal(host),
      input: { section: "seeds", patch: { defaultPresetId: castId<PresetId>("preset_will_error") } },
    });
    const dbDown = new Error("preset store unreachable");
    vi.spyOn(services.preset, "get").mockRejectedValueOnce(dbDown);

    await expect(services.chat.getVariables({ principal: hostPrincipal(host), chatId })).rejects.toBe(dbDown);
  });

  test("getVariables: a genuinely stale/unowned default preset id still degrades to the system default", async ({ db, services }) => {
    const host = await seedUser(db, castId<Handle>("presethost2"));
    const chatId = await seedChat(db, "presetchat2");
    await seedParticipant(db, { chatId, key: "presethost2", userId: host, role: "host" });
    await services.settings.updateUserSettingsSection({
      principal: hostPrincipal(host),
      input: { section: "seeds", patch: { defaultPresetId: castId<PresetId>("preset_gone_forever") } },
    });

    // DEFAULT_PROMPT_CONFIG declares no ChoiceBlock variables — the lenient-id fallback is byte-observable
    // as an empty picker.
    await expect(services.chat.getVariables({ principal: hostPrincipal(host), chatId })).resolves.toEqual({});
  });

  test("chatRpgOps.resolveChatPresetProse (resolvePromptConfigWithOverride): a non-not-found GM-preset rejection PROPAGATES", async ({ db, app, services }) => {
    const host = await seedUser(db, castId<Handle>("gmhost1"));
    const chatId = await seedChat(db, "gmchat1");
    await seedParticipant(db, { chatId, key: "gmhost1", userId: host, role: "host" });
    const gameId = await seedGame(db, chatId, "gmoverride1");
    // `rpg_games.gm_preset_id` is a real FK — the row must actually exist for the update to land; the
    // failure under test comes from the SPIED read, not a missing row.
    const gmPreset = await seedPreset(db, { id: castId<PresetId>("preset_gm_voice1"), ownerId: null, name: "GM voice" });
    await db.update(rpgGames).set({ gmPresetId: gmPreset }).where(eq(rpgGames.id, gameId));
    const dbDown = new Error("gm-voice preset unreachable");
    vi.spyOn(services.preset, "get").mockRejectedValueOnce(dbDown);

    await expect(app.chatRpgOps.resolveChatPresetProse(chatId)).rejects.toBe(dbDown);
  });

  test("chatRpgOps.resolveChatPresetProse: a genuinely stale/unowned GM override still falls through to the host default", async ({ db, app }) => {
    const host = await seedUser(db, castId<Handle>("gmhost2"));
    const other = await seedUser(db, castId<Handle>("gmhostother"));
    const chatId = await seedChat(db, "gmchat2");
    await seedParticipant(db, { chatId, key: "gmhost2", userId: host, role: "host" });
    const gameId = await seedGame(db, chatId, "gmoverride2");
    // A REAL preset row the game's host cannot read (owned by someone else) — the genuine
    // `PresetNotFoundError` control, no mocking needed.
    const foreignPreset = await seedPreset(db, { id: castId<PresetId>("preset_gm_foreign"), ownerId: other, name: "Their voice" });
    await db.update(rpgGames).set({ gmPresetId: foreignPreset }).where(eq(rpgGames.id, gameId));

    // Never throws — the redirect degrades to the host's normal (unset) default, which composes to a
    // defined ProseOverrides object rather than propagating the stale override.
    await expect(app.chatRpgOps.resolveChatPresetProse(chatId)).resolves.toBeDefined();
  });
});

// ── #760 — the composed persona-read catches narrow to PersonaNotFoundError, END TO END ─────────────────────
// `resolveCurrentPersona` and `resolveDefaultPersona` (compose/chat.ts) are both reachable through
// `chat.startChat`'s founding-anchor chain (`resolveFoundingAnchor`: explicit > connected > current >
// default). Each is pinned in isolation by leaving the OTHER seed pointer unset (so its own read never
// fires — an unset pointer returns null without calling `persona.get` at all).
describe("compose/chat.ts — the persona-read catches narrow to PersonaNotFoundError (#760)", () => {
  test("startChat (resolveCurrentPersona): a non-not-found persona rejection PROPAGATES", async ({ db, services }) => {
    const host = await seedUser(db, castId<Handle>("personahost1"));
    const characterId = await seedCharacter(db, host, "personacard1");
    await services.settings.updateUserSettingsSection({
      principal: hostPrincipal(host),
      input: { section: "seeds", patch: { currentPersonaId: castId<PersonaId>("persona_gone1") } },
    });
    const dbDown = new Error("persona store unreachable");
    vi.spyOn(services.persona, "get").mockRejectedValueOnce(dbDown);

    await expect(services.chat.startChat({ principal: hostPrincipal(host), characterIds: [characterId], opening: "none" })).rejects.toBe(dbDown);
  });

  test("startChat: a genuinely stale currentPersonaId still falls through the chain (no active persona)", async ({ db, services }) => {
    const host = await seedUser(db, castId<Handle>("personahost2"));
    const characterId = await seedCharacter(db, host, "personacard2");
    await services.settings.updateUserSettingsSection({
      principal: hostPrincipal(host),
      input: { section: "seeds", patch: { currentPersonaId: castId<PersonaId>("persona_gone2") } },
    });

    const { chat } = await services.chat.startChat({ principal: hostPrincipal(host), characterIds: [characterId], opening: "none" });
    expect(chat.anchorPersonaId).toBeNull();
  });

  test("startChat (resolveDefaultPersona): a non-not-found persona rejection PROPAGATES", async ({ db, services }) => {
    const host = await seedUser(db, castId<Handle>("personahost3"));
    const characterId = await seedCharacter(db, host, "personacard3");
    await services.settings.updateUserSettingsSection({
      principal: hostPrincipal(host),
      input: { section: "seeds", patch: { defaultPersonaId: castId<PersonaId>("persona_gone3") } },
    });
    const dbDown = new Error("persona store unreachable");
    vi.spyOn(services.persona, "get").mockRejectedValueOnce(dbDown);

    await expect(services.chat.startChat({ principal: hostPrincipal(host), characterIds: [characterId], opening: "none" })).rejects.toBe(dbDown);
  });

  test("startChat: a genuinely stale defaultPersonaId still falls through the chain (no active persona)", async ({ db, services }) => {
    const host = await seedUser(db, castId<Handle>("personahost4"));
    const characterId = await seedCharacter(db, host, "personacard4");
    await services.settings.updateUserSettingsSection({
      principal: hostPrincipal(host),
      input: { section: "seeds", patch: { defaultPersonaId: castId<PersonaId>("persona_gone4") } },
    });

    const { chat } = await services.chat.startChat({ principal: hostPrincipal(host), characterIds: [characterId], opening: "none" });
    expect(chat.anchorPersonaId).toBeNull();
  });
});
