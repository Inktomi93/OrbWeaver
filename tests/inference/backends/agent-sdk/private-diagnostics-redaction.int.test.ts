// @subject packages/inference/src/backends/agent-sdk/execution.ts
// @subject packages/inference/src/backends/agent-sdk/stderr.ts
import { expect, test } from "@orb/testkit/node";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { vi } from "vitest";
import { JSON_TOKEN, NATIVE_PARENT_TEST_BASE_MS, nativeParent, TOKEN } from "./private-diagnostics.fixtures.ts";

// Each case is its own native SDK parent (private-diagnostics.fixtures.ts); that process is the subject.
vi.setConfig({ testTimeout: budget(NATIVE_PARENT_TEST_BASE_MS) });

test("native SDK private diagnostics redact an incomplete credential prefix at physical stderr EOF", async ({ importStagingDir }) => {
  const token = `private-prefix:${"unique-secret-byte-".repeat(8)}`;
  const { result, bytes } = await nativeParent(importStagingDir, "sdk-file", { tokens: [token], prompts: ["SDK_PREFIX_EOF"] });
  expect(result.exitCodes).toEqual([7]);
  expect(bytes).toContain("sdk-prefix-eof:");
  expect(bytes).not.toContain("private-prefix:");
  expect(bytes).not.toContain("unique-secret-byte");
});

test("native stdin and non-JSON stdout diagnostic copies are scrubbed without changing the protocol", async ({ importStagingDir }) => {
  const { result, bytes } = await nativeParent(importStagingDir, "sdk-file", { tokens: [TOKEN], prompts: [`${TOKEN} SDK_PRIVATE_STDOUT`] });
  expect(result.exitCodes).toEqual([7]);
  expect(bytes).toContain("Writing to stdin:");
  expect(bytes).toContain("Non-JSON stdout:");
  expect(bytes).toContain("private-stdout-safe-context");
  expect(bytes).not.toContain(TOKEN);
  expect(bytes).not.toContain(JSON_TOKEN);
  expect(bytes).not.toContain(JSON_TOKEN.slice(0, 10));
});

test("overlapping native queries bind private diagnostic projections to their own saved secret sets", async ({ importStagingDir }) => {
  const second = 'second-private-sdk-"<different>\\credential-material';
  const { result, bytes } = await nativeParent(importStagingDir, "sdk-file", {
    tokens: [TOKEN, second],
    prompts: ["SDK_DIAGNOSTIC_CRASH", "SDK_DIAGNOSTIC_CRASH"],
  });
  expect(result.nativeChildren).toBe(2);
  expect(result.exitCodes).toEqual([7, 7]);
  expect(result.errors).toHaveLength(2);
  expect(bytes.match(/Claude Code process exited with code 7/gu)?.length).toBeGreaterThanOrEqual(2);
  expect(bytes).not.toContain(TOKEN);
  expect(bytes).not.toContain(second);
  expect(bytes).not.toContain(JSON.stringify(second).slice(1, -1));
});
