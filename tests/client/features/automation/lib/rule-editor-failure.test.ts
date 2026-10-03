// The rule editor's refusal copy: every code the server refuses a rule write with reaches its own sentence, never
// the generic "not accepted" line that hides what to fix. A code that names a specific thing carries the server's
// own sentence along.

import { AUTOMATION_RULE_REFUSAL_CODES, ruleRefusalReason } from "@orb/contracts/automation";
import { describe } from "vitest";
import { ruleEditorFailure } from "../../../../../packages/client/src/features/automation/lib/rule-editor-failure.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SERVER_SENTENCE = "tool 'zz_probe' is not what you think";
const GENERIC = "The rule was not accepted. Review its fields and your current permissions before editing again.";

function refusal(reason: string): Error {
  return Object.assign(new Error(SERVER_SENTENCE), { data: { reason, httpStatus: 400 } });
}

describe("ruleEditorFailure", () => {
  test.each(AUTOMATION_RULE_REFUSAL_CODES)("%s gets its own copy, not the generic refusal", (code) => {
    const failure = ruleEditorFailure(refusal(ruleRefusalReason(code)));
    expect(failure?.message).not.toBe(GENERIC);
    expect(failure?.message).toMatch(/\S/u);
    expect(failure?.retryable).toBe(false);
  });

  test.each([
    "bad_action",
    "global_arm_scope",
    "global_predicate_scope",
    "preset_knob",
    "preset_scope",
    "unattached_book",
  ] as const)("%s carries the server's sentence, because it names what was refused", (code) => {
    expect(ruleEditorFailure(refusal(ruleRefusalReason(code)))?.message).toContain(SERVER_SENTENCE);
  });

  test("a failure with no refusal code is unstructured: it keeps its own message and its retry path", () => {
    expect(ruleEditorFailure(refusal("something_else"))).toEqual({ message: SERVER_SENTENCE, retryable: true });
  });
});
