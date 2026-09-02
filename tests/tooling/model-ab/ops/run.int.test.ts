import { createServer } from "node:http";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { runModelAb } from "@orb/tooling/model-ab";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("probe-only preserves failed probe evidence but aggregates to nonzero", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end('{"error":{"message":"planted failure"}}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("model-ab test server did not bind TCP");
  }
  try {
    expect(await runModelAb(["--base-url", `http://127.0.0.1:${address.port}`])).toBe(EXIT.violations);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});

test("an empty named selection is misuse, never an empty successful comparison", async () => {
  expect(await runModelAb(["--variants", "definitely-not-a-variant"])).toBe(EXIT.misuse);
});

// ── the argv grammar (#971) — parseCli was an indexOf bag ───────────────────────────────────────────

// A refusal here is a thrown UsageError, which _shared/run-tool maps to exit 3 at the cli — the same
// verdict the pre-existing empty-selection pin above reaches by return value.
test("an unrecognised flag is refused, never a run against every variant", async () => {
  // `--varients w8a8` matched nothing, so `--variants` stayed undefined and EVERY variant booted: a
  // multi-minute GPU run against the wrong set, reported as a normal run.
  await expect(runModelAb(["--varients", "w8a8-sideload"])).rejects.toThrow(UsageError);
});

test("a value-taking flag with no value is refused", async () => {
  await expect(runModelAb(["--variants"])).rejects.toThrow("--variants");
  await expect(runModelAb(["--variants", "--list"])).rejects.toThrow("--variants");
});

test("a non-numeric --port is refused, never NaN in the probe URL", async () => {
  await expect(runModelAb(["--port", "eight-thousand"])).rejects.toThrow("--port");
});
