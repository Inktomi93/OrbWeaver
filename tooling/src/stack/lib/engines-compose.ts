/**
 * engines-compose — the PURE generator behind `pnpm engines compose` → `docker/compose.engines.yaml`.
 *
 * WHY IT IS GENERATED AND NOT HAND-WRITTEN. The engine containers must run the SAME serve flags the
 * bare-metal fleet runs, and the retired sibling compose profile proved a hand-copied flag list rots the
 * moment `build-argv.ts` moves. So the overlay's `command:` comes from `buildEngineArgv` — the ONE argv
 * builder both the in-server supervisor and the standalone launcher use — and a drift between the builder
 * and the committed file is a RED test row naming the regen command
 * (tests/tooling/stack/lib/engines-compose.test.ts), never a silently stale YAML.
 *
 * WHAT IT RESOLVES FROM. The ENV FLOOR only — `engineLaunchEnvFloor()` through `resolveEngineLaunchConfig`
 * with no override — never an AppSettings override: an admin's DB-side launch override is per-deployment state
 * that a tracked, shipped artifact must not carry, and reading the DB here would reach across the package
 * boundary exactly as `ops/engines.ts` refuses to. The committed file therefore states the SHIPPED
 * defaults. `renderEnginesComposeFromEnv` is the one resolution home; the op is a thin program over it.
 *
 * THE THREE DEPARTURES FROM THE BARE-METAL SPAWN, each forced by the container namespace:
 *   1. `--host 0.0.0.0` (EngineArgvContext.bindHost). A process that binds 127.0.0.1 inside a container is
 *      unreachable from its peers. Reachability is bounded instead by the container network: this overlay
 *      publishes NO engine port, so the engines answer only the app service (and each other).
 *   2. ONE hostname, three ports. The app has a single `VLLM_ENGINE_HOST` and three ports (engine-url.ts),
 *      and the egress internal-backend allowlist keys on the SAME env (`infra/network/egress.ts`
 *      `internalBackendHostPorts`), so both halves follow from `VLLM_ENGINE_HOST=vllm-gen` with no app
 *      change at all. `vllm-embed`/`vllm-rerank` therefore join gen's network namespace
 *      (`network_mode: "service:vllm-gen"`) and every engine answers on the `vllm-gen` name on its own
 *      port — the container shape of loopback-with-three-ports. CONSEQUENCE: `gen` is the base profile;
 *      `embed`/`rerank` cannot run without it.
 *   3. The rerank arm serves BY MODEL ID, not by a resolved snapshot path. `rerankModelPath` is a
 *      DEPLOYMENT fact the caller owns; the bare-metal caller resolves it with a huggingface_hub call
 *      (the transformers hub-cache workaround) against a store this generator cannot see, and there is no
 *      snapshot dir to name at generation time. Same flags, different caller-resolved value.
 *
 * TOPOLOGY IS AN INPUT, NEVER A DETECTION (`gpuCount`). `buildEngineArgv` branches on the GPU count (gen's
 * tensor-parallel size, the util split, rerank's card), so a committed overlay is generated FOR a topology.
 * The default is the 2-card reference box; a single-GPU deployer regenerates their own with
 * `pnpm engines compose --gpus 1`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { engineLaunchEnvFloor } from "@orb/server/foundation/env";
import type { VLLM_ENGINES } from "@orb/server/infra/providers/vllm/engine";
import { buildEngineArgv, engineCudaVisibleDevices, resolveEngineLaunchConfig } from "@orb/server/infra/providers/vllm/engine";
import type { EnginesComposeInput } from "../contract/types.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

/** The generated overlay's path, repo-root-relative — the write target AND what the drift row names. */
export const ENGINES_COMPOSE_REL = "docker/compose.engines.yaml";
/** The version line's one home, repo-root-relative (sourced by vllm-setup.sh, read here). */
export const VLLM_VERSION_ENV_REL = "tooling/src/stack/lib/vllm-version.env";
/** The topology the COMMITTED overlay is generated for — the 2-card reference box. */
export const ENGINES_COMPOSE_DEFAULT_GPU_COUNT = 2;
/** The workspace root INSIDE the engine containers. It is the app image's `/app` (docker/compose.dev.yaml
 *  mounts the checkout there too), and it is where this overlay bind-mounts the serve chat-templates that
 *  `buildEngineArgv` names by `${repoRoot}/…` — so the argv's template paths resolve in the container. */
export const ENGINES_COMPOSE_REPO_ROOT = "/app";
/** The compose service name every engine answers on: `vllm-embed`/`vllm-rerank` share THIS service's
 *  network namespace, so one host name + three ports is the whole app-side story. */
const GEN_SERVICE = "vllm-gen";
/** The model/cache volume mount point + the two cache env keys the bare-metal spawn sets on the child
 *  (spawn-engine.ts `cacheEnv`) mapped onto it. */
const MODELS_MOUNT = "/models";
const TEMPLATES_REL = "packages/server/src/infra/providers/vllm/engine/templates";

/** Per-engine container facts that are NOT in the argv: the compose profile, the service name, and the
 *  shared-memory size. SHM IS DERIVED, not a taste: vLLM uses `/dev/shm` for torch's inter-process
 *  tensors, and the gen arm additionally runs `--mm-processor-cache-type shm` (a preprocessed-input cache
 *  that defaults to 4 GiB PER process) across its tensor-parallel ranks — so gen needs room for both,
 *  while the single-process pooling arms need only torch's. The alternative the vLLM docs offer for the
 *  same problem is `ipc: host`, which is NOT used here: it would hand the engines the host's whole IPC
 *  namespace to buy the same shared memory a sized tmpfs gives. */
const ENGINE_CONTAINER: Record<VllmEngine, { readonly service: string; readonly profile: string; readonly shmSize: string }> = {
  gen: { service: GEN_SERVICE, profile: "gen", shmSize: "16gb" },
  embed: { service: "vllm-embed", profile: "embed", shmSize: "2gb" },
  rerank: { service: "vllm-rerank", profile: "rerank", shmSize: "2gb" },
};

/** The order the services are emitted in: gen first because the other two join its namespace. */
const ENGINE_ORDER: readonly VllmEngine[] = ["gen", "embed", "rerank"];

/** The card count at which the launch config splits multi-GPU from single-GPU (tensor parallelism, the
 *  util split, rerank's card). A MIRROR of build-argv.ts's own threshold, which is file-private there —
 *  it is read here only to LABEL the generated VRAM table, never to build argv, so the argv itself cannot
 *  drift if the two ever disagree. */
const MULTI_GPU_THRESHOLD = 2;

/** Column pads for the generated VRAM table (widest profile = "rerank", widest service = "vllm-rerank"). */
const PROFILE_COL_PAD = 6;
const SERVICE_COL_PAD = 12;

const SURROUNDING_QUOTES_RE = /^"(.*)"$/u;

function unquote(raw: string): string {
  return raw.trim().replace(SURROUNDING_QUOTES_RE, "$1");
}

/** Read one assignment out of `vllm-version.env`. Line-prefix matching rather than a regex — the file is a
 *  shell-sourceable two-line env. A missing line THROWS: the version is the whole point of the file, and a
 *  generator that silently emitted `vllm/vllm-openai:vundefined` would be worse than a refusal. */
function readAssignment(text: string, key: string): string {
  const prefix = `${key}=`;
  const line = text.split("\n").find((l) => l.startsWith(prefix));
  if (line === undefined) {
    throw new Error(`engines-compose: ${VLLM_VERSION_ENV_REL} declares no ${key}`);
  }
  return unquote(line.slice(prefix.length));
}

/** The vLLM version the engine containers' image tag carries (`vllm/vllm-openai:v<version>`). */
export function parseVllmVersion(versionEnvText: string): string {
  return readAssignment(versionEnvText, "VLLM_VERSION");
}

/** The venv install spec `vllm-setup.sh` sources from the same file. Read here only so the drift row can
 *  prove the two lines agree. */
export function parseVllmPin(versionEnvText: string): string {
  return readAssignment(versionEnvText, "VLLM_PIN");
}

/** The pin DERIVATION: `0.29.0` → `vllm>=0.29,<0.30`. The floor is the pinned minor and the ceiling is the
 *  next one, which is how the venv tracks patch releases without ever crossing a vLLM minor (every minor
 *  in this project's history has moved serve flags). The shell reads the written-out `VLLM_PIN` instead of
 *  re-deriving it in bash; this function is what proves the two cannot drift. */
export function deriveVllmPin(version: string): string {
  const [major, minor] = version.split(".");
  if (major === undefined || minor === undefined || !/^\d+$/u.test(major) || !/^\d+$/u.test(minor)) {
    throw new Error(`engines-compose: VLLM_VERSION '${version}' is not <major>.<minor>[.<patch>]`);
  }
  return `vllm>=${major}.${minor},<${major}.${String(Number(minor) + 1)}`;
}

/** YAML scalar. JSON is a YAML 1.2 subset, so a JSON string is a valid double-quoted YAML scalar — which
 *  matters here because the serve argv carries JSON blobs (`{"max_pixels": …}`) full of quotes and braces. */
function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

/** The engine's serve argv as compose `command:` items. The image's ENTRYPOINT is `["vllm", "serve"]`
 *  (vllm-project/vllm docker/Dockerfile, the `vllm-openai` target), so the leading `serve` token the
 *  builder emits is the entrypoint's, not the command's. A builder that ever stops leading with it would
 *  otherwise have its FIRST REAL FLAG silently eaten — hence the refusal rather than a blind slice. */
function commandArgv(engine: VllmEngine, input: EnginesComposeInput): readonly string[] {
  const argv = buildEngineArgv(engine, input.config, {
    repoRoot: ENGINES_COMPOSE_REPO_ROOT,
    gpuCount: input.gpuCount,
    // See the file header, departure 3: the container caller resolves the rerank model to its ID.
    rerankModelPath: input.config.rerankModel,
    bindHost: "0.0.0.0",
  });
  if (argv[0] !== "serve") {
    throw new Error(`engines-compose: buildEngineArgv('${engine}') no longer leads with 'serve'; the image ENTRYPOINT supplies it`);
  }
  return argv.slice(1);
}

/** The nvidia device reservation. `engineCudaVisibleDevices` is the bare-metal pinning (embed→card 0,
 *  rerank→card 1 on a multi-card box, gen→every card via tensor parallelism); `null` there means "all
 *  visible cards", which is compose's `count: all`. ONE pinning rule, two expressions of it. */
function deviceLines(engine: VllmEngine, gpuCount: number): readonly string[] {
  const pinned = engineCudaVisibleDevices(engine, gpuCount);
  const selector = pinned === null ? "count: all" : `device_ids: [${yamlScalar(pinned)}]`;
  return [
    "    deploy:",
    "      resources:",
    "        reservations:",
    "          devices:",
    "            - driver: nvidia",
    `              ${selector}`,
    "              capabilities: [gpu]",
  ];
}

function portOf(engine: VllmEngine, input: EnginesComposeInput): number {
  return input.config.ports[engine];
}

/** The healthcheck the engine answers on its OWN port. `curl` is in the vLLM image (its runtime base
 *  installs it). `start_period` is long on purpose: a cold gen load is minutes (the bare-metal launcher's
 *  own boot wait is 900s), and a container killed mid-load never finishes one. */
function healthcheckLines(port: number): readonly string[] {
  return [
    "    healthcheck:",
    `      test: ["CMD", "curl", "-sf", "http://127.0.0.1:${String(port)}/health"]`,
    "      interval: 15s",
    "      timeout: 5s",
    "      retries: 5",
    "      start_period: 900s",
  ];
}

/** The child env the bare-metal spawn puts on the engine process (spawn-engine.ts): the two in-repo cache
 *  roots — mapped here onto the `vllm-models` volume so a re-`up` never re-downloads — and
 *  `VLLM_SERVER_DEV_MODE=1` when sleep mode is on, which is what registers /sleep, /wake_up and
 *  /is_sleeping. Without it the app's auto-sleep and the wake gate have nothing to call. */
function environmentLines(input: EnginesComposeInput): readonly string[] {
  return [
    "    environment:",
    `      HF_HOME: ${MODELS_MOUNT}/hf`,
    `      VLLM_CACHE_ROOT: ${MODELS_MOUNT}/vllm-cache`,
    ...(input.config.sleepMode ? ['      VLLM_SERVER_DEV_MODE: "1"'] : []),
  ];
}

/** gen ALONE carries `expose`, and it carries all three ports: the other two engines have no network
 *  config of their own (they are in this namespace), so these three ports ARE the namespace's surface.
 *  `expose` publishes nothing — it documents, and the overlay deliberately publishes no engine port. */
function genExposeLines(input: EnginesComposeInput): readonly string[] {
  const ports = ENGINE_ORDER.map((e) => portOf(e, input)).toSorted((a, b) => a - b);
  return ["    expose:", ...ports.map((port) => `      - "${String(port)}"`)];
}

function serviceLines(engine: VllmEngine, input: EnginesComposeInput): readonly string[] {
  const meta = ENGINE_CONTAINER[engine];
  const isGen = engine === "gen";
  return [
    `  ${meta.service}:`,
    `    profiles: [${meta.profile}]`,
    `    image: vllm/vllm-openai:v${input.vllmVersion}`,
    `    container_name: orbweaver-${meta.service}`,
    "    command:",
    ...commandArgv(engine, input).map((arg) => `      - ${yamlScalar(arg)}`),
    ...environmentLines(input),
    "    volumes:",
    `      - vllm-models:${MODELS_MOUNT}`,
    `      - ./${TEMPLATES_REL}:${ENGINES_COMPOSE_REPO_ROOT}/${TEMPLATES_REL}:ro`,
    ...(isGen
      ? genExposeLines(input)
      : [
          // Joining gen's namespace is what makes ONE hostname serve three ports. A service in another
          // service's namespace may declare no network config of its own — no ports, no expose, no
          // hostname — which is exactly why gen carries all three above.
          `    network_mode: "service:${GEN_SERVICE}"`,
          "    depends_on:",
          `      ${GEN_SERVICE}:`,
          "        condition: service_started",
        ]),
    `    shm_size: "${meta.shmSize}"`,
    "    restart: unless-stopped",
    ...healthcheckLines(portOf(engine, input)),
    ...deviceLines(engine, input.gpuCount),
  ];
}

/** The per-engine VRAM line the operator reads before choosing profiles: the util fraction the serve argv
 *  actually carries, per card. */
function vramNote(engine: VllmEngine, input: EnginesComposeInput): string {
  const c = input.config;
  const multi = input.gpuCount >= MULTI_GPU_THRESHOLD;
  const util: Record<VllmEngine, number> = {
    embed: c.embedGpuUtil,
    rerank: multi ? c.rerankGpuUtilMulti : c.rerankGpuUtilSingle,
    gen: multi ? c.genGpuUtilMulti : c.genGpuUtilSingle,
  };
  const cards = engine === "gen" && multi ? `${String(input.gpuCount)} cards` : "1 card";
  return `#   ${ENGINE_CONTAINER[engine].profile.padEnd(PROFILE_COL_PAD)} ${ENGINE_CONTAINER[engine].service.padEnd(SERVICE_COL_PAD)} :${String(portOf(engine, input))}  --gpu-memory-utilization ${String(util[engine])} on ${cards}`;
}

function headerLines(input: EnginesComposeInput): readonly string[] {
  return [
    "# ── overlay: the app's OWN vLLM engines, as peer containers ────────────────────────────────────────",
    "#",
    "# GENERATED — DO NOT HAND-EDIT. Regenerate with `pnpm engines compose` (writes this file); a stale copy",
    "# is a RED row in tests/tooling/stack/lib/engines-compose.test.ts. The serve flags come from the ONE argv",
    "# builder the bare-metal fleet uses (packages/server/src/infra/providers/vllm/engine/build-argv.ts), so",
    "# these containers and `pnpm engines` can never run different flags. The generator, and the reasons for",
    "# every departure from the bare-metal spawn, are tooling/src/stack/lib/engines-compose.ts.",
    "#",
    "#   docker compose -f docker-compose.yaml -f docker/compose.engines.yaml --profile gen up -d",
    "#   docker compose -f docker-compose.yaml -f docker/compose.engines.yaml \\",
    "#       --profile gen --profile embed --profile rerank up -d",
    "#",
    "# `gen` IS THE BASE PROFILE: embed and rerank join gen's network namespace, so they cannot run without",
    "# it. First boot downloads the models into the `vllm-models` volume (tens of GB) and the cold load is",
    "# minutes — the healthcheck's start_period allows for it. Needs the NVIDIA Container Toolkit on the host.",
    "#",
    `# Generated for ${String(input.gpuCount)} GPU(s) — vLLM ${input.vllmVersion}. Regenerate for other hardware:`,
    "# `pnpm engines compose --gpus 1`. VRAM per engine, as the serve argv asks for it:",
    ...ENGINE_ORDER.map((e) => vramNote(e, input)),
    "#",
    "# The app side is two env values and NO app change: `adopt-only` (the app never spawns a container) and",
    "# the one engine host name. The egress firewall's internal-backend allowlist reads that same key, so",
    "# the app→engine hop is allowed by construction (infra/network/egress.ts, engine-url.ts).",
    "services:",
    "  orbweaver:",
    "    environment:",
    "      ENGINES_POSTURE: adopt-only",
    `      VLLM_ENGINE_HOST: ${GEN_SERVICE}`,
  ];
}

/** Render the whole overlay. Pure: same input → byte-identical output. */
export function buildEnginesCompose(input: EnginesComposeInput): string {
  const lines = [...headerLines(input), ...ENGINE_ORDER.flatMap((engine) => ["", ...serviceLines(engine, input)]), "", "volumes:", "  vllm-models: {}"];
  return `${lines.join("\n")}\n`;
}

/** The launch-floor env keys that are SET in a given environment. The key list is
 *  `engineLaunchEnvFloor()`'s OWN shape — read at runtime, never re-spelled here — so it tracks the floor
 *  automatically. The op refuses on a non-empty result: the generated overlay is a TRACKED artifact and
 *  must carry the shipped defaults, not whatever the generating box exports. (Keys OUTSIDE the floor —
 *  `VLLM_DISABLED`, `VLLM_STORE_ROOT` — reach no value in this file and are deliberately not refused.) */
export function launchEnvKeysSetIn(environment: Readonly<Record<string, string | undefined>>): readonly string[] {
  return Object.keys(engineLaunchEnvFloor())
    .filter((key) => environment[key] !== undefined)
    .sort();
}

/** THE resolution home: env floor → launch config, plus the version line, into the rendered overlay. The
 *  op and the drift test both enter here, so neither can resolve it a second, differing way.
 *
 *  It reads the ENV FLOOR, which means it reads whatever `.env` the working directory has. The op's
 *  front door (`engines.sh compose`) runs it with `ORB_ENV_NO_FILE=1` so a developer's own `.env` cannot
 *  bake a local model path into a tracked, shipped artifact, and the op refuses outright when a `VLLM_*`
 *  launch key is set in the environment. Vitest sets the same `ORB_ENV_NO_FILE`, which is why the drift
 *  row measures the same shipped defaults the op writes. */
export function renderEnginesComposeFromEnv(repoRoot: string, gpuCount: number): string {
  const versionEnv = readFileSync(path.join(repoRoot, VLLM_VERSION_ENV_REL), "utf8");
  return buildEnginesCompose({
    config: resolveEngineLaunchConfig(engineLaunchEnvFloor(), undefined),
    gpuCount,
    vllmVersion: parseVllmVersion(versionEnv),
  });
}
