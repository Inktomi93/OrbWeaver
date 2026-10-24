// An isolated SDK parent retains native logging configuration without mutating the test runner's environment.
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { SdkPrivateDiagnosticResult } from "./contract/sdk-private-diagnostics.ts";
import { sdkPrivateDiagnosticInputSchema } from "./contract/sdk-private-diagnostics.ts";
import { processObservability } from "./observed.ts";
import { createSdkProcessIdentity } from "./sdk-process.ts";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "./server.ts";

const input = sdkPrivateDiagnosticInputSchema.parse(JSON.parse(process.argv[2] ?? ""));
const identify = createSdkProcessIdentity();
const children: ChildProcessWithoutNullStreams[] = [];
const closes: Promise<void>[] = [];
await using harness = await createServerHarness({
  logLevel: "error",
  secretBoxKey: SECRET_BOX_TEST_KEY,
  sdkNative: {
    executable: "node",
    executableArgs: ["--no-warnings"],
    pathToClaudeCodeExecutable: fileURLToPath(new URL("./sdk-timer-process.ts", import.meta.url)),
    onNativeProcessCreated: (child): void => {
      identify(child);
      children.push(child);
      closes.push(new Promise<void>((resolve) => child.once("close", () => resolve())));
    },
  },
});
const principal = await harness.principalFor(harness.ownerId);
const connections = await Promise.all(
  input.tokens.map(async (token) => {
    const credential = await harness.services.credentials.add({ principal, provider: "claude-sub", key: token });
    const connection = await harness.services.connection.create({
      principal,
      providerId: "claude-sub",
      credentialId: credential.id,
      baseUrl: null,
      model: "sdk-lifetime-model",
      allowBackground: true,
      declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { input: ["text", "image"] } }),
    });
    const { resolved } = await harness.app.runtime.resolve({ task: "summarize", connectionId: connection.id, principal, cachedFacts: true });
    return { ...resolved, task: "summarize" as const };
  }),
);
await harness.settleBackground();
const errors = await Promise.all(
  connections.map(async (connection, index) => {
    try {
      await harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: input.prompts[index] ?? "" }] });
      throw new Error("diagnostic refusal control unexpectedly succeeded");
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }),
);
await harness[Symbol.asyncDispose]();
await Promise.all(closes);
const result: SdkPrivateDiagnosticResult = {
  errors,
  appLogs: [...processObservability.logLines(100)],
  exitCodes: children.map((child) => child.exitCode),
  signalCodes: children.map((child) => child.signalCode),
  nativeChildren: children.length,
};
await writeFile(input.resultFile, JSON.stringify(result));
