// Unit: the chat-warning notification mapper (features/chat/lib/warning-notice). The CT QueryClient has
// no MutationCache seam so toast copy is unobservable in a CT (ct-queryclient precedent) — the code→copy
// decision is pure and tested HERE. Proves the mapper is TOTAL over CHAT_WARNING_CODES (every code yields
// non-empty, distinct copy — no degrade ships user-silent), and pins the two codes the restoration exists
// to catch: the compaction degrades (#9 — compaction_failed, context_trimmed_no_summary).

import { CHAT_WARNING_CODES } from "@orb/contracts/chat";
import { warningNotice } from "../../../../../packages/client/src/features/chat/lib/warning-notice";
import { expect, test } from "../../../../support/fixtures";

// ── Specific arms: each degrade reads honestly + names WHAT was dropped ──────────────────────────────

test("image_dropped → the model can't see images", () => {
  expect(warningNotice("image_dropped")).toContain("can't see images");
});

test("tools_unsupported → tools were turned off", () => {
  expect(warningNotice("tools_unsupported")).toContain("Tools were turned off");
});

test("image_edit_dropped → generated without your reference", () => {
  expect(warningNotice("image_edit_dropped")).toContain("without your reference");
});

test("guided_placed_as_injection → steering added inline, no marker to place it in", () => {
  expect(warningNotice("guided_placed_as_injection")).toContain("inline instruction");
});

// ── The #9 compaction degrades the restoration must surface (was silently swallowed) ─────────────────

test("compaction_failed → the summary couldn't update, reply unaffected", () => {
  expect(warningNotice("compaction_failed")).toContain("summary couldn't update");
});

test("context_trimmed_no_summary → the no-wall belt fired (oldest messages dropped to keep going)", () => {
  expect(warningNotice("context_trimmed_no_summary")).toContain("oldest messages were dropped");
});

// ── Totality: EVERY CHAT_WARNING_CODES member maps to non-empty, distinct copy (no silent degrade) ───

test("every CHAT_WARNING_CODES value yields non-empty, distinct honest copy (exhaustive)", () => {
  const copies = CHAT_WARNING_CODES.map((code) => warningNotice(code));
  for (const copy of copies) {
    expect(copy.length).toBeGreaterThan(0);
  }
  // Distinct: a per-degrade drop must read specifically, never collapsed to one generic line.
  expect(new Set(copies).size).toBe(CHAT_WARNING_CODES.length);
});
