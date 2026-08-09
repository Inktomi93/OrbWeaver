// verb: bulkSetScriptsPlacement — REPLACE the placement set across many owned scripts in one batch (REGX2 · D2).
//
// THE POSITIVE CONTROL this suite exists for: the wire carries ONLY the placement. The display/prompt tier
// flags and the history-depth scope are RE-DERIVED server-side from that set (`@orb/kit/regex`), so a bulk
// change that flips display-only ↔ prompt-side MUST flip `markdownOnly`/`promptOnly` in the STORED blob — and
// it can only do that if the derivation actually runs on the server. A verb that just wrote `placement` and
// left the flags alone would fail the first two tests; one that forgot the depth derivation would throw on the
// re-parse (the behavior schema refuses `PROMPT_HISTORY` without a scope, and any other leg WITH one).

import type { RegexScriptBehavior } from "@orb/contracts/regex";
import { regexScripts } from "@orb/db";
import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { behavior, makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

/** One hour of frozen-clock advance — enough to make a moved stamp unmistakable. */
const ONE_HOUR_MS = 3_600_000;

async function storedBehavior(db: Awaited<ReturnType<typeof freshDb>>, id: RegexScriptId): Promise<RegexScriptBehavior | undefined> {
  const [row] = await db.select().from(regexScripts).where(eq(regexScripts.id, id));
  return row?.behavior;
}

describe("bulkSetScriptsPlacement", () => {
  test("a DISPLAY-only script moved to a prompt-side stream flips markdownOnly→promptOnly — the SERVER derives it", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, {
      ownerId: owner,
      id: "regex_script_display0000000",
      behavior: behavior({ placement: ["DISPLAY"], markdownOnly: true, promptOnly: false, findRegex: "keep-me" }),
    });

    // The wire carries NO flags — only the new placement.
    const result = await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [a], placement: ["AI_OUTPUT"] });

    expect(result).toEqual({ affected: 1 });
    const stored = await storedBehavior(db, a);
    expect(stored?.placement).toEqual(["AI_OUTPUT"]);
    expect(stored?.markdownOnly).toBe(false);
    expect(stored?.promptOnly).toBe(true);
    // The row's own body is untouched — the verb rewrites placement + derived fields, nothing authored.
    expect(stored?.findRegex).toBe("keep-me");
  });

  test("a prompt-side script moved to DISPLAY-only flips the other way — again, no flags on the wire", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, {
      ownerId: owner,
      id: "regex_script_prompt00000000",
      behavior: behavior({ placement: ["USER_INPUT", "AI_OUTPUT"], markdownOnly: false, promptOnly: true }),
    });

    await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [a], placement: ["DISPLAY"] });

    const stored = await storedBehavior(db, a);
    expect(stored?.markdownOnly).toBe(true);
    expect(stored?.promptOnly).toBe(false);
  });

  test("gaining the PROMPT_HISTORY leg MINTS the whole-history scope (else the re-parse would throw)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_gainhist000000", behavior: behavior({ placement: ["AI_OUTPUT"] }) });

    await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [a], placement: ["AI_OUTPUT", "PROMPT_HISTORY"] });

    const stored = await storedBehavior(db, a);
    expect(stored?.historyDepth).toEqual({ min: 0, max: null });
  });

  test("losing the PROMPT_HISTORY leg DROPS the scope (a bound that governs nothing is never left behind)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, {
      ownerId: owner,
      id: "regex_script_losehist000000",
      behavior: behavior({ placement: ["PROMPT_HISTORY"], historyDepth: { min: 2, max: 5 } }),
    });

    await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [a], placement: ["AI_OUTPUT"] });

    const stored = await storedBehavior(db, a);
    expect(stored?.historyDepth).toBeUndefined();
  });

  test("an authored depth scope SURVIVES when PROMPT_HISTORY stays in the new set", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, {
      ownerId: owner,
      id: "regex_script_keephist000000",
      behavior: behavior({ placement: ["PROMPT_HISTORY"], historyDepth: { min: 3, max: 8 } }),
    });

    await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [a], placement: ["AI_OUTPUT", "PROMPT_HISTORY"] });

    const stored = await storedBehavior(db, a);
    expect(stored?.historyDepth).toEqual({ min: 3, max: 8 });
  });

  test("every named owned row is rewritten in ONE audit and ONE emit; each keeps its own body", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", behavior: behavior({ placement: ["DISPLAY"], findRegex: "aaa" }) });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", behavior: behavior({ placement: ["DISPLAY"], findRegex: "bbb" }) });

    const result = await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [a, b], placement: ["AI_OUTPUT"] });

    expect(result).toEqual({ affected: 2 });
    expect((await storedBehavior(db, a))?.findRegex).toBe("aaa");
    expect((await storedBehavior(db, b))?.findRegex).toBe("bbb");
    // ONE user gesture, ONE repaint — the reason the batch verb exists at all.
    expect(h.userEvents).toHaveLength(1);
    expect(h.userEvents[0]?.event).toEqual({ type: "regexChanged" });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.action).toBe("regex.bulkSetScriptsPlacement");
    expect(h.audits[0]?.entry.metadata).toEqual({ count: 2, bulk: true });
  });

  test("stamps updatedAt on every row it wrote, and on none it did not", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", behavior: behavior({ placement: ["DISPLAY"] }) });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", behavior: behavior({ placement: ["DISPLAY"] }) });
    const [bornMine] = await db.select().from(regexScripts).where(eq(regexScripts.id, mine));
    const [bornTheirs] = await db.select().from(regexScripts).where(eq(regexScripts.id, theirs));

    h.advance(ONE_HOUR_MS);
    await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [mine, theirs], placement: ["AI_OUTPUT"] });

    const [afterMine] = await db.select().from(regexScripts).where(eq(regexScripts.id, mine));
    const [afterTheirs] = await db.select().from(regexScripts).where(eq(regexScripts.id, theirs));
    expect(afterMine?.updatedAt).toBe((bornMine?.updatedAt ?? 0) + ONE_HOUR_MS);
    expect(afterTheirs?.updatedAt).toBe(bornTheirs?.updatedAt); // the dropped foreign row is untouched
    expect(h.audits[0]?.at).toBe(afterMine?.updatedAt);
  });

  test("a FOREIGN id is silently dropped — never an oracle, and never a foreign write", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", behavior: behavior({ placement: ["DISPLAY"] }) });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", behavior: behavior({ placement: ["DISPLAY"] }) });

    const result = await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [mine, theirs], placement: ["AI_OUTPUT"] });

    expect(result).toEqual({ affected: 1 });
    // The stranger's script is untouched — still DISPLAY.
    expect((await storedBehavior(db, theirs))?.placement).toEqual(["DISPLAY"]);
  });

  test("an empty / all-foreign batch writes nothing, audits nothing and emits nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const empty = await svc.bulkSetScriptsPlacement({ principal: principal(owner), scriptIds: [], placement: ["AI_OUTPUT"] });
    const ghost = await svc.bulkSetScriptsPlacement({
      principal: principal(owner),
      scriptIds: [castId<RegexScriptId>("regex_script_nothere")],
      placement: ["AI_OUTPUT"],
    });

    expect([empty, ghost]).toEqual([{ affected: 0 }, { affected: 0 }]);
    expect(h.audits).toHaveLength(0);
    expect(h.userEvents).toHaveLength(0);
  });
});
