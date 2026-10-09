// Native lifecycle events locate a stalled corpus without claiming that elapsed time is progress.
// Vitest's custom reporter loader requires a default-exported constructor.
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { warn } from "@orb/tooling/_shared/log";
import { SEMANTIC_CORPUS_RESOURCE } from "@orb/tooling/_shared/test-kinds";
import type { Reporter, TestCase, TestModule } from "vitest/node";

refuseDirectInvocation(import.meta.url, "pnpm test:tooling");

function progress(module: TestModule, detail: string): void {
  if (module.project.name === SEMANTIC_CORPUS_RESOURCE) {
    warn(`[corpus-progress] ${module.relativeModuleId}: ${detail}`);
  }
}

export default class CorpusProgressReporter implements Reporter {
  onTestModuleQueued(module: TestModule): void {
    progress(module, "queued; importing test module");
  }

  onTestModuleCollected(module: TestModule): void {
    progress(module, "collected");
  }

  onTestModuleStart(module: TestModule): void {
    progress(module, "execution started");
  }

  onTestCaseReady(testCase: TestCase): void {
    progress(testCase.module, `test started: ${testCase.fullName}`);
  }

  onTestCaseResult(testCase: TestCase): void {
    progress(testCase.module, `test ${testCase.result().state}: ${testCase.fullName}`);
  }

  onTestModuleEnd(module: TestModule): void {
    progress(module, `module ${module.state()}`);
  }
}
