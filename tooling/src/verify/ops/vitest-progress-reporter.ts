// Native lifecycle events locate a stalled corpus without claiming that elapsed time is progress.
// Vitest's custom reporter loader requires a default-exported constructor.
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { warn } from "@orb/tooling/_shared/log";
import { SEMANTIC_CORPUS_RESOURCE, VITEST_RUNTIME_FAMILY_GROUPS } from "@orb/tooling/_shared/test-kinds";
import type { Reporter, TestCase, TestModule, TestSpecification } from "vitest/node";

refuseDirectInvocation(import.meta.url, "pnpm test:tooling");

export default class NativeProgressReporter implements Reporter {
  private readonly mutation: boolean;

  constructor({ mutation = false }: { readonly mutation?: boolean } = {}) {
    this.mutation = mutation;
  }

  private progress(module: TestModule, detail: string): void {
    if (this.mutation && VITEST_RUNTIME_FAMILY_GROUPS.some((name) => name === module.project.name)) {
      warn(`[mutation-progress] |${module.project.name}| ${module.relativeModuleId}: ${detail}`);
    } else if (module.project.name === SEMANTIC_CORPUS_RESOURCE) {
      warn(`[corpus-progress] ${module.relativeModuleId}: ${detail}`);
    }
  }

  onInit(): void {
    if (this.mutation) {
      warn("[mutation-progress] selecting related test modules");
    }
  }

  onTestRunStart(specifications: readonly TestSpecification[]): void {
    if (this.mutation) {
      warn(`[mutation-progress] selected ${specifications.length} test modules; selection complete`);
    }
  }

  onTestModuleQueued(module: TestModule): void {
    this.progress(module, "queued; importing test module");
  }

  onTestModuleCollected(module: TestModule): void {
    this.progress(module, "collected");
  }

  onTestModuleStart(module: TestModule): void {
    this.progress(module, "execution started");
  }

  onTestCaseReady(testCase: TestCase): void {
    if (!this.mutation) {
      this.progress(testCase.module, `test started: ${testCase.fullName}`);
    }
  }

  onTestCaseResult(testCase: TestCase): void {
    if (!this.mutation) {
      this.progress(testCase.module, `test ${testCase.result().state}: ${testCase.fullName}`);
    }
  }

  onTestModuleEnd(module: TestModule): void {
    this.progress(module, `module ${module.state()}`);
  }
}
