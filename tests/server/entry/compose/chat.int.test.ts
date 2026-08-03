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
// THE TRIPWIRE is the vitest default 5s per-test timeout: an unwired watchdog hangs the catastrophic backtrack
// over REDOS_INPUT for MINUTES, so the run dies red. (No explicit elapsed assertion — Date.now/performance.now
// are banned under tests/ by test-determinism, and the frozen fixture clock can't measure wall time.) Direct
// timing evidence, from a standalone probe over the composed `createRegexApplyReplace()`: the guard THROWS in
// ~52ms (`Script execution timed out after 50ms`, REGEX_APPLY_TIMEOUT_MS), while the native unguarded replace
// over the SAME 40-`a` input never completes (killed at 90s) — that is exactly the hang the guard prevents.
//
// SECOND BLOCK (bottom of the file): the other composed-injection gap at this seam — `resolveSeatDeco`'s
// tighten-only external-media combine, likewise stubbed everywhere else. Its own header explains the exploit.

import type { Principal } from "@orb/contracts/identity";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import type { ChatId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { Services } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

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
      // biome-ignore lint/performance/noAwaitInLoops: a tiny fixed seed set, written in order so the attach positions are deterministic.
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

  // The vitest default 5s timeout is the HARD tripwire: an unwired watchdog hangs the catastrophic backtrack
  // over REDOS_INPUT for minutes → the run dies red (see the file header for the standalone timing evidence).
  test("the ReDoS pattern is interrupted by the composed watchdog: content UNCHANGED", async ({ db, services }) => {
    const { chatId, messageId, principal } = await seedEditTarget(db, services, [REDOS_SCRIPT()], "orig");

    const view = await services.chat.editMessage({
      principal,
      chatId,
      messageId,
      content: REDOS_INPUT,
    });

    // The per-script catch skipped the timed-out rule → the edited content survives verbatim (the replace
    // never landed; `SHOULD_NOT_APPLY` is nowhere). If the guard were unwired this call would hang.
    expect(view.content).toBe(REDOS_INPUT);
    expect(view.content).not.toContain("SHOULD_NOT_APPLY");
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
    expect(seat?.renderPolicy?.trustHtml).toBe(true);
    // The human seat keeps the bare deployment floor.
    expect(roster.find((p) => p.userId === host)?.renderPolicy).toEqual({ trustHtml: false, forbidExternalMedia: true });
  });
});
