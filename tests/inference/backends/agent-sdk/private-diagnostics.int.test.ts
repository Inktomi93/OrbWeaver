// @subject packages/inference/src/backends/agent-sdk/execution.ts
// @subject packages/inference/src/backends/agent-sdk/stderr.ts
import { expect, test } from "@orb/testkit/node";
import { SDK_PRIVATE_DIAGNOSTIC_SINKS, SDK_SCRIPT_IDENTITY_TYPE } from "@orb/testkit/node/helpers";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { vi } from "vitest";
import { JSON_TOKEN, NATIVE_PARENT_TEST_BASE_MS, nativeParent, TOKEN } from "./private-diagnostics.fixtures.ts";

// Each case is its own native SDK parent (private-diagnostics.fixtures.ts); that process is the subject.
vi.setConfig({ testTimeout: budget(NATIVE_PARENT_TEST_BASE_MS) });

for (const sink of SDK_PRIVATE_DIAGNOSTIC_SINKS) {
  test(`${sink} stores safe ordinary diagnostics and native exit facts without the saved credential`, async ({ importStagingDir }) => {
    const { result, bytes } = await nativeParent(importStagingDir, sink, {
      tokens: [TOKEN],
      prompts: [sink === "sdk-file" ? "SDK_DIAGNOSTIC_CRASH" : "SDK_PRIVATE_GENERIC"],
    });
    expect(result.nativeChildren).toBe(1);
    expect(result.exitCodes).toEqual([7]);
    expect(result.signalCodes).toEqual([null]);
    expect(bytes).toContain("Claude Code process exited with code 7");
    expect(bytes).toContain("sdk-diagnostic: café");
    expect(result.appLogs.join("\n")).toContain("sdk-diagnostic: café");
    expect(result.appLogs.join("\n")).not.toContain(TOKEN);
    expect(bytes).not.toContain(TOKEN);
    expect(bytes).not.toContain(JSON_TOKEN);
    expect(bytes).not.toContain(SDK_SCRIPT_IDENTITY_TYPE);
    expect(result.appLogs.join("\n")).not.toContain(SDK_SCRIPT_IDENTITY_TYPE);
  });
}

test("native SDK private tail scrubs oversized credential bytes before its cap", async ({ importStagingDir }) => {
  const token = `${"oversized-opaque-credential:".repeat(120)}:end`;
  const { result, bytes } = await nativeParent(importStagingDir, "sdk-file", { tokens: [token], prompts: ["SDK_SHAPED_DIAGNOSTIC:intact"] });
  expect(result.exitCodes).toEqual([7]);
  expect(bytes).not.toContain("oversized-opaque-credential");
  expect(bytes).toContain("sdk-shaped-diagnostic:intact:");
  expect(bytes).toContain("complete");
  expect(result.errors.join("\n")).not.toContain("oversized-opaque-credential");
});
