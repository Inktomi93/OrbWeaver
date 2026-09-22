import { resolveClaudeExecutable } from "../../../../packages/inference/src/backends/agent-sdk/executable.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("the registered Agent SDK runtime resolves from the installed package", () => {
  const executable = resolveClaudeExecutable();

  expect(executable).not.toBeNull();
  expect(executable).toContain("@anthropic-ai/claude-agent-sdk");
});
