// The cache-check grammar: a flag bag, every value joined with `=`. No flags runs every route and case on a
// stage at HEAD; `--dirty` stages the working tree, which is how a planted regression is run.
import { UsageError } from "../../_shared/run-tool.ts";
import type { CacheCase, CacheCheckOptions, CacheRoute } from "../contract/types.ts";
import { CACHE_CASES, CACHE_ROUTES } from "../contract/types.ts";
import { DEFAULT_ROUTES } from "./routes.ts";

const USAGE = "usage: pnpm cache:check [--routes=<r,…>] [--cases=<c,…>] [--ref=<ref> | --dirty]";
const DEFAULT_REF = "HEAD";

function parseList<T extends string>(flag: string, raw: string, allowed: readonly T[]): readonly T[] {
  const picked = raw.split(",").filter((item) => item !== "");
  if (picked.length === 0) {
    throw new UsageError(`${flag} needs at least one value — one of ${allowed.join(", ")}`);
  }
  return picked.map((item) => {
    const match = allowed.find((a) => a === item);
    if (match === undefined) {
      throw new UsageError(`${flag}: unknown value "${item}" — one of ${allowed.join(", ")}`);
    }
    return match;
  });
}

interface ParseState {
  routes: readonly CacheRoute[];
  cases: readonly CacheCase[];
  ref: string | null;
  dirty: boolean;
}

/** Each flag's handler; `value` is null for a bare flag. A handler returns false to refuse the argument. */
const FLAGS: Readonly<Record<string, (state: ParseState, value: string | null) => boolean>> = {
  "--dirty": (state, value) => {
    state.dirty = true;
    return value === null;
  },
  "--routes": (state, value) => {
    state.routes = value === null ? [] : parseList("--routes", value, CACHE_ROUTES);
    return value !== null;
  },
  "--cases": (state, value) => {
    state.cases = value === null ? [] : parseList("--cases", value, CACHE_CASES);
    return value !== null;
  },
  "--ref": (state, value) => {
    state.ref = value;
    return value !== null && value !== "";
  },
};

/** Parse argv into options. Every refusal is a `UsageError` (exit 3). */
export function parseCacheCheckArgs(argv: readonly string[]): CacheCheckOptions {
  const state: ParseState = { routes: DEFAULT_ROUTES, cases: CACHE_CASES, ref: null, dirty: false };
  for (const arg of argv) {
    const eq = arg.indexOf("=");
    const handler = FLAGS[eq === -1 ? arg : arg.slice(0, eq)];
    if (handler === undefined || !handler(state, eq === -1 ? null : arg.slice(eq + 1))) {
      throw new UsageError(`unknown or malformed argument "${arg}" — ${USAGE}`);
    }
  }
  if (state.dirty && state.ref !== null) {
    throw new UsageError(`--ref and --dirty pick different stage sources; pass one — ${USAGE}`);
  }
  return { routes: state.routes, cases: state.cases, ref: state.ref ?? DEFAULT_REF, dirty: state.dirty };
}
