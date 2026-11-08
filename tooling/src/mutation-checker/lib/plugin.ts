// The Stryker envelope around MutantWorld. Stryker runs each checker in its own child process at the checkout root,
// so one world, and one TypeScript 7.1 process, lives per checker for the whole run.
import process from "node:process";
import type { Checker, CheckResult } from "@stryker-mutator/api/check";
import { CheckStatus } from "@stryker-mutator/api/check";
import type { Mutant, StrykerOptions } from "@stryker-mutator/api/core";
import type { Logger } from "@stryker-mutator/api/logging";
import { commonTokens, declareClassPlugin, PluginKind, tokens } from "@stryker-mutator/api/plugin";
import { MutantWorld } from "./mutant-world.ts";

/** The checker name Stryker's `checkers: [...]` config refers to. */
export const NATIVE_CHECKER_NAME = "native";

class NativeChecker implements Checker {
  static readonly inject = tokens(commonTokens.logger, commonTokens.options);
  readonly #log: Logger;
  readonly #tsconfigFile: string;
  #world: MutantWorld | undefined;

  constructor(log: Logger, options: StrykerOptions) {
    this.#log = log;
    this.#tsconfigFile = options.tsconfigFile;
  }

  init(): Promise<void> {
    this.#world = MutantWorld.open(process.cwd(), this.#tsconfigFile);
    this.#log.debug("opened %s on the TypeScript 7.1 API", this.#tsconfigFile);
    return Promise.resolve();
  }

  check(mutants: Mutant[]): Promise<Record<string, CheckResult>> {
    const world = this.#world;
    if (world === undefined) {
      return Promise.reject(new Error("the native checker checked a mutant before init"));
    }
    return Promise.resolve(
      Object.fromEntries(
        mutants.map((mutant): [string, CheckResult] => {
          const { errors } = world.judge(mutant);
          return [mutant.id, errors.length === 0 ? { status: CheckStatus.Passed } : { status: CheckStatus.CompileError, reason: world.format(errors) }];
        }),
      ),
    );
  }

  dispose(): void {
    this.#world?.[Symbol.dispose]();
    this.#world = undefined;
  }
}

export const strykerPlugins = [declareClassPlugin(PluginKind.Checker, NATIVE_CHECKER_NAME, NativeChecker)];
