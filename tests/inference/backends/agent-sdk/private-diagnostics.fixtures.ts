// One isolated native SDK parent per call: the parent cold-loads the composed server graph, and that process is the subject,
// so it cannot be shared between cases. The suites split across files so no file holds a worker for every parent.
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SDK_PRIVATE_DIAGNOSTIC_SINKS, SdkPrivateDiagnosticInput, SdkPrivateDiagnosticResult } from "@orb/testkit/node/helpers";
import { sdkPrivateDiagnosticResultSchema } from "@orb/testkit/node/helpers";

/** A parent per case at a measured 4.3-10.2 s on a loaded 24-core box; each suite file sets this as its test timeout base. */
export const NATIVE_PARENT_TEST_BASE_MS = 30_000;

export const TOKEN = 'private-sdk-"<opaque>\\credential-material';
export const JSON_TOKEN = JSON.stringify(TOKEN).slice(1, -1);

/** Run one isolated native SDK parent with the given sink and read back its result and diagnostic bytes. */
export async function nativeParent(
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
