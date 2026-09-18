import type { PartialStrykerOptions } from "@stryker-mutator/api/core";
import { readConcurrencyProfile } from "./concurrency-profile.ts";

type NativeTypescriptCheckerOptions = PartialStrykerOptions & {
  readonly typescriptChecker: {
    readonly experimentalNativePreview: true;
  };
};

export interface StrykerConfigProfile {
  readonly mutate: readonly string[];
  readonly htmlReport: string;
  readonly incrementalFile: string;
  readonly breakThreshold: number | null;
}

const IGNORE_PATTERNS = [
  ".stryker-tmp/**",
  ".git/**",
  "node_modules/**",
  ".cache/**",
  ".models/**",
  "coverage/**",
  "dist/**",
  "reports/**",
  "docs/**",
  "playwright-report/**",
  "test-results/**",
  ".claude/**",
  ".agents/**",
  ".codex/**",
  ".qwen/**",
  "reference/**",
  "scratch/**",
  "data/**",
  "*.db*",
  "playwright/**",
  "scripts/probes/st-goldens/sillytavern-runtime/**",
  "scripts/probes/st-goldens/fixtures/**",
  "scripts/probes/st-goldens/output/**",
  "scripts/probes/st-goldens/orbweaver-output/**",
  "FINAL-*.md",
] as const;

/** Build one Stryker profile without sharing mutable option branches with another config import. */
export function createStrykerConfig(profile: StrykerConfigProfile): NativeTypescriptCheckerOptions {
  return {
    packageManager: "pnpm",
    testRunner: "vitest",
    vitest: { configFile: "vitest.stryker.config.ts" },
    plugins: ["@stryker-mutator/vitest-runner", "@stryker-mutator/typescript-checker", "./tooling/src/mutation-arid/index.ts"],
    ignorers: ["arid"],
    checkers: ["typescript"],
    typescriptChecker: { experimentalNativePreview: true },
    tsconfigFile: "tsconfig.json",
    reporters: ["html", "json", "clear-text", "progress"],
    htmlReporter: { fileName: profile.htmlReport },
    mutate: [...profile.mutate],
    ignorePatterns: [...IGNORE_PATTERNS],
    dryRunTimeoutMinutes: 45,
    ignoreStatic: true,
    concurrency: readConcurrencyProfile().strykerConcurrency,
    timeoutMS: 10_000,
    incremental: true,
    incrementalFile: profile.incrementalFile,
    thresholds: { high: 80, low: 60, break: profile.breakThreshold },
  };
}
