// Unit: the chat-warning notification mapper (features/chat/lib/warning-notice). The CT QueryClient has
// no MutationCache seam so toast copy is unobservable in a CT (ct-queryclient precedent) — the code→copy
// decision is pure and tested HERE. Proves the mapper is TOTAL over CHAT_WARNING_CODES (every code yields
// non-empty, distinct copy — no degrade ships user-silent), and pins the two codes the restoration exists
// to catch: the compaction degrades (#9 — compaction_failed, context_trimmed_no_summary).
//
// It also pins the two things the INFRA-WARN-DEAF side-eye found wrong with the copy itself: the notice is
// SPLIT (a scannable title + the detail below it, never one three-line bold sentence), and it speaks the
// UI's own connection vocabulary — "direct/BYOK" named a concept that appears on no screen in the app.

import { CHAT_WARNING_CODES } from "@orb/contracts/chat";
import { warningNotice } from "../../../../../packages/client/src/features/chat/lib/warning-notice.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// ── Specific arms: each degrade reads honestly + names WHAT was dropped ──────────────────────────────

test("image_dropped → the model can't see images", () => {
  expect(warningNotice("image_dropped").description).toContain("can't see images");
});

test("tools_unsupported → tools were turned off", () => {
  expect(warningNotice("tools_unsupported").title).toContain("Tools were turned off");
});

test("image_edit_dropped → generated without your reference", () => {
  expect(warningNotice("image_edit_dropped").description).toContain("without your reference");
});

test("guided_placed_as_injection → steering added inline, no marker to place it in", () => {
  expect(warningNotice("guided_placed_as_injection").description).toContain("inline instruction");
});

// ── The #9 compaction degrades the restoration must surface (was silently swallowed) ─────────────────

test("compaction_failed → the summary couldn't update, reply unaffected", () => {
  expect(warningNotice("compaction_failed").title).toContain("summary couldn't update");
  expect(warningNotice("compaction_failed").description).toContain("Your reply is unaffected");
});

test("context_trimmed_no_summary → the no-wall belt fired (oldest messages dropped to keep going)", () => {
  expect(warningNotice("context_trimmed_no_summary").description).toContain("oldest messages were dropped");
});

// ── P1-3: the copy speaks the UI's OWN connection vocabulary ─────────────────────────────────────────

test("custom_parameters_ignored names the real connection labels, never 'direct' or 'BYOK'", () => {
  const notice = warningNotice("custom_parameters_ignored");
  expect(notice.description).toContain("OpenRouter");
  // The label the Connections pane prints for this source (connections-model.ts SOURCE_LABELS).
  expect(notice.description).toContain("Custom OpenAI-compatible");
});

// `rg -i BYOK` across the client returns zero USER-FACING hits — a notice may not be the first place a
// user meets a word. Checked over every code, so a future arm can't reintroduce it.
const BANNED_VOCABULARY = [/\bbyok\b/i, /custom-byo/i, /\bdirect connection\b/i];

test("no notice uses vocabulary that exists nowhere in the UI", () => {
  for (const code of CHAT_WARNING_CODES) {
    const { title, description } = warningNotice(code);
    for (const pattern of BANNED_VOCABULARY) {
      expect(`${title} ${description ?? ""}`).not.toMatch(pattern);
    }
  }
});

// ── Totality: EVERY CHAT_WARNING_CODES member maps to non-empty, distinct copy (no silent degrade) ───

test("every CHAT_WARNING_CODES value yields a non-empty, distinct, SPLIT notice (exhaustive)", () => {
  const notices = CHAT_WARNING_CODES.map((code) => warningNotice(code));
  for (const notice of notices) {
    expect(notice.title.length).toBeGreaterThan(0);
    // Split, not one sentence: the title scans, the description explains. Every degrade has both.
    expect(notice.description).toBeDefined();
    // A title that runs past a scannable line is the defect this split exists to end.
    expect(notice.title.length).toBeLessThanOrEqual(60);
  }
  // Distinct: a per-degrade drop must read specifically, never collapsed to one generic line.
  expect(new Set(notices.map((notice) => notice.title)).size).toBe(CHAT_WARNING_CODES.length);
});
