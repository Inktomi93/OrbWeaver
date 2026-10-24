// @subject packages/inference/src/backends/agent-sdk/execution.ts
// @subject packages/inference/src/backends/agent-sdk/stderr.ts
import { expect, test } from "@orb/testkit/node";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { vi } from "vitest";
import { NATIVE_PARENT_TEST_BASE_MS, nativeParent } from "./private-diagnostics.fixtures.ts";

// Each case is its own native SDK parent (private-diagnostics.fixtures.ts); that process is the subject.
vi.setConfig({ testTimeout: budget(NATIVE_PARENT_TEST_BASE_MS) });

for (const [label, ending] of [
  ["LF", "\n"],
  ["CRLF", "\r\n"],
  ["CR", "\r"],
] as const) {
  test(`native stdout ${label} framing cannot fragment a saved credential before private diagnostic redaction`, async ({ importStagingDir }) => {
    const token = `first-private-fragment${ending}second-private-fragment`;
    const { result, bytes } = await nativeParent(importStagingDir, "sdk-file", { tokens: [token], prompts: [`${token} SDK_PRIVATE_STDOUT`] });
    expect(result.exitCodes).toEqual([7]);
    expect(bytes).toContain("private-stdout-safe-context:");
    expect(bytes).toContain("Non-JSON stdout:");
    expect(bytes).not.toContain("first-private-fragment");
    expect(bytes).not.toContain("second-private-fragment");
    expect(bytes).not.toContain(JSON.stringify(token).slice(1, -1));
  });
}

test("an unterminated native stdout credential prefix is redacted at the diagnostic record boundary", async ({ importStagingDir }) => {
  const token = `stdout-prefix-secret-material:${"unique-private-byte-".repeat(8)}`;
  const { result, bytes } = await nativeParent(importStagingDir, "sdk-file", { tokens: [token], prompts: ["SDK_PRIVATE_STDOUT_PREFIX_EOF"] });
  expect(result.exitCodes).toEqual([7]);
  expect(bytes).toContain("private-stdout-prefix-safe-context:");
  expect(bytes).toContain("Non-JSON stdout:");
  expect(bytes).not.toContain("stdout-prefix-secret-material");
  expect(bytes).not.toContain("unique-private-byte");
});
