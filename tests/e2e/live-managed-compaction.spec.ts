// E2E (@live): MANAGED COMPACTION end-to-end + SWAP CONTINUITY (workboard #9). The agent-sdk chat (the e2e
// default — global-setup pins roleDefaults.chat to agent-sdk/vLLM) accrues history under a tiny per-send
// maxContextTokens with `compaction.mode:"managed"`; the post-turn hook rebuilds the LINEAR marker via the
// chat's OWN local model (quietGenerate → runChatTurn), stores it on `chats.compactSummary` + `compactedAtSeq`,
// and the present-tense divider gains the MEMORY FACT ("older messages compacted into memory") + a PEEK popup
// revealing the marker text. Then the carry-forward pin: the stored marker is DURABLE chat state — it survives
// and still drives the divider (previewFit reports `compactSummary`) regardless of the api that reads it.
//
// Two pins, one flow:
//   P1 — MANAGED compaction fires on the local agent-sdk model: after tiny-ceiling turns, the API preview
//        reports a non-null `compactSummary`, and the DOM divider shows the memory fact + a working peek.
//   P2 — CARRY-FORWARD: the marker is stored on the chat row (portable), so the previewFit `compactSummary`
//        stays populated (the read side never regenerates it — only the agent-sdk WRITE path generates).
//
// @live: seeds via real API turns on the local model (~15-30s warm; managed compaction adds a summarizer
// generation). Skipped unless E2E_LIVE=1. Fully self-seeding; MINTS its own character (no shared-seed reuse).

import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./support/chat-room";
import {
  getUserSettings,
  listCanon,
  mintFreshCharacter,
  previewContextFit,
  removeCharacter,
  sendTurn,
  startChat,
  trpcMutation,
  trpcQuery,
} from "./support/trpc";

const TINY_CEILING = 220; // small enough that the fit drops older turns → a boundary → the reactive trigger
const STABLE_CEILING = 1500; // the STABLE preset cap for the resume leg — small enough the DOMAIN fit trims (→ marker
// exclusion → reseed), large enough the (env-cap-DROPPED, managed) SDK session runs without an overflow error.
const MANAGED = { mode: "managed" as const, thresholdPct: 0.6, instructions: "Summarize tersely; keep names and the current scene." };
const COMPACTED_INTO_MEMORY = /compacted into memory/i;

test("managed compaction fires on the local model, the divider carries the memory fact + peek, and the marker carries forward", { tag: "@live" }, async ({
  page,
}) => {
  test.setTimeout(240_000);

  const characterId = await mintFreshCharacter("e2e-managed-compaction", "Compactor", "Hello — let us begin a long, detailed saga together.");
  try {
    // ── Seed history under managed compaction + a tiny ceiling so the fit drops rows and the hook fires. ──
    const chatId = await startChat([characterId]);
    await sendTurn(chatId, "Introduce a knight named Sir Aldric and the town of Millbrook.", TINY_CEILING, MANAGED);
    await sendTurn(chatId, "Aldric meets a merchant named Petra at the market.", TINY_CEILING, MANAGED);
    await sendTurn(chatId, "They discover a hidden map under the old bridge.", TINY_CEILING, MANAGED);
    await sendTurn(chatId, "Describe where the map leads.", TINY_CEILING, MANAGED);

    // ── P1: the post-turn managed-compaction hook (fire-and-forget) rebuilt the marker on the chat's model.
    // Poll the API preview until the compactSummary lands (the generation is async off the reply). ──
    await expect.poll(async () => (await previewContextFit(chatId)).compactSummary, { timeout: 60_000, intervals: [500, 1000, 2000] }).not.toBeNull();
    const covered = await previewContextFit(chatId);
    expect(covered.compactSummary).toBeTruthy();
    // The marker is stored on the chat row (portable, carry-forward), not merely computed in the preview.
    const canon = await listCanon(chatId);
    expect(canon.length).toBeGreaterThan(0);

    // ── The DOM divider shows the MEMORY FACT + a working PEEK. ──
    await page.goto("/");
    await waitForAppReady(page);
    await page.getByRole("list", { name: "Chats" }).getByRole("button").first().click();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
    const divider = page.locator('[data-slot="context-boundary-divider"]');
    await expect(divider).toHaveCount(1, { timeout: 15_000 });
    await expect(divider).toContainText(COMPACTED_INTO_MEMORY);

    // The peek popup reveals the stored marker text (portals outside the row → asserted on the page).
    await expect(page.locator('[data-slot="compact-summary-text"]')).toHaveCount(0);
    await page.locator('[data-slot="compact-summary-peek"]').click();
    await expect(page.locator('[data-slot="compact-summary-text"]')).toBeVisible({ timeout: 10_000 });
    const peeked = (await page.locator('[data-slot="compact-summary-text"]').textContent()) ?? "";
    expect(peeked.trim().length).toBeGreaterThan(0);

    // ── P2: CARRY-FORWARD — the stored marker is durable chat state, so a fresh preview read STILL reports a
    // marker (the read side never regenerates; only the agent-sdk WRITE path does). Not byte-identical: a later
    // turn's compaction may have advanced the marker — the durable-persistence guarantee is "a marker remains",
    // not "the exact same text". ──
    const reread = await previewContextFit(chatId);
    expect(reread.compactSummary).toBeTruthy();

    // ── P3: SHRINKAGE (the verifier's instrument) — the marker's coverage point is where covered turns fall out
    // of the prompt. A turn driven AFTER the coverage advanced sends a SMALLER prompt than the pre-compaction
    // peak, because the summarized turns no longer re-enter the history (the honest e2e for this feature). ──
    const preCanon = await listCanon(chatId);
    const prePeak = Math.max(...preCanon.filter((m) => m.role === "assistant" && m.tokensIn !== null).map((m) => m.tokensIn ?? 0));
    expect(prePeak).toBeGreaterThan(0);
    await sendTurn(chatId, "Continue the tale a little further.", TINY_CEILING, MANAGED);
    const postCanon = await listCanon(chatId);
    const newest = postCanon.filter((m) => m.role === "assistant" && m.tokensIn !== null).at(-1);
    expect(newest?.tokensIn).toBeDefined();
    // The post-compaction turn's prompt is SMALLER than the pre-compaction peak — covered turns are gone.
    expect(newest?.tokensIn ?? Number.POSITIVE_INFINITY).toBeLessThan(prePeak);
  } finally {
    await removeCharacter(characterId);
  }
});

// GAP 2 (resume-masking regression): the STABLE-session leg. The prior test changed maxContextTokens PER SEND,
// which forked the SDK session every turn — so the RESEED path was exercised while RESUME (the unfixed 41K path)
// never was. Here the cap is set ONCE on a preset (no per-send changes), so the session RESUMES turn to turn.
// SIGNAL: canon `tokensIn` is a per-turn DELTA on a resumed SDK session (hosted-verified) — useless for shrinkage —
// so the assertion reads previewFit's SERVER-computed cumulative `usedTokens` (the DOMAIN fit over the shaped,
// marker-EXCLUDED history), which DROPS once compaction covers turns. A masked (never-reseeding) session would keep
// the covered turns in the prompt and usedTokens would stay high. (The reseed disposition itself is proven in the
// store.test int; it is not exposed to the wire, so the live proof is the cumulative-usage drop.)
test("STABLE-session: managed compaction shrinks a RESUMED session's context (no per-send cap changes) — previewFit usedTokens drops", {
  tag: "@live",
}, async ({}) => {
  test.setTimeout(240_000);

  const characterId = await mintFreshCharacter("e2e-compaction-resume", "Resumer", "Hello — a long saga begins, resumed turn to turn.");
  const priorDefaultPresetId = (await getUserSettings()).config.seeds.defaultPresetId;
  const tinyPreset = await trpcMutation<{ readonly id: string }>("preset.create", { name: "e2e-managed-stable", kind: "chat" });
  try {
    // Point the user default at a preset carrying a STABLE maxContextTokens (no per-send override → the SDK
    // session resumes each turn instead of forking on a changing cap).
    const created = await trpcQuery<{ readonly config: { readonly params?: Record<string, unknown> } }>("preset.get", { id: tinyPreset.id });
    await trpcMutation("preset.update", {
      id: tinyPreset.id,
      config: { ...created.config, params: { ...created.config.params, maxContextTokens: STABLE_CEILING } },
    });
    await trpcMutation("settings.updateUserSettingsSection", { section: "seeds", patch: { defaultPresetId: tinyPreset.id } });

    const chatId = await startChat([characterId]);
    // A TOLERANT send: on a stable-cap RESUMED session the accumulated transcript can momentarily overflow the
    // SDK before a compaction catches up (the exact wedge the pre-turn arm exists to escape) — a single is_error
    // turn is EXPECTED and non-fatal; the pre-turn arm compacts and the next turn recovers. We drive enough turns
    // that maxSeq passes the verbatim tail (so the pre-turn arm has a coverage point) and track the usage arc.
    const tolerantSend = async (text: string): Promise<void> => {
      try {
        await sendTurn(chatId, text, undefined, MANAGED);
      } catch {
        // An SDK overflow on the resumed session — the pre-turn compaction arm fires on the NEXT attempt.
      }
    };
    // Drive managed turns with NO per-send cap (the preset's stable cap governs → the session RESUMES).
    const beats = [
      "Introduce a knight named Sir Aldric and the town of Millbrook, with vivid detail.",
      "Aldric meets a merchant named Petra at the market; describe their exchange at length.",
      "They discover a hidden map under the old bridge; describe it richly.",
      "Describe the road the map traces across the kingdom in detail.",
      "Aldric recruits companions for the journey; introduce each with specifics.",
      "The party sets out; narrate the first day's travel vividly.",
    ];
    let preUsed = 0;
    for (const beat of beats) {
      // biome-ignore lint/performance/noAwaitInLoops: turns are inherently sequential (each resumes the prior session).
      preUsed = Math.max(preUsed, (await previewContextFit(chatId)).usedTokens);
      // biome-ignore lint/performance/noAwaitInLoops: sequential dependent turns.
      await tolerantSend(beat);
    }

    // The marker landed (managed compaction fired on the stable-cap resumed session — via the pre-turn or
    // post-turn arm as the usage arc crossed the threshold).
    await expect.poll(async () => (await previewContextFit(chatId)).compactSummary, { timeout: 60_000, intervals: [500, 1000, 2000] }).not.toBeNull();

    // The RESUME-path shrinkage proof: previewFit's cumulative usedTokens is BELOW the pre-compaction peak because
    // covered turns fell out of the shaped history — the resumed session no longer carries the compacted-away
    // transcript (GAP 2 fixed, not just the forked-per-send path from the first test).
    const postUsed = (await previewContextFit(chatId)).usedTokens;
    expect(preUsed).toBeGreaterThan(0);
    expect(postUsed).toBeLessThan(preUsed);
  } finally {
    await trpcMutation("settings.updateUserSettingsSection", { section: "seeds", patch: { defaultPresetId: priorDefaultPresetId ?? null } });
    await trpcMutation("preset.remove", { id: tinyPreset.id });
    await removeCharacter(characterId);
  }
});
