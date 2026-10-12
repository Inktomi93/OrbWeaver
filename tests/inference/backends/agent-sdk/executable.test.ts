import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { resolveClaudeExecutable } from "#inference/backends/agent-sdk/executable.ts";

test("the registered Agent SDK runtime resolves from the installed package", () => {
  const executable = resolveClaudeExecutable();

  expect(executable).not.toBeNull();
  expect(executable).toContain("@anthropic-ai/claude-agent-sdk");
});
