// The optional rule field's grammars pinned by their literal sentences: the rule editor and its cases call the builders,
// so only an outcome spelled out here fails when a grammar is reworded or loses its field.
import { expect, test } from "@orb/testkit/node";
import { ruleFieldAddName, ruleFieldRemoveConfirmName } from "#client/features/automation/lib/automation-names.ts";
import { IMAGE_NEGATIVE_PROMPT_NOUN } from "#client/lib/image-size-copy.ts";

test("an optional rule field's Add and its removal confirm say the field in lower case", () => {
  expect([ruleFieldAddName(IMAGE_NEGATIVE_PROMPT_NOUN), ruleFieldRemoveConfirmName(IMAGE_NEGATIVE_PROMPT_NOUN)]).toEqual([
    "Add negative prompt",
    "Remove negative prompt?",
  ]);
});
