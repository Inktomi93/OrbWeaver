// snap/contract/scenario — the scenario/matrix recipe shapes (`--scenario`): a named spec of default argv +
// checkpoint argv lists, its prepared (parsed-to-Args) form, and the prepare outcome. Split out of types.ts at
// the tooling-size cap (Core-Tooling-Law §4.3); one direction only — this file imports Args, types.ts never
// imports back.
import type { Args } from "./types.ts";

export interface ScenarioCheckpoint {
  readonly name: string;
  readonly args: readonly string[];
}
export interface ScenarioSpec {
  readonly name: string;
  readonly defaults: readonly string[];
  readonly checkpoints: readonly ScenarioCheckpoint[];
}

export interface PreparedScenario {
  readonly spec: ScenarioSpec;
  readonly checkpoints: readonly Args[];
}

export type ScenarioPreparation = { readonly status: "prepared"; readonly value: PreparedScenario } | { readonly status: "failed"; readonly error: string };
