// @subject packages/inference/src/backends/agent-sdk/execution.ts
// @subject packages/inference/src/backends/agent-sdk/stderr.ts
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { SdkPrivateDiagnosticInput, SdkPrivateDiagnosticResult } from "@orb/testkit/node/sdk-process.ts";
import { SDK_PRIVATE_DIAGNOSTIC_SINKS, sdkPrivateDiagnosticResultSchema } from "@orb/testkit/node/sdk-process.ts";

const TOKEN = 'private-sdk-"<opaque>\\credential-material';
const JSON_TOKEN = JSON.stringify(TOKEN).slice(1, -1);

async function nativeParent(
  directory: string,
  sink: (typeof SDK_PRIVATE_DIAGNOSTIC_SINKS)[number],
  input: Omit<SdkPrivateDiagnosticInput, "resultFile">,
): Promise<{ readonly result: SdkPrivateDiagnosticResult; readonly bytes: string }> {
  const resultFile = join(directory, "native-result.json");
  const child = spawn(
    process.execPath,
    [
      "--no-warnings",
      fileURLToPath(new URL("../../../support/node/sdk-private-diagnostic-root.ts", import.meta.url)),
      JSON.stringify({ ...input, resultFile } satisfies SdkPrivateDiagnosticInput),
      ...(sink === "generic-stderr" ? ["--debug-to-stderr"] : []),
    ],
    {
      env: {
        // biome-ignore lint/style/noProcessEnv: only this isolated native SDK parent receives diagnostic configuration; the test runner and prepared SDK child environment remain unchanged.
        ...process.env,
        ["ORB_ENV_NO_FILE"]: "1",
        ["LOG_LEVEL"]: "error",
        ["CORPUS_AUTOINDEX"]: "false",
        ["CLAUDE_CONFIG_DIR"]: directory,
        ["DEBUG_CLAUDE_AGENT_SDK"]: sink === "sdk-file" ? "1" : "",
        ["DEBUG_SDK"]: sink === "sdk-file" ? "" : "1",
        ["DEBUG"]: "",
        ["CLAUDE_CODE_DEBUG_LOGS_DIR"]: undefined,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let failure: Error | undefined;
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output += chunk;
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      failure = error;
    });
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null && failure === undefined) {
        resolve();
      } else {
        reject(new Error(`native diagnostic parent refused: ${String(code)}/${String(signal)}: ${output}`, { cause: failure }));
      }
    });
  });
  const result = sdkPrivateDiagnosticResultSchema.parse(JSON.parse(await readFile(resultFile, "utf8")));
  const files = sink === "generic-stderr" ? [] : await readdir(join(directory, "debug"));
  const bytes =
    sink === "generic-stderr"
      ? output
      : (await Promise.all(files.filter((name) => name.endsWith(".txt")).map((name) => readFile(join(directory, "debug", name), "utf8")))).join("\n");
  return { result, bytes };
}

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
