// domain/chat/substrate/prompt-eligibility — the ONE predicate both prompt boundaries (the compaction
// marker's transcript, the quiet extractor's scene) read. Pins BOTH planes and their independence: the host's
// per-row hide and the row's declared purpose each veto on their own, so a fix to one cannot quietly drop the
// other (#1463 item 3 was exactly that — one boundary carrying only the hide half).

import type { MessageKind } from "@orb/contracts/chat";
import { MESSAGE_KINDS } from "@orb/contracts/chat";
import { describe } from "vitest";
import { isPromptEligible } from "../../../../../packages/server/src/domain/chat/substrate/prompt-eligibility.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const row = (kind: MessageKind, excludedFromPrompt: boolean): { kind: MessageKind; excludedFromPrompt: boolean } => ({ kind, excludedFromPrompt });

describe("isPromptEligible", () => {
  test("an ordinary visible row is prompt material", () => {
    expect(isPromptEligible(row("standard", false))).toBe(true);
  });

  test("the host's hide vetoes on its own (any kind)", () => {
    expect(isPromptEligible(row("standard", true))).toBe(false);
    expect(isPromptEligible(row("narrator", true))).toBe(false);
  });

  test("a `comment` is ineligible even unhidden — its declared purpose is not prompt material (D129)", () => {
    expect(isPromptEligible(row("comment", false))).toBe(false);
  });

  test("a narrator row IS prompt material (system-channel is still an ordinary history row on the wire)", () => {
    expect(isPromptEligible(row("narrator", false))).toBe(true);
  });

  test("every declared kind has a verdict — a fourth kind cannot slip through unclassified", () => {
    // Drives the WHOLE kind vocabulary rather than the three spelled above, so adding a kind without deciding
    // its prompt policy shows up here as well as at the policy record.
    expect(MESSAGE_KINDS.map((kind) => typeof isPromptEligible(row(kind, false)))).toEqual(MESSAGE_KINDS.map(() => "boolean"));
  });
});
