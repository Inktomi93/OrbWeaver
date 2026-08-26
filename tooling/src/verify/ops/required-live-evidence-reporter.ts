// Required-live evidence reporter — enabled only by `pnpm e2e:live`. Playwright exits zero when every
// collected test is skipped; that is truthful for optional live probes but an instrument failure for a
// front door promising a real model-turn verdict. The runner outcome is the evidence seam: source syntax,
// annotations, and collection counts cannot prove that a test executed.

import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { FullResult, Reporter, Suite } from "@playwright/test/reporter";

refuseDirectInvocation(import.meta.url, "pnpm e2e:live (Playwright loads this module as a reporter)");

export function executedTestCount(suite: Suite): number {
  return suite.allTests().filter((testCase) => testCase.outcome() !== "skipped").length;
}

class RequiredLiveEvidenceReporter implements Reporter {
  #suite: Suite | undefined;

  onBegin(_config: unknown, suite: Suite): void {
    this.#suite = suite;
  }

  onEnd(_result: FullResult): Promise<{ readonly status: "failed" } | undefined> {
    const suite = this.#suite;
    const collected = suite?.allTests().length ?? 0;
    const executed = suite === undefined ? 0 : executedTestCount(suite);
    if (executed > 0) {
      return Promise.resolve(undefined);
    }
    process.stderr.write(
      `INSTRUMENT ERROR  required live evidence is ABSENT — Playwright collected ${String(collected)} test(s), but every outcome was skipped; this run is not a verdict\n`,
    );
    return Promise.resolve({ status: "failed" });
  }
}

export default RequiredLiveEvidenceReporter;
