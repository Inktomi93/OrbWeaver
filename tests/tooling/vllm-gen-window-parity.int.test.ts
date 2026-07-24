// Pins the env-owned gen window against the launcher script's serve flag. VLLM_GEN_MAX_MODEL_LEN is the
// ONE home for the gen engine's context window: foundation/env supplies the default the resolved vllm
// ModelCapability.context.window reads, and scripts/dev/vllm-engine.sh's `gen` arm serves the SAME window
// via `--max-model-len ${VLLM_GEN_MAX_MODEL_LEN:-<literal>}`. This test reads the script text, extracts the
// gen arm's fallback literal, and asserts it equals the env default — so a bump to one home without the
// other is red at change time (the schema-baseline-parity twin, for a shell fallback instead of DDL).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@orb/server/foundation/env";
import { expect, test } from "../support/fixtures";

const ROOT = join(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "dev", "vllm-engine.sh");
// The gen arm's serve line: `--max-model-len "${VLLM_GEN_MAX_MODEL_LEN:-32768}"` — capture the `:-` fallback
// (the shell var may be quoted).
const GEN_FALLBACK_RE = /--max-model-len\s+"?\$\{VLLM_GEN_MAX_MODEL_LEN:-(\d+)\}"?/u;

test("vllm-engine.sh gen --max-model-len fallback equals the VLLM_GEN_MAX_MODEL_LEN env default", () => {
  const script = readFileSync(SCRIPT, "utf8");
  const match = GEN_FALLBACK_RE.exec(script);
  expect(match, "gen arm must serve --max-model-len ${VLLM_GEN_MAX_MODEL_LEN:-<default>}").not.toBeNull();
  const scriptFallback = Number(match?.[1]);
  expect(scriptFallback).toBe(env.VLLM_GEN_MAX_MODEL_LEN);
});
