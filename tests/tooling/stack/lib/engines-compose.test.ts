// The engine-container compose generator — the three claims that keep `docker/compose.engines.yaml` from
// becoming the rotted hand-copy it replaces:
//   1. DRIFT: the committed overlay is exactly what the generator emits today. This is the row that reds
//      when `build-argv.ts` moves and nobody regenerated, and it names the regen command.
//   2. PARITY: the container serve argv equals the bare-metal serve argv except the `--host` VALUE. The
//      bind address is the ONE sanctioned departure (a container-local loopback bind is unreachable from
//      the app container); everything else — flags, order, JSON blobs — is the same builder's output.
//   3. ONE VERSION HOME: the venv install spec the bare-metal setup sources and the container image tag
//      both derive from `lib/vllm-version.env`, and its two lines cannot disagree.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildEngineArgv, engineLaunchEnvFloor, resolveEngineLaunchConfig, VLLM_ENGINES } from "@orb/tooling/stack/lib/engine-fleet";
import {
  deriveVllmPin,
  ENGINES_COMPOSE_DEFAULT_GPU_COUNT,
  ENGINES_COMPOSE_REL,
  ENGINES_COMPOSE_REPO_ROOT,
  launchEnvKeysSetIn,
  parseVllmPin,
  parseVllmVersion,
  renderEnginesComposeFromEnv,
  VLLM_VERSION_ENV_REL,
} from "@orb/tooling/stack";
import { describe } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const REGEN = "pnpm engines compose";

function read(repoRoot: string, rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

test("the committed overlay IS the generator's output — a drift here means regenerate, never hand-edit", ({ repoRoot }) => {
  const generated = renderEnginesComposeFromEnv(repoRoot, ENGINES_COMPOSE_DEFAULT_GPU_COUNT);
  expect(read(repoRoot, ENGINES_COMPOSE_REL), `${ENGINES_COMPOSE_REL} is stale — regenerate it with \`${REGEN}\``).toBe(generated);
});

describe("container argv == bare-metal argv, except the --host value", () => {
  const config = resolveEngineLaunchConfig(engineLaunchEnvFloor(), undefined);
  // Everything the caller resolves is held EQUAL across the two sides on purpose: the claim under test is
  // about the BUILDER, so a repo root or rerank path that differed would hide a real flag divergence.
  const shared = { repoRoot: ENGINES_COMPOSE_REPO_ROOT, gpuCount: ENGINES_COMPOSE_DEFAULT_GPU_COUNT, rerankModelPath: config.rerankModel };

  for (const engine of VLLM_ENGINES) {
    test(engine, () => {
      const bare = buildEngineArgv(engine, config, shared);
      const container = buildEngineArgv(engine, config, { ...shared, bindHost: "0.0.0.0" });
      expect(container).toHaveLength(bare.length);
      const differing = bare.flatMap((arg, i) => (arg === container[i] ? [] : [i]));
      expect(differing, `${engine}: exactly one argv slot may differ`).toHaveLength(1);
      const hostValueIndex = bare.indexOf("--host") + 1;
      expect(differing).toEqual([hostValueIndex]);
      expect(bare[hostValueIndex]).toBe("127.0.0.1");
      expect(container[hostValueIndex]).toBe("0.0.0.0");
      // …and the flag itself appears exactly once, so "the one differing slot" cannot be a second --host.
      expect(bare.filter((a) => a === "--host")).toHaveLength(1);
    });
  }
});

describe("the vLLM version line has ONE home", () => {
  test("the written pin is the derivation of the version (the shell sources it rather than re-deriving)", ({ repoRoot }) => {
    const versionEnv = read(repoRoot, VLLM_VERSION_ENV_REL);
    expect(parseVllmPin(versionEnv)).toBe(deriveVllmPin(parseVllmVersion(versionEnv)));
  });

  test("the container image tag derives from the same file", ({ repoRoot }) => {
    const version = parseVllmVersion(read(repoRoot, VLLM_VERSION_ENV_REL));
    const overlay = read(repoRoot, ENGINES_COMPOSE_REL);
    expect(overlay).toContain(`image: vllm/vllm-openai:v${version}`);
    // every engine service carries the tag — no service left on an older pin
    expect(overlay.match(new RegExp(`image: vllm/vllm-openai:v${version}$`, "gmu"))).toHaveLength(VLLM_ENGINES.length);
  });

  test("vllm-setup.sh spells no pin of its own — it sources the one home", ({ repoRoot }) => {
    const setup = read(repoRoot, "tooling/src/stack/vllm-setup.sh");
    expect(setup).toContain('. "$HERE/lib/vllm-version.env"');
    expect(setup, "a literal vllm>= spec in the shell would be a second version home").not.toMatch(/VLLM_PIN=.*vllm>=/u);
  });

  test("deriveVllmPin moves the ceiling to the next minor, and refuses a non-version", () => {
    expect(deriveVllmPin("0.29.0")).toBe("vllm>=0.29,<0.30");
    expect(deriveVllmPin("1.4.2")).toBe("vllm>=1.4,<1.5");
    expect(() => deriveVllmPin("nightly")).toThrow(/not <major>\.<minor>/u);
  });
});

describe("launchEnvKeysSetIn — what makes the generator refuse", () => {
  // Built through fromEntries because these are ENV KEYS: their SCREAMING_SNAKE spelling is the thing
  // under test, and an object literal would have to be renamed to satisfy the identifier lint.
  const environment = (...pairs: readonly (readonly [string, string])[]): Record<string, string> => Object.fromEntries(pairs);

  test("names a set launch-floor key so a box-specific overlay can never be written", () => {
    expect(launchEnvKeysSetIn(environment(["VLLM_GEN_MODEL", "/media/local/checkpoint"], ["PATH", "/usr/bin"]))).toEqual(["VLLM_GEN_MODEL"]);
  });

  test("ignores VLLM_* keys the generator does not read (they reach no value in the overlay)", () => {
    expect(launchEnvKeysSetIn(environment(["VLLM_DISABLED", "true"], ["VLLM_STORE_ROOT", "/media/models"]))).toEqual([]);
  });
});
