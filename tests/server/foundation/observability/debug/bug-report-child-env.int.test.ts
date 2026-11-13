// @subject packages/server/src/foundation/observability/debug/bug-report.ts
// The bug report's `git` child is started with no explicit env, so it inherits the booted server's environment after
// the boot scrub: no key the agent SDK child's environment owns (D8) reaches it. The real entry boots with every
// reserved key in its launch environment and a scripted `git` first on PATH, the external edge, which records the
// names it was started with. Linux and macOS only: the scripted `git` is an executable script.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { AUTH_MODE_KEY } from "@orb/contracts/identity";
import { RESERVED_CLAUDE_ENV_KEYS } from "@orb/contracts/preset";
import { ENV_NO_FILE_KEY } from "@orb/kit/env-file";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { freeLoopbackPort } from "@orb/testkit/node/helpers";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { onTestFinished } from "vitest";
import { z } from "zod";

const ENTRY = fileURLToPath(new URL("../../../../../packages/server/src/entry/index.ts", import.meta.url));
const BUG_REPORT_ROUTE = "/api/_debug/bug-report";
const LISTENING = "boot: listening";
// A variable the server neither reads nor scrubs: it must arrive, so the absence of a reserved key is the scrub's doing.
const INHERITED_CONTROL = "ORB_CHILD_ENV_CONTROL";
const EXECUTABLE_MODE = 0o755;
const OK = 200;
const namesSchema = z.array(z.string());

// The scripted git: each call appends the names of its environment to the record file and answers as an empty
// checkout would, so the report's build stamp still resolves.
function scriptedGit(recordFile: string): string {
  return `#!${process.execPath}
const { appendFileSync } = require("node:fs");
appendFileSync(${JSON.stringify(recordFile)}, JSON.stringify(Object.keys(process.env)) + "\\n");
if (process.argv.includes("rev-parse")) process.stdout.write("0000000000000000000000000000000000000000\\n");
`;
}

test("the bug report's git child starts without one reserved agent SDK key, and with a variable the server leaves alone", {
  tags: "slow",
  skip: process.platform === "win32",
}, async ({ importStagingDir }) => {
  const binDir = join(importStagingDir, "bin");
  const recordFile = join(importStagingDir, "git-env.jsonl");
  await mkdir(binDir, { recursive: true });
  await writeFile(join(binDir, "git"), scriptedGit(recordFile));
  await chmod(join(binDir, "git"), EXECUTABLE_MODE);
  const port = await freeLoopbackPort();

  const child = spawn(process.execPath, [ENTRY], {
    cwd: importStagingDir,
    env: {
      ["PATH"]: `${binDir}${delimiter}${processEnvValue("PATH") ?? ""}`,
      ["HOME"]: processEnvValue("HOME"),
      [ENV_NO_FILE_KEY]: "1",
      ["DATA_DIR"]: join(importStagingDir, "data"),
      ["LOCAL_LIGHT_PREFETCH"]: "off",
      ["CORPUS_AUTOINDEX"]: "false",
      ["EGRESS_FIREWALL"]: "false",
      ["LOG_LEVEL"]: "info",
      ["PORT"]: String(port),
      [AUTH_MODE_KEY]: "single-user",
      [INHERITED_CONTROL]: "1",
      ...Object.fromEntries(RESERVED_CLAUDE_ENV_KEYS.map((key) => [key, "reserved-value"])),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  onTestFinished(async () => {
    child.kill("SIGKILL");
    await exited;
  });
  let output = "";
  const listening = Promise.withResolvers<void>();
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes(LISTENING)) {
      listening.resolve();
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  expect(await Promise.race([listening.promise.then(() => "listening"), exited.then(() => "exited")]), output).toBe("listening");

  // The single-user owner fallback admits this loopback caller to the diagnostics door.
  const reported = await fetch(`http://127.0.0.1:${String(port)}${BUG_REPORT_ROUTE}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: "reserved key reach" }),
  });
  const reply = await reported.text();
  expect(reported.status, reply).toBe(OK);

  const calls = nonEmpty(
    (await readFile(recordFile, "utf8"))
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => namesSchema.parse(JSON.parse(line))),
  );
  for (const names of calls) {
    expect(names).toContain(INHERITED_CONTROL);
    expect(names.filter((name) => (RESERVED_CLAUDE_ENV_KEYS as readonly string[]).includes(name))).toEqual([]);
  }
});
