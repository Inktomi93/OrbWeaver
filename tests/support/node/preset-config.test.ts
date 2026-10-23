// @subject tests/support/iso/preset-config.ts
import { makeGuidedActionsConfig, makePromptConfig, makeUserIntent } from "../iso/preset-config.ts";
import { expect, test } from "./fixtures.ts";

test("caller mutations cannot change a produced preset or another caller's default templates", () => {
  const actions = makeGuidedActionsConfig();
  const original = actions.response.prompt;
  const config = makePromptConfig({ guidedActions: actions });
  actions.response.prompt = "Caller mutation";
  expect(config.guidedActions?.response.prompt).toBe(original);
  expect(makePromptConfig().guidedActions?.response.prompt).toBe(original);
  expect(makeGuidedActionsConfig().response.prompt).toBe(original);
});

test("generation output construction retains the owner's host-environment refusal", () => {
  expect(() => makeUserIntent({ advanced: { claudeEnv: { ["PATH"]: "/tmp/corpus" } } })).toThrow("unsafe runtime environment key is forbidden");
  expect(() => makeUserIntent({ advanced: { claudeEnv: { ["CLAUDE_CODE_DISABLE_AUTO_MEMORY"]: "0" } } })).toThrow(
    "unsafe runtime environment key is forbidden",
  );
});
