import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { viewerViewSchema } from "@orb/contracts/identity";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { brandedId } from "@orb/kit/ids";
import { execGit } from "@orb/tooling/floor/git/git";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import type { PlaywrightWorkerOptions } from "@playwright/test";
import { z } from "zod";
import { SURFACE_DATA_MODES } from "../iso/surface-data.ts";
import type { SurfacePass } from "../iso/surface-pass.ts";
import type { SurfacePaneRequest } from "./surface-audit.ts";
import { assertSurfaceRunOutput, surfaceAuthenticationSchema, surfaceGenerationSchema, surfaceSubjectInventorySchema } from "./surface-data.ts";

export const SURFACE_RUN_CONFIG_ENV = "ORB_SURFACE_RUN_CONFIG";
export const SURFACE_OUTPUT_ROOT_ENV = "ORB_SURFACE_OUTPUT_ROOT";
export const SURFACE_NATIVE_TIMEOUT_MS = 1_800_000;
export const SURFACE_BOOT_DIAGNOSTIC_TITLE = "production navigation boot diagnostic";
export const SURFACE_CASE_REPORT_TIMEOUT_MS = 5000;
const SURFACE_CASE_ADMISSION_FILE = "case-admission.json";
const caseAdmissionSchema = z.object({ testId: brandedId("PlaywrightTestId"), completedAt: z.number().int().nonnegative().nullable() });
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const absolutePath = z.string().refine(isAbsolute, "Surface run paths must be absolute");

/** The native runner reads only this local launcher configuration, never a deploy environment or source data directory. */
export const surfaceRunConfigSchema = z.object({
  runRoot: absolutePath,
  dataMode: z.enum(SURFACE_DATA_MODES),
  dataDirectory: absolutePath,
  clientDirectory: absolutePath,
  provenancePath: absolutePath,
  origin: z.url().refine((value) => new URL(value).hostname === "127.0.0.1", "Surface HTTP must use the owned loopback listener"),
  owner: viewerViewSchema.pick({ userId: true, handle: true }),
  composition: z.literal("production-composed-harness"),
  jobs: z.literal("disabled"),
  rateLimitWindowMs: z.number().int().positive(),
  authentication: surfaceAuthenticationSchema,
  generation: surfaceGenerationSchema,
  subjects: surfaceSubjectInventorySchema,
});

/** Native configuration inputs remain Node-safe; browser drivers consume the same options. */
export interface SurfaceWalkOptions {
  readonly surfacePass: SurfacePass;
  readonly requestedPanes: SurfacePaneRequest;
  readonly chatStyle: ThemeChatStyle;
  readonly fontScale: number;
}

export interface SurfaceArtifactPosture extends Pick<PlaywrightWorkerOptions, "trace" | "screenshot" | "video"> {
  readonly pass: SurfacePass;
}

function artifactMode(value: SurfaceArtifactPosture["trace"] | SurfaceArtifactPosture["screenshot"] | SurfaceArtifactPosture["video"]): string {
  return typeof value === "string" ? value : value.mode;
}

/** Refuse resolved native recording overrides before a measurement page can navigate. */
export function surfaceArtifactModes(posture: SurfaceArtifactPosture): {
  readonly pass: SurfacePass;
  readonly trace: string;
  readonly screenshot: string;
  readonly video: string;
} {
  const modes = { pass: posture.pass, trace: artifactMode(posture.trace), screenshot: artifactMode(posture.screenshot), video: artifactMode(posture.video) };
  if (modes.pass === "measurement" && [modes.trace, modes.screenshot, modes.video].some((mode) => mode !== "off")) {
    throw new Error("Measurement refuses resolved native trace, screenshot or video recording; use the evidence project for recording");
  }
  return modes;
}

export type SurfaceRunConfig = z.output<typeof surfaceRunConfigSchema>;

/** What a production client build reads. Journey, testkit and documentation edits outside these paths reuse a build. */
const SURFACE_CLIENT_BUILD_INPUTS = ["packages", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"] as const;

/** The surface client build is a production build; Vite reads the mode for its `.env.<mode>` files. */
export const SURFACE_CLIENT_BUILD_MODE = "production";
/** Vite reads these env files from the client package root even when git ignores them. */
const SURFACE_CLIENT_ENV_FILES = [".env", ".env.local", `.env.${SURFACE_CLIENT_BUILD_MODE}`, `.env.${SURFACE_CLIENT_BUILD_MODE}.local`].map((name) =>
  join("packages", "client", name),
);
/** Vite exposes process variables with this default prefix to client code. */
const CLIENT_ENV_PREFIX = "VITE_";

/** The build's environment. Vite derives its development flags from `NODE_ENV`, so an ambient value cannot leak in. */
export function surfaceClientBuildEnvironment(overrides: NodeJS.ProcessEnv, environment: NodeJS.ProcessEnv = inheritedProcessEnv()): NodeJS.ProcessEnv {
  return { ...environment, ...overrides, ["NODE_ENV"]: SURFACE_CLIENT_BUILD_MODE };
}

/** Everything a client build reads: every input path with the git blob id of its current bytes, Vite's env files
 *  whether or not git tracks them, and the client-exposed process variables. Staging or committing unchanged bytes
 *  keeps a build current; any edit, addition, deletion or variable change does not. */
export function surfaceClientBuildKey(root: string, environment: NodeJS.ProcessEnv = inheritedProcessEnv()): string {
  const blobs = new Map<string, string>();
  for (const line of execGit(root, ["ls-files", "--stage", "-z", "--", ...SURFACE_CLIENT_BUILD_INPUTS]).split("\0")) {
    const match = /^\d+ ([0-9a-f]+) \d+\t(.+)$/u.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      blobs.set(match[2], match[1]);
    }
  }
  const changed = execGit(root, ["ls-files", "-z", "--modified", "--others", "--exclude-standard", "--", ...SURFACE_CLIENT_BUILD_INPUTS])
    .split("\0")
    .filter((path) => path !== "");
  const present = changed.filter((path) => existsSync(join(root, path)));
  const ids =
    present.length === 0
      ? []
      : execGit(root, ["hash-object", "--stdin-paths"], { input: `${present.join("\n")}\n` })
          .trim()
          .split("\n");
  for (const path of changed) {
    blobs.delete(path);
  }
  present.forEach((path, index) => {
    blobs.set(path, ids[index] ?? "");
  });
  for (const path of SURFACE_CLIENT_ENV_FILES) {
    const file = join(root, path);
    blobs.set(path, existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "absent");
  }
  for (const [name, value] of Object.entries(environment)) {
    if (name.startsWith(CLIENT_ENV_PREFIX) && value !== undefined) {
      blobs.set(`environment:${name}`, value);
    }
  }
  const hash = createHash("sha256");
  for (const [path, id] of [...blobs].toSorted(([left], [right]) => (left < right ? -1 : 1))) {
    hash.update(`${path}\0${id}\0`);
  }
  return hash.digest("hex");
}

/** Preserve the reporter boundary across native worker replacements. */
export function writeSurfaceCaseAdmission(root: string, testId: string, completedAt: number | null): void {
  const path = join(root, SURFACE_CASE_ADMISSION_FILE);
  const pending = `${path}.pending`;
  writeFileSync(pending, JSON.stringify(caseAdmissionSchema.parse({ testId, completedAt })), { mode: 0o600 });
  renameSync(pending, path);
}

/** The worker must observe its own begin marker before using the previous completion time. */
export function readSurfaceCaseAdmission(root: string): z.output<typeof caseAdmissionSchema> | null {
  try {
    return caseAdmissionSchema.parse(JSON.parse(readFileSync(join(root, SURFACE_CASE_ADMISSION_FILE), "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** Schedule independent cases after the preceding case's actual fixed window; never pace within a journey. */
export function surfaceCaseDelayMs(completedAt: number | null, now: number, windowMs: number): number {
  return completedAt === null ? 0 : Math.max(0, (Math.floor(completedAt / windowMs) + 1) * windowMs - now);
}

/** Refuse generated local datasets and evidence on CI before any filesystem or browser work. */
export function assertSurfaceLocalExecution(environment: NodeJS.ProcessEnv): void {
  if (environment["CI"] !== undefined || environment["GITHUB_ACTIONS"] !== undefined) {
    throw new Error("Surface walkthrough datasets and artifacts are local-only and cannot enter CI");
  }
}

/** Keep the process deadline aligned with an explicit native execution budget instead of killing a longer selected run early. */
export function surfaceNativeTimeout(args: readonly string[], defaultTimeoutMs: number, cleanupReserveMs = 0): number {
  const overrides: string[] = [];
  for (const [index, argument] of args.entries()) {
    if (argument === "--global-timeout") {
      overrides.push(args[index + 1] ?? "");
    } else if (argument.startsWith("--global-timeout=")) {
      overrides.push(argument.slice("--global-timeout=".length));
    }
  }
  if (overrides.length === 0) {
    return defaultTimeoutMs;
  }
  const raw = overrides[0];
  if (overrides.length !== 1 || raw === undefined || !/^[1-9]\d*$/u.test(raw)) {
    throw new Error("Use one positive integer native --global-timeout; unlimited or ambiguous deadlines cannot own bounded cleanup");
  }
  return z
    .number()
    .int()
    .positive()
    .max(MAX_TIMER_DELAY_MS - cleanupReserveMs)
    .parse(Number(raw));
}

/** Refuse ambient/default execution before native collection or browser creation. */
export async function readSurfaceRunConfig(environment: NodeJS.ProcessEnv = inheritedProcessEnv()): Promise<SurfaceRunConfig> {
  assertSurfaceLocalExecution(environment);
  const file = environment[SURFACE_RUN_CONFIG_ENV];
  if (file === undefined) {
    throw new Error("Use the explicit local surface walkthrough launcher with a data mode");
  }
  const root = await readSurfaceOutputRoot(environment);
  await assertSurfaceRunOutput(root, file, environment);
  try {
    const config = surfaceRunConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    if (config.runRoot !== root) {
      throw new Error("Surface configuration and output ownership do not agree");
    }
    for (const path of [config.dataDirectory, config.clientDirectory, config.provenancePath, config.generation.requestEvidencePath]) {
      await assertSurfaceRunOutput(root, path, environment);
    }
    return config;
  } catch (error) {
    const failure = join(root, "configuration-failure.txt");
    await assertSurfaceRunOutput(root, failure, environment);
    writeFileSync(failure, String(error), { mode: 0o600 });
  }
  throw new Error("Surface run configuration is invalid; inspect the local configuration-failure.txt artifact");
}

/** Resolve an explicit local output owner for framework controls which need no application dataset. */
export async function readSurfaceOutputRoot(environment: NodeJS.ProcessEnv = inheritedProcessEnv()): Promise<string> {
  assertSurfaceLocalExecution(environment);
  const root = environment[SURFACE_OUTPUT_ROOT_ENV];
  if (root === undefined) {
    throw new Error("Use the explicit local surface controls launcher");
  }
  await assertSurfaceRunOutput(root, join(root, "native-results"), environment);
  return root;
}
