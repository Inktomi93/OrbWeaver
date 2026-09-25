// Filesystem and Git identity primitives for the immutable Snap run bundle. Kept out of the terminal
// writer so the schema/card orchestration stays below the tooling file-size ceiling.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { InstrumentArtifactDeclaration } from "../../_shared/artifact-out.ts";
import { instrumentArtifactDeclarationSchema } from "../../_shared/artifact-out.ts";
import { artifactRef, instrumentLegacyScopeSchema } from "../../_shared/artifact-scope.ts";
import { checkoutName } from "../../_shared/artifacts.ts";
import { runGit } from "../../_shared/git.ts";
import type { Arm } from "../contract/arm-vocabulary.ts";
import { ARMS } from "../contract/arm-vocabulary.ts";
import type { SnapRunArtifact, SnapRunIndex } from "../contract/run-index.ts";

const RUN_INDEX = "run.json";
const ARTIFACT_DECLARATIONS_DIR = ".artifacts";
const GIT_OUTPUT_MAX_BYTES = 67_108_864;
const GIT_FAILURE_DETAIL_MAX_CHARS = 400;

interface GitRead {
  readonly ok: boolean;
  /** RAW stdout. `snapDirtyIdentity` HASHES this, because a digest that claims to identify a working tree
   *  must hash what git PRINTED. #1509 item 7 reported the trimmed digest as a live collision (two dirty
   *  trees differing only by trailing whitespace at the end of the diff); measured, it is NOT — the diff's
   *  own `index <old>..<new>` line carries the new blob hash mid-output, out of a trailing trim's reach, so
   *  every content difference survived anyway. The raw hash is still the correct dependency: the identity
   *  should not rest on a header line this tool does not control. Trim at the callers that read a single
   *  token (sha/ref), never here. Fenced by tests/tooling/snap/lib/run-bundle-files.int.test.ts. */
  readonly raw: string;
  /** `raw`, trimmed — for the identity fields that are one whitespace-free token. */
  readonly value: string;
  readonly detail: string;
  readonly status: number | null;
}

interface GitFailure {
  readonly field: string;
  readonly detail: string;
}

function git(root: string, args: readonly string[]): GitRead {
  const result = runGit(root, args, { maxBuffer: GIT_OUTPUT_MAX_BYTES });
  const raw = result.stdout;
  const value = raw.trim();
  const detail = (result.stderr.trim() || value || `git exited ${String(result.status)}`).slice(0, GIT_FAILURE_DETAIL_MAX_CHARS);
  return { ok: result.status === 0, raw, value, detail, status: result.status };
}

export function snapGitIdentity(root: string): Pick<SnapRunIndex["identity"], "sha" | "ref"> & { readonly failures: readonly GitFailure[] } {
  const sha = git(root, ["rev-parse", "HEAD"]);
  const ref = git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const failures: GitFailure[] = [];
  if (!sha.ok) {
    failures.push({ field: "sha", detail: sha.detail });
  }
  if (!(ref.ok || (sha.ok && ref.status === 1))) {
    failures.push({ field: "ref", detail: ref.detail });
  }
  let refValue = "unavailable";
  if (ref.ok) {
    refValue = ref.value;
  } else if (sha.ok) {
    refValue = "detached";
  }
  return { sha: sha.ok ? sha.value : "unavailable", ref: refValue, failures };
}

export function snapDirtyIdentity(root: string): SnapRunIndex["identity"]["dirty"] & { readonly failures: readonly GitFailure[] } {
  const status = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const trackedDelta = git(root, ["diff", "--binary", "HEAD", "--"]);
  const untrackedRead = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const failures = [
    ...(status.ok ? [] : [{ field: "status", detail: status.detail }]),
    ...(trackedDelta.ok ? [] : [{ field: "tracked-delta", detail: trackedDelta.detail }]),
    ...(untrackedRead.ok ? [] : [{ field: "untracked-list", detail: untrackedRead.detail }]),
  ];
  if (failures.length > 0) {
    return { state: "unknown", digest: null, failures };
  }
  const untracked = untrackedRead.raw
    .split("\0")
    .filter((path) => path !== "")
    .sort();
  // RAW on both sides: the digest is a claim about the working tree's exact bytes.
  const hash = createHash("sha256").update(status.raw).update("\0").update(trackedDelta.raw);
  for (const path of untracked) {
    hash.update("\0").update(path).update("\0");
    // @orb-waive caught-failure-ownership(error): unreadable bytes make source identity explicitly unknown with the exact failed field; no sentinel digest may masquerade as reproducible content. Ends if this catch stops returning that failure.
    try {
      hash.update(readFileSync(join(root, path)));
    } catch (error) {
      const detail = (error instanceof Error ? error.message : String(error)).slice(0, GIT_FAILURE_DETAIL_MAX_CHARS);
      return { state: "unknown", digest: null, failures: [{ field: `untracked-bytes:${path}`, detail }] };
    }
  }
  return { state: status.value === "" ? "clean" : "dirty", digest: hash.digest("hex"), failures: [] };
}

export function snapCheckoutIdentity(root: string): {
  readonly checkouts: NonNullable<SnapRunIndex["identity"]["checkouts"]>;
  readonly failures: readonly GitFailure[];
} {
  const subjectPath = resolve(root);
  const common = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common.ok) {
    const location = { name: checkoutName(subjectPath), path: subjectPath, rootRelativePath: "." };
    return { checkouts: { primary: location, subject: { ...location, kind: "unknown" } }, failures: [{ field: "git-common-dir", detail: common.detail }] };
  }
  const commonDir = resolve(root, common.value);
  const primaryPath = basename(commonDir) === ".git" ? dirname(commonDir) : subjectPath;
  const primary = { name: checkoutName(primaryPath), path: primaryPath, rootRelativePath: "." };
  return {
    checkouts: {
      primary,
      subject: {
        kind: primaryPath === subjectPath ? "primary" : "linked",
        name: checkoutName(subjectPath),
        path: subjectPath,
        rootRelativePath: relative(primaryPath, subjectPath) || ".",
      },
    },
    failures: [],
  };
}

export async function readSnapRunStartedAt(slotDir: string): Promise<string> {
  // @orb-waive caught-failure-ownership(catch): a missing/corrupt optional .inflight marker deliberately falls through to the slot birthtime, the documented lower-fidelity provenance source. Ends if birthtime is no longer recorded in run.json.
  try {
    const marker: unknown = JSON.parse(await readFile(join(slotDir, ".inflight"), "utf8"));
    if (typeof marker === "object" && marker !== null) {
      const startedAt = Reflect.get(marker, "startedAt");
      if (typeof startedAt === "string") {
        return startedAt;
      }
    }
  } catch {
    // Fall through to the filesystem-owned start timestamp.
  }
  return (await stat(slotDir)).birthtime.toISOString();
}

function legacyArtifactSchema(relativePath: string): string | null {
  const suffix = relativePath.toLowerCase();
  if (suffix.endsWith(".png")) {
    return "image/png";
  }
  if (suffix.endsWith(".zip")) {
    return "application/zip";
  }
  return suffix.endsWith(".json") ? "json" : null;
}

interface SnapArtifactDeclaration extends Omit<InstrumentArtifactDeclaration, "producerArm"> {
  readonly producerArm: Arm | null;
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, "code") : null;
}

async function readArtifactDeclarations(slotDir: string): Promise<ReadonlyMap<string, SnapArtifactDeclaration>> {
  const dir = join(slotDir, ARTIFACT_DECLARATIONS_DIR);
  let names: readonly string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return new Map();
    }
    throw error;
  }
  const declarations = new Map<string, SnapArtifactDeclaration>();
  for (const name of names) {
    const path = join(dir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      throw new Error(`INSTRUMENT ERROR: corrupt artifact declaration ${path} (${error instanceof Error ? error.message : String(error)})`, { cause: error });
    }
    const declaration = instrumentArtifactDeclarationSchema.safeParse(parsed);
    if (!(declaration.success && (declaration.data.producerArm === null || ARMS.some((arm) => arm === declaration.data.producerArm)))) {
      throw new Error(`INSTRUMENT ERROR: malformed artifact declaration ${path}`);
    }
    declarations.set(resolve(declaration.data.path), declaration.data as SnapArtifactDeclaration);
  }
  return declarations;
}

async function inventoryFile(slotDir: string, relativePath: string, declarations: ReadonlyMap<string, SnapArtifactDeclaration>): Promise<SnapRunArtifact> {
  const path = join(slotDir, relativePath);
  const relativeRef = artifactRef(relativePath);
  const file = await stat(path);
  const declaration = declarations.get(resolve(path));
  if (declaration !== undefined) {
    return {
      path,
      relativePath: relativeRef,
      publishedPath: declaration.publishedPath,
      bytes: file.size,
      producer: declaration.producer,
      producerArm: declaration.producerArm,
      channel: declaration.channel,
      mediaType: declaration.mediaType,
      schema: declaration.schema,
      role: declaration.role,
      completeness: declaration.completeness,
      completenessDetail: declaration.completenessDetail,
      scope: declaration.scope,
      records: declaration.records,
      limits: declaration.limits,
      declaration: "declared",
    };
  }
  const pageMatch = /(?:^|[-_])(?:page|p)(\d+)(?:[-_.]|$)/iu.exec(relativePath);
  const rawFallback = /^trace(?:-\d+)?\.zip$/u.test(basename(relativePath).toLowerCase());
  let completenessDetail = "legacy immutable-v1 artifact without an allocation declaration";
  if (rawFallback) {
    completenessDetail += "; raw Playwright trace bytes are human/deep-forensics fallback only";
  }
  return {
    path,
    relativePath: relativeRef,
    publishedPath: null,
    bytes: file.size,
    producer: "legacy",
    producerArm: null,
    channel: "legacy",
    mediaType: legacyArtifactSchema(relativePath) ?? "application/octet-stream",
    schema: null,
    role: rawFallback ? "raw-fallback" : "primary",
    completeness: "unknown",
    completenessDetail,
    scope: instrumentLegacyScopeSchema.parse({ kind: "legacy", page: pageMatch === null ? null : Number(pageMatch[1]), context: null, window: null }),
    records: null,
    limits: [],
    declaration: "legacy",
  };
}

async function collectArtifacts(
  slotDir: string,
  relativeDir: string,
  declarations: ReadonlyMap<string, SnapArtifactDeclaration>,
  artifacts: SnapRunArtifact[],
): Promise<void> {
  for (const entry of await readdir(join(slotDir, relativeDir), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const relativePath = relativeDir === "" ? entry.name : join(relativeDir, entry.name);
    if (relativePath === RUN_INDEX) {
      continue;
    }
    if (entry.isDirectory()) {
      await collectArtifacts(slotDir, relativePath, declarations, artifacts);
    } else {
      artifacts.push(await inventoryFile(slotDir, relativePath, declarations));
    }
  }
}

export async function collectSnapRunArtifacts(slotDir: string): Promise<readonly SnapRunArtifact[]> {
  const artifacts: SnapRunArtifact[] = [];
  const declarations = await readArtifactDeclarations(slotDir);
  await collectArtifacts(slotDir, "", declarations, artifacts);
  return artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}
