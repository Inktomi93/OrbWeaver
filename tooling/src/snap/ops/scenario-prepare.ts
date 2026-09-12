// A scenario's preparation phase: load one tape, validate its checkpoint schema, inherit the browser-
// lifetime args, and collect every refusal before a browser is launched.
import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import { routeSlug } from "../../_shared/artifact-naming.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { PreparedScenario, ScenarioCheckpoint, ScenarioPreparation, ScenarioSpec } from "../contract/scenario.ts";
import { scenarioPresetFile } from "../contract/scenario-presets.ts";
import type { Args } from "../contract/types.ts";
import { checkpointArgErrors, identicalSeedsError, inheritSessionArgs } from "../lib/session-plan.ts";
import { refuseFileMode } from "./guards.ts";
import { parseSnapArgs } from "./parse.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --scenario <file>");

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scenarioCheckpoint(value: unknown, index: number): ScenarioCheckpoint {
  if (!isRecord(value)) {
    throw new Error(`scenario checkpoint ${index} must be an object`);
  }
  const args = stringArray(value["args"]);
  if (typeof value["name"] !== "string" || value["name"].trim() === "" || args === null) {
    throw new Error(`scenario checkpoint ${index} requires a non-empty name and string[] args`);
  }
  return { name: value["name"], args };
}

export function parseScenarioSpec(source: string, fallbackName: string): ScenarioSpec {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) {
    throw new Error("scenario root must be an object");
  }
  const defaults = value["defaults"] === undefined ? [] : stringArray(value["defaults"]);
  if (defaults === null) {
    throw new Error("scenario defaults must be a string[]");
  }
  if (!Array.isArray(value["checkpoints"]) || value["checkpoints"].length === 0) {
    throw new Error("scenario requires at least one checkpoint");
  }
  const checkpoints = value["checkpoints"].map(scenarioCheckpoint);
  const name = typeof value["name"] === "string" && value["name"].trim() !== "" ? value["name"] : fallbackName;
  return { name: routeSlug(name), defaults, checkpoints };
}

function scenarioCheckpointArgs(globalArgs: Args, spec: ScenarioSpec): Args[] {
  // The PARTITION and refusal rows live in lib/session-plan.ts since #1231 — ONE table serves a
  // scenario's checkpoints and a stateful session's calls, so the two cannot disagree about lifetime ownership.
  return spec.checkpoints.map((checkpoint) => {
    const args = parseSnapArgs([...spec.defaults, ...checkpoint.args], { scenarioCheckpoint: true });
    const inherited = inheritSessionArgs(globalArgs, args, `${spec.name}-${routeSlug(checkpoint.name)}`, true);
    inherited.errors.push(...checkpointArgErrors(inherited, checkpoint.name, [...spec.defaults, ...checkpoint.args]));
    return inherited;
  });
}

export function scenarioErrors(checkpoints: readonly Args[]): string[] {
  const errors = checkpoints.flatMap((checkpoint) => {
    const fileRefusal = refuseFileMode(checkpoint);
    return fileRefusal === null ? checkpoint.errors : [...checkpoint.errors, fileRefusal];
  });
  const seeds = identicalSeedsError(checkpoints);
  if (seeds !== null) {
    errors.push(seeds);
  }
  return errors;
}

function resolveScenarioPath(pathArg: string): string {
  const preset = scenarioPresetFile(pathArg);
  if (preset !== null) {
    return fileURLToPath(new URL(`./scenarios/${preset}`, import.meta.url));
  }
  return isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
}

async function loadScenario(pathArg: string): Promise<ScenarioSpec> {
  const path = resolveScenarioPath(pathArg);
  const source = await readFile(path, "utf8");
  return parseScenarioSpec(source, basename(path, extname(path)));
}

export async function prepareScenario(opts: Args, path: string): Promise<PreparedScenario> {
  const loaded = await loadScenario(path);
  const spec = opts.out === null ? loaded : { ...loaded, name: routeSlug(opts.out) };
  return { spec, checkpoints: scenarioCheckpointArgs(opts, spec) };
}

export async function prepareScenarioOutcome(opts: Args, path: string): Promise<ScenarioPreparation> {
  try {
    return { status: "prepared", value: await prepareScenario(opts, path) };
  } catch (error) {
    return { status: "failed", error: errorMessage(error) };
  }
}
