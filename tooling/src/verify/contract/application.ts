// Application qualification subjects are execution views of canonical owners, never new owners.
import type { CompilerProgram, PolicyRepositoryInventory } from "./policy-scope.ts";

export const APPLICATION_TEST_CONFIGS = {
  node: "vitest.product.config.ts",
  ct: "playwright-ct.product.config.ts",
  e2e: "playwright.config.ts",
} as const;

export const APPLICATION_STATIC_CHECKERS = ["biome", "eslint", "imports", "knip", "knip-prod", "cpd"] as const;

export interface ApplicationProgram {
  readonly owner: CompilerProgram;
  readonly roots: readonly string[];
  readonly config: string;
}

export interface ApplicationSubjects {
  readonly inventory: PolicyRepositoryInventory;
  readonly roots: readonly string[];
  readonly files: readonly string[];
  readonly subjects: readonly string[];
}

export interface ApplicationPopulation extends ApplicationSubjects {
  readonly programs: readonly ApplicationProgram[];
  readonly canonicalPrograms: readonly CompilerProgram[];
  readonly closures: ReadonlyMap<string, ReadonlySet<string>>;
}
