// E2E (@live): MANAGED COMPACTION end-to-end + SWAP CONTINUITY (workboard #9). Managed compaction is
// agent-sdk-ONLY (engine gates the generation on `connection.api === "agent-sdk"`), and since D109 retired
// the agent-sdk × vllm loopback the only agent-sdk route is HOSTED — so each test PINS its own
// `agent-sdk × max-pro-sub` chat route (snapshot → set → RESTORE in a finally), never the global default
// (global-setup now pins the local chat-completions × vllm wire). The chat accrues history under a tiny
// maxContextTokens with `compaction.mode:"managed"`; the post-turn hook rebuilds the LINEAR marker via the
// chat's OWN local model (quietGenerate → runChatTurn), stores it on `chats.compactSummary` + `compactedAtSeq`,
// and the present-tense divider gains the MEMORY FACT ("older messages compacted into a summary") + a PEEK popup
// revealing the marker text. Then the carry-forward pin: the stored marker is DURABLE chat state — it survives
// and still drives the divider (previewFit reports `compactSummary`) regardless of the api that reads it.
//
// Two pins, one flow:
//   P1 — MANAGED compaction fires on the local agent-sdk model: after tiny-ceiling turns, the API preview
//        reports a non-null `compactSummary`, and the DOM divider shows the compaction fact + a working peek.
//   P2 — CARRY-FORWARD: the marker is stored on the chat row (portable), so the previewFit `compactSummary`
//        stays populated (the read side never regenerates it — only the agent-sdk WRITE path generates).
//
// @live: seeds via real API turns on the local model (~15-30s warm; managed compaction adds a summarizer
// generation). Skipped unless E2E_LIVE=1. Fully self-seeding; MINTS its own character (no shared-seed reuse).

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./support/chat-room";
import type { ChatRoute } from "./support/trpc";
import {
  getChatRoute,
  getUserSettings,
  listCanon,
  mintFreshCharacter,
  previewContextFit,
  removeCharacter,
  sendTurn,
  setChatRoute,
  startChat,
  trpcMutation,
  trpcQuery,
} from "./support/trpc";

// Managed compaction is agent-sdk-only; since the agent-sdk × vllm skin retired (D109), the only agent-sdk
// route is the owner's hosted Claude subscription. Each test pins this and restores the prior route.
const AGENT_SDK_ROUTE: ChatRoute = { api: "agent-sdk", source: "max-pro-sub" };

const TINY_CEILING = 220; // small enough that the fit drops older turns → a boundary → the reactive trigger
const STABLE_CEILING = 1500; // the STABLE preset cap for the resume leg — small enough the DOMAIN fit trims (→ marker
// exclusion → reseed), large enough the (env-cap-DROPPED, managed) SDK session runs without an overflow error.
const MANAGED = { mode: "managed" as const, thresholdPct: 0.6, instructions: "Summarize tersely; keep names and the current scene." };
const COMPACTED_INTO_SUMMARY = /compacted into a summary/i;

test("managed compaction fires on the local model, the divider carries the compaction fact + peek, and the marker carries forward", { tag: "@live" }, async ({
  page,
}) => {
  test.setTimeout(240_000);

  const characterId = await mintFreshCharacter(
    castId<CharacterHandle>("e2e-managed-compaction"),
    "Compactor",
    "Hello — let us begin a long, detailed saga together.",
  );
  const priorRoute = await getChatRoute();
  await setChatRoute(AGENT_SDK_ROUTE); // managed compaction is agent-sdk-only (D109: no local agent-sdk route)
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
    await expect(divider).toContainText(COMPACTED_INTO_SUMMARY);

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
    // of the prompt. The tiny-ceiling P3 turn STAMPS a real mid-transcript boundary on its assistant canon row
    // (`contextBoundaryMessageId` = the earliest row still inside its prompt): the covered/older turns were dropped
    // from THAT turn's prompt, and the stamp names where. That canon stamp — written by the actual generated turn,
    // not a default-preset preview — is the honest, recall-independent shrinkage proof.
    //
    // NOT the assistant row's per-turn `tokensIn`: at the TINY 220 ceiling every prompt is trimmed to roughly the
    // same tiny size, so a `postTokensIn < prePeak` compare is marginal noise (it flaked 312 vs 301). And NOT the
    // default-preset `previewContextFit`: P3's ceiling is a per-SEND intent, so the CURRENT-settings preview (full
    // window) drops nothing (droppedCount=0) — the shrinkage lives on the STAMPED turn, not the preview. ──
    await sendTurn(chatId, "Continue the tale a little further.", TINY_CEILING, MANAGED);
    const postCanon = await listCanon(chatId);
    const stampedTurn = postCanon.findLast((m) => m.role === "assistant" && m.contextBoundaryMessageId !== null);
    // The tiny-ceiling turn stamped a boundary (its prompt excluded older turns), and that boundary is a REAL
    // mid-transcript row — not the greeting/first row — so covered turns fell out of the prompt.
    expect(stampedTurn?.contextBoundaryMessageId ?? null).not.toBeNull();
    const boundaryIdx = postCanon.findIndex((m) => m.id === stampedTurn?.contextBoundaryMessageId);
    expect(boundaryIdx).toBeGreaterThan(0);
  } finally {
    if (priorRoute !== undefined) {
      await setChatRoute(priorRoute).catch(() => null);
    }
    await removeCharacter(characterId);
  }
});

// GAP 2 (stable-cap leg): the cap is set ONCE on a preset (no per-send changes), so the SDK session is NOT
// forked-per-send like the first test — this leg exercises the stable-cap path across managed turns.
//
// DISPOSITION REALITY (verified against the running vLLM-agent-sdk stack, provider.session log): at this TINY
// 1500-token ceiling the SDK session CLEARS every turn — it does NOT resume. That is CORRECT, not a bug:
// `splitAgentHistory` (entry/compose/chat.ts) derives the session seed from the SHAPED history (marker-EXCLUDED
// via `toShapeCanon`, then fit-trimmed). Once compaction covers the span AND the 1500-cap fit trims the rest, the
// shaped history carries no assistant row before the current user turn → the seed is EMPTY → `toSeedTurns([]) → []`
// → disposition "cleared" (a fresh throwaway session, no resume). The compacted history rides the SUMMARY MARKER in
// the SYSTEM prompt, not a resumable transcript — so there is genuinely nothing to resume. (The disposition is
// backend-agnostic — the SDK's session persistence is client-side transcript replay, identical vs Claude or vLLM;
// clearing here is driven by our seed-emptying, not the backend.) So this leg does NOT assert "resumed" — the
// original resume premise was false at this ceiling.
//
// SIGNAL: canon `tokensIn` is a per-turn DELTA on the SDK session (hosted-verified) — useless for shrinkage. The
// HONEST, backend/disposition-INDEPENDENT wire signal that the compacted-away span left the prompt is previewFit's
// `droppedCount` + `boundaryMessageId`: once the marker covers a span, the DOMAIN fit over the marker-EXCLUDED shaped
// history reports droppedCount>0 and a boundary ABOVE the first canon row — the covered/older turns are no longer in
// the shaped history (regardless of whether the SDK session resumed, reseeded, or cleared). NOT `usedTokens`: that
// field is the RESIDUAL history-turn cost AFTER the fit trims, and the fit shares its budget with a VARIABLE-size
// `{{memory}}` recall injection (embed-driven, counted in systemTokens) — so a bigger recall shrinks the history budget
// and usedTokens NON-MONOTONICALLY (it can swing up or down turn to turn regardless of compaction). A max(pre)/postUsed
// compare over that residual is flaky by construction and is fooled by recall size; droppedCount + boundary are the
// recall-independent shrinkage proof.
test("STABLE-cap leg: managed compaction drops the covered turns from a stable-cap session's shaped history (session clears at this ceiling)", {
  tag: "@live",
}, async ({}) => {
  test.setTimeout(300_000);

  const characterId = await mintFreshCharacter(
    castId<CharacterHandle>("e2e-compaction-resume"),
    "Resumer",
    "Hello — a long saga begins, resumed turn to turn.",
  );
  const priorDefaultPresetId = (await getUserSettings()).config.seeds.defaultPresetId;
  const priorRoute = await getChatRoute();
  await setChatRoute(AGENT_SDK_ROUTE); // managed compaction is agent-sdk-only (D109: no local agent-sdk route)
  const tinyPreset = await trpcMutation<{ readonly id: string }>("preset.create", { name: "e2e-managed-stable", kind: "chat" });
  try {
    // Point the user default at a preset carrying a STABLE maxContextTokens (no per-send override → a stable cap
    // each turn, not the first test's changing-cap fork; at this tiny ceiling the session clears each turn — see header).
    const created = await trpcQuery<{ readonly config: { readonly params?: Record<string, unknown> } }>("preset.get", { id: tinyPreset.id });
    await trpcMutation("preset.update", {
      id: tinyPreset.id,
      config: { ...created.config, params: { ...created.config.params, maxContextTokens: STABLE_CEILING } },
    });
    await trpcMutation("settings.updateUserSettingsSection", { section: "seeds", patch: { defaultPresetId: tinyPreset.id } });

    const chatId = await startChat([characterId]);
    // A TOLERANT send: on a stable-cap session the accumulated transcript can momentarily overflow the SDK before a
    // compaction catches up (the exact wedge the pre-turn arm exists to escape) — a single is_error turn is EXPECTED
    // and non-fatal; the pre-turn arm compacts and the next turn recovers. We drive enough turns that maxSeq passes
    // the verbatim tail (so the pre-turn arm has a coverage point) and the marker lands.
    const tolerantSend = async (text: string): Promise<void> => {
      try {
        await sendTurn(chatId, text, undefined, MANAGED);
      } catch {
        // An SDK overflow on the stable-cap session — the pre-turn compaction arm fires on the NEXT attempt.
      }
    };
    // Drive managed turns with NO per-send cap (the preset's stable cap governs).
    const beats = [
      "Introduce a knight named Sir Aldric and the town of Millbrook, with vivid detail.",
      "Aldric meets a merchant named Petra at the market; describe their exchange at length.",
      "They discover a hidden map under the old bridge; describe it richly.",
      "Describe the road the map traces across the kingdom in detail.",
      "Aldric recruits companions for the journey; introduce each with specifics.",
      "The party sets out; narrate the first day's travel vividly.",
    ];
    for (const beat of beats) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential dependent turns.
      await tolerantSend(beat);
    }

    // The marker landed (managed compaction fired on the stable-cap session — via the pre-turn or post-turn arm as the
    // usage arc crossed the threshold).
    await expect.poll(async () => (await previewContextFit(chatId)).compactSummary, { timeout: 60_000, intervals: [500, 1000, 2000] }).not.toBeNull();

    // The shrinkage proof (recall- AND disposition-independent): with the marker covering a span, the DOMAIN fit over
    // the marker-EXCLUDED shaped history DROPS the covered/older turns — droppedCount>0 and the boundary sits ABOVE the
    // transcript head. The compacted-away turns are no longer in the shaped history (whether the SDK session resumed,
    // reseeded, or cleared this turn — see header: at this ceiling it clears). This does NOT read `usedTokens`: that
    // residual is confounded by the variable-size `{{memory}}` recall sharing the same budget (see the header) —
    // droppedCount + boundary are the honest, recall-independent signal.
    const post = await previewContextFit(chatId);
    expect(post.droppedCount).toBeGreaterThan(0);
    const canon = await listCanon(chatId);
    expect(post.boundaryMessageId).not.toBeNull();
    // The boundary advanced past the transcript head — the earliest kept row is NOT the greeting/first row, so older
    // (covered) turns fell out of the prompt rather than the whole transcript still fitting.
    expect(post.boundaryMessageId).not.toBe(canon[0]?.id ?? null);
  } finally {
    await trpcMutation("settings.updateUserSettingsSection", { section: "seeds", patch: { defaultPresetId: priorDefaultPresetId ?? null } });
    await trpcMutation("preset.remove", { id: tinyPreset.id });
    if (priorRoute !== undefined) {
      await setChatRoute(priorRoute).catch(() => null);
    }
    await removeCharacter(characterId);
  }
});
