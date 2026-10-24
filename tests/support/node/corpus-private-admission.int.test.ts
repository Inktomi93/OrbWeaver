// @subject tests/support/node/corpus.ts
// Private-corpus output admission refuses reporter and output overrides before any captured content is read.
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { describe, onTestFinished } from "vitest";
import { assertPrivateCorpusOutput, assertPrivateCorpusOutputArguments, isPrivateCorpusConfigArgument, privateCorpusParent } from "./corpus.ts";
import { expect, test } from "./fixtures.ts";

const OVERRIDE_REFUSAL = "Private corpus artifacts cannot override native output ownership";

describe("private corpus rejects native output and reporter overrides before reading captured content", () => {
  // Only the existing routing metadata is present: refusal must precede any capture, DB or reporter load.
  async function classifiedInput(): Promise<{ readonly parent: string; readonly directory: string; readonly escaped: string }> {
    const parent = await mkdtemp(join(tmpdir(), "orb-private-output-admission-"));
    onTestFinished(() => rm(parent, { recursive: true, force: true }));
    const directory = join(parent, "classified-input");
    await mkdir(directory, { mode: 0o700 });
    await writeFile(join(directory, ".private-corpus.json"), JSON.stringify({ parent }));
    return { parent, directory, escaped: join(parent, "outside-owned") };
  }
  const clean = inheritedProcessEnv({ ["CI"]: undefined, ["GITHUB_ACTIONS"]: undefined, ["CORPUS_PRIVATE_RUN_ROOT"]: undefined });
  const variables = [
    ...["JSON", "JUNIT", "BLOB"].flatMap((reporter) => ["FILE", "DIR", "NAME"].map((output) => `PLAYWRIGHT_${reporter}_OUTPUT_${output}`)),
    "PLAYWRIGHT_HTML_OUTPUT_DIR",
    "PLAYWRIGHT_HTML_REPORT",
    "PLAYWRIGHT_HTML_OPEN",
    "PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL",
    "PLAYWRIGHT_HTML_HOST",
    "PLAYWRIGHT_HTML_PORT",
    "PLAYWRIGHT_LAST_RUN_OUTPUT_FILE",
    "PW_TEST_REPORTER",
    "PW_TEST_HTML_REPORT_OPEN",
    "PWTEST_CACHE_DIR",
  ];

  // The CLI reads the privacy classification, then admits the owner's run directory, both with the process environment.
  test.for(variables)("environment %s is refused by the admission the CLI runs", async (name) => {
    const { parent, directory, escaped } = await classifiedInput();
    const environment = { ...clean, [name]: escaped };
    expect(() => privateCorpusParent(directory, environment)).toThrow(new Error(OVERRIDE_REFUSAL));
    expect(() => assertPrivateCorpusOutput(parent, join(parent, "owner-corpus-run"), environment)).toThrow(new Error(OVERRIDE_REFUSAL));
    await expect(access(escaped)).rejects.toThrow();
  });

  const argumentShapes = [
    ...["--output", "--reporter", "--last-failed-file"].flatMap((flag) => [[`${flag}=escaped`], [flag, "escaped"]]),
    ["--update-snapshots=all"],
    ["--update-snapshots", "all"],
    ["-u"],
    ["--update-source-method=overwrite"],
    ["--update-source-method", "overwrite"],
  ];
  test.for([["--config=escaped"], ["--config", "escaped"]])("arguments %j are config switches the CLI refuses", (args) => {
    expect(args.some(isPrivateCorpusConfigArgument)).toBe(true);
  });
  test.for(argumentShapes)("arguments %j are refused by the admission the CLI runs", (args) => {
    expect(() => assertPrivateCorpusOutputArguments(args)).toThrow(new Error(OVERRIDE_REFUSAL));
  });

  // One real spawn proves the CLI entry wires the admission above; a spawn costs seconds, so the case carries the slow tag.
  test("the CLI refuses an environment override through the admission", { tags: "slow" }, async () => {
    const command = ["--config.verify-deps-before-run=false", "exec", "node", "scripts/corpus-fixture.ts", "e2e"];
    const { directory, escaped } = await classifiedInput();
    const result = await spawnNicedTranscript("pnpm", [...command, directory, "--list"], {
      cwd: process.cwd(),
      env: { ...clean, ["PLAYWRIGHT_JSON_OUTPUT_FILE"]: escaped },
      timeoutMs: budget(LONG_TEST_TIMEOUT_BASE_MS),
    });
    expect(result.code).not.toBe(0);
    expect(result.transcript).toContain(OVERRIDE_REFUSAL);
    await expect(access(escaped)).rejects.toThrow();
  });
});
