// Unit: the chat-warning notification mapper (features/chat/lib/warning-notice). The CT QueryClient has
// no MutationCache seam so toast copy is unobservable in a CT (ct-queryclient precedent) — the code→copy
// decision is pure and tested HERE. Proves the mapper is TOTAL over CHAT_WARNING_CODES (every code yields
// non-empty, distinct copy — no degrade ships user-silent), and pins the two codes the restoration exists
// to catch: the compaction degrades (#9 — compaction_failed, context_trimmed_no_summary).
//
// It also pins the two things the INFRA-WARN-DEAF side-eye found wrong with the copy itself: the notice is
// SPLIT (a scannable title + the detail below it, never one three-line bold sentence), and it speaks the
// UI's own connection vocabulary — "direct/BYOK" named a concept that appears on no screen in the app.

import type { ChatSettingsAdjustedWarning, ChatWarning, ProviderAdjustmentKind } from "@orb/contracts/chat";
import { CHAT_WARNING_CODES, PROVIDER_ADJUSTMENT_KINDS } from "@orb/contracts/chat";
import { warningNotice } from "../../../../../packages/client/src/features/chat/lib/warning-notice.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// ── Specific arms: each degrade reads honestly + names WHAT was dropped ──────────────────────────────

/** The mapper's own return shape — `NotifyNotice` is a client-internal type this lane has no import path to. */
type Notice = ReturnType<typeof warningNotice>;

/** Every code except the detail-bearing carrier is written from the code alone. */
function noticeFor(code: Exclude<ChatWarning["code"], "settings_adjusted">): Notice {
  return warningNotice({ code });
}

/** A `settings_adjusted` warning as the bus delivers it — the class plus whatever detail that class carries. */
function adjusted(adjustment: ProviderAdjustmentKind, detail: Omit<ChatSettingsAdjustedWarning, "adjustment" | "code"> = {}): Notice {
  return warningNotice({ ...detail, adjustment, code: "settings_adjusted" });
}

test("image_dropped → the model can't see images", () => {
  expect(noticeFor("image_dropped").description).toContain("can't see images");
});

test("video_dropped → the model can't watch videos (#317)", () => {
  expect(noticeFor("video_dropped").description).toContain("can't watch videos");
});

test("tools_unsupported → tools were turned off", () => {
  expect(noticeFor("tools_unsupported").title).toContain("Tools were turned off");
});

test("image_edit_dropped → generated without your reference", () => {
  expect(noticeFor("image_edit_dropped").description).toContain("without your reference");
});

test("guided_placed_as_injection → steering added inline, no marker to place it in", () => {
  expect(noticeFor("guided_placed_as_injection").description).toContain("inline instruction");
});

// ── #1440: the ten provider degradations. Each one's notice must name the SETTING (or the substitute the
// provider used), because "something was adjusted" is exactly the silence this carrier exists to end. ──

test("a dropped sampling knob is named by the word the preset deck prints", () => {
  expect(adjusted("sampling_knob_dropped", { knob: "topP" }).title).toContain("Top-P");
  expect(adjusted("sampling_knob_dropped", { knob: "repetitionPenalty" }).title).toContain("Repetition penalty");
});

test("the thinking-budget drop says what to set INSTEAD (a mode mismatch, not a missing capability)", () => {
  expect(adjusted("sampling_knob_dropped", { knob: "thinkingBudgetTokens" }).description).toContain("effort dial");
});

test("an unknown quality level reads as OUR stale value, never as a model limitation", () => {
  expect(adjusted("sampling_knob_dropped", { knob: "quality" }).description).toContain("isn't one this app knows");
});

test("a knob-less sampling drop never invents a setting name", () => {
  const notice = adjusted("sampling_knob_dropped");
  expect(notice.title).toBe("A generation setting wasn't used for this reply");
});

test("the mandatory-reasoning clamp names the effort that ran", () => {
  expect(adjusted("reasoning_mandatory_clamp", { appliedEffort: "medium" }).description).toContain("medium");
});

test("the budget clamp names the budget that ran", () => {
  expect(adjusted("reasoning_budget_clamped", { appliedBudget: 1536 }).description).toContain("1536");
});

test("a clamp with no value still reads honestly, without a fabricated number", () => {
  const notice = adjusted("reasoning_budget_clamped");
  expect(notice.description).toContain("no room");
  expect(notice.description).not.toMatch(/\d/);
});

test("the tool-result drop warns that the model may read a FAILURE as a success", () => {
  expect(adjusted("tool_result_error_dropped").description).toContain("read it as one that worked");
});

test("the prefill drop explains the trade the turn actually made", () => {
  expect(adjusted("reasoning_dropped_for_prefill").description).toContain("continued your text");
});

test("the forced-tool downgrade says the call became the model's choice, not that tools were dropped", () => {
  expect(adjusted("tool_choice_downgraded").description).toContain("chose whether to use one");
});

test("the carry downgrade says thinking still rode within the reply, not that the carry was dropped", () => {
  const notice = adjusted("carry_reasoning_downgraded");
  expect(notice.title).toBe("Reasoning carry was limited to this reply");
  expect(notice.description).toContain("only within this reply's tool calls");
});

test("every provider-degradation class has its own distinct, split notice (exhaustive)", () => {
  const notices = PROVIDER_ADJUSTMENT_KINDS.map((kind) => adjusted(kind));
  for (const notice of notices) {
    expect(notice.title.length).toBeGreaterThan(0);
    expect(notice.title.length).toBeLessThanOrEqual(60);
    expect(notice.description).toBeDefined();
  }
  expect(new Set(notices.map((notice) => notice.title)).size).toBe(PROVIDER_ADJUSTMENT_KINDS.length);
});

// ── The #9 compaction degrades the restoration must surface (was silently swallowed) ─────────────────

test("compaction_failed → the summary couldn't update, reply unaffected", () => {
  expect(noticeFor("compaction_failed").title).toContain("summary couldn't update");
  expect(noticeFor("compaction_failed").description).toContain("Your reply is unaffected");
});

test("context_trimmed_no_summary → the no-wall belt fired (oldest messages dropped to keep going)", () => {
  expect(noticeFor("context_trimmed_no_summary").description).toContain("oldest messages were dropped");
});

test("memory_rerank_unavailable → vector recall continued for this turn", () => {
  const notice = noticeFor("memory_rerank_unavailable");
  expect(notice.title).toContain("Memory reranking");
  expect(notice.description).toContain("vector recall");
  expect(notice.description).toContain("this turn");
});

// #2510 — the reply SURVIVED (that is the whole point of the degrade), so the copy has to say so before it
// says anything went wrong, and it has to name a place the user can actually go. "Index", "vector space" and
// "embedding generation" are words no screen shows; Connections is a screen.
test("retrieval_index_unavailable → the reply went through, and the copy points at Connections", () => {
  const notice = noticeFor("retrieval_index_unavailable");
  expect(notice.description).toContain("went through");
  expect(notice.description).toContain("Connections");
  expect(notice.title).not.toContain("index");
});

// ── P1-3: the copy speaks the UI's OWN connection vocabulary ─────────────────────────────────────────

test("custom_parameters_ignored names the real connection labels, never 'direct' or 'BYOK'", () => {
  const notice = noticeFor("custom_parameters_ignored");
  expect(notice.description).toContain("OpenRouter");
  // The label the Connections pane prints for this source (connections-model.ts SOURCE_LABELS).
  expect(notice.description).toContain("Custom OpenAI-compatible");
});

// `rg -i BYOK` across the client returns zero USER-FACING hits — a notice may not be the first place a
// user meets a word. Checked over every code, so a future arm can't reintroduce it.
const BANNED_VOCABULARY = [/\bbyok\b/i, /custom-byo/i, /\bdirect connection\b/i];

test("no notice uses vocabulary that exists nowhere in the UI", () => {
  for (const notice of everyNotice()) {
    for (const pattern of BANNED_VOCABULARY) {
      expect(`${notice.title} ${notice.description ?? ""}`).not.toMatch(pattern);
    }
  }
});

/** Every notice this mapper can produce: one per code, and one per degradation class behind the carrier. */
function everyNotice(): readonly Notice[] {
  const codes = CHAT_WARNING_CODES.filter((code) => code !== "settings_adjusted").map((code) => noticeFor(code));
  return [...codes, ...PROVIDER_ADJUSTMENT_KINDS.map((kind) => adjusted(kind))];
}

// ── Totality: EVERY CHAT_WARNING_CODES member maps to non-empty, distinct copy (no silent degrade) ───

test("every CHAT_WARNING_CODES value yields a non-empty, distinct, SPLIT notice (exhaustive)", () => {
  const notices = everyNotice();
  for (const notice of notices) {
    expect(notice.title.length).toBeGreaterThan(0);
    // Split, not one sentence: the title scans, the description explains. Every degrade has both.
    expect(notice.description).toBeDefined();
    // A title that runs past a scannable line is the defect this split exists to end.
    expect(notice.title.length).toBeLessThanOrEqual(60);
  }
  // Distinct: a per-degrade drop must read specifically, never collapsed to one generic line.
  expect(new Set(notices.map((notice) => notice.title)).size).toBe(notices.length);
});
