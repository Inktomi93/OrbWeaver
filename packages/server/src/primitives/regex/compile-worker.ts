// The one-shot find-pattern compile probe: each pattern's first run through the server's own regex pass, timed in
// this thread's CPU. A fresh worker holds no compiled regex, so every pattern pays its compile here and never on the
// server's event loop. One message per pattern, so the parent can name the one in flight if it has to stop us.
import process from "node:process";
import { parentPort, workerData } from "node:worker_threads";
import type { RegexScriptInput } from "@orb/kit/regex";
import { COMPILE_PROBE_SUBJECT, compileProbeRequestSchema } from "./compile-probe-contract.ts";
import { openRegexPass } from "./index.ts";

if (parentPort === null) {
  throw new Error("the find-pattern compile probe requires its owning worker channel");
}
const port = parentPort;
const MICROS_PER_MS = 1000;
// Macros in a `raw` or `escaped` find resolve to nothing: the probe measures the stored text. What a macro adds at
// run time is bounded by the value's own cap and by the executor's length check after substitution.
const ctx = { char: "", user: "", persona: "", scenario: "", env: {} };

for (const probe of compileProbeRequestSchema.parse(workerData).patterns) {
  const script: RegexScriptInput = {
    enabled: true,
    placement: ["AI_OUTPUT"],
    findRegex: probe.findRegex,
    replaceString: "",
    substituteRegex: probe.substituteRegex,
  };
  const before = process.threadCpuUsage();
  // The server's own pass, row deadline included, so a pattern that backtracks on plain prose stops as on a turn;
  // an invalid pattern fails fast and is stored as it always was. Its outcome is not the probe's question.
  openRegexPass(Number.POSITIVE_INFINITY).execute({
    text: COMPILE_PROBE_SUBJECT,
    scripts: [script],
    placement: "AI_OUTPUT",
    ctx,
    onScriptFailure: () => undefined,
  });
  const used = process.threadCpuUsage(before);
  port.postMessage({ cpuMs: (used.user + used.system) / MICROS_PER_MS });
}
port.close();
