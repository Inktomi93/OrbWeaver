// Mirror generation follows git's tracked-file truth, not an rsync approximation. This preserves negated
// ignore rules and then proves every tracked code file survived the drop/strip/copy pass.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runGit } from "../../_shared/git.ts";
import type { MirrorSummary } from "../contract/types.ts";
import { stripComments, stripperFor } from "../lib/strip.ts";

refuseDirectInvocation(import.meta.url, "pnpm review:mirror");

const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const GIT_LS_BUFFER_MIB = 256;
const GIT_LS_MAX_BUFFER = GIT_LS_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;
const CODE_EXT_RE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;
const DROP_PREFIX = ["docs/", "reports/", "scripts/probes/"];
const DROP_EXT = new Set([
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm",
  ".wav",
  ".ogg",
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
  ".keep",
  ".jsonl",
]);

function gitLines(root: string, args: readonly string[]): readonly string[] {
  const result = runGit(root, [...args], { maxBuffer: GIT_LS_MAX_BUFFER });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.split(/\r?\n/u).filter((line) => line !== "");
}

export function sourceCommit(root: string): string {
  const dirty = gitLines(root, ["status", "--porcelain=v1", "--untracked-files=no"]);
  if (dirty.length > 0) {
    throw new Error("review mirror requires a clean tracked tree so its bytes match sourceCommit");
  }
  const [commit] = gitLines(root, ["rev-parse", "HEAD"]);
  if (commit === undefined) {
    throw new Error("git rev-parse HEAD returned no commit");
  }
  return commit;
}

function dropped(path: string): boolean {
  return DROP_PREFIX.some((prefix) => path.startsWith(prefix)) || DROP_EXT.has(extname(path).toLowerCase());
}

function prepareTarget(target: string): string {
  const absolute = resolve(target);
  if (existsSync(absolute)) {
    if (!statSync(absolute).isDirectory()) {
      throw new Error(`review mirror target exists and is not a directory: ${absolute}`);
    }
    if (readdirSync(absolute).length > 0) {
      throw new Error(`review mirror target is not empty; choose a fresh directory: ${absolute}`);
    }
  } else {
    mkdirSync(absolute, { recursive: true });
  }
  return absolute;
}

export function generateMirror(root: string, requestedTarget: string): MirrorSummary {
  const target = prepareTarget(requestedTarget);
  const tracked = gitLines(root, ["ls-files"]);
  let stripped = 0;
  let copied = 0;
  let droppedFiles = 0;
  let mirroredBytes = 0;
  const errors: string[] = [];

  for (const relative of tracked) {
    if (dropped(relative)) {
      droppedFiles += 1;
      continue;
    }
    const source = join(root, relative);
    const destination = join(target, relative);
    // @orb-waive caught-failure-ownership(error): pushed into the errors[] array returned to the caller as part of the mirror result, not dropped. Ends if the errors array stops being surfaced in the return value.
    try {
      if (lstatSync(source).isSymbolicLink()) {
        droppedFiles += 1;
        continue;
      }
      mkdirSync(dirname(destination), { recursive: true });
      const strip = stripperFor(relative);
      if (strip === null) {
        copyFileSync(source, destination);
        copied += 1;
      } else {
        const original = readFileSync(source, "utf8");
        if (original.includes("\u0000")) {
          copyFileSync(source, destination);
          copied += 1;
        } else {
          writeFileSync(destination, stripComments(relative, original));
          stripped += 1;
        }
      }
      mirroredBytes += statSync(destination).size;
    } catch (error) {
      errors.push(`${relative}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const expectedCode = tracked.filter((path) => CODE_EXT_RE.test(path) && !dropped(path));
  const missingCode = expectedCode.filter((path) => !existsSync(join(target, path)));
  const mirroredCode = expectedCode.length - missingCode.length;
  return {
    target,
    tracked: tracked.length,
    mirroredFiles: stripped + copied,
    mirroredCode,
    mirroredBytes,
    stripped,
    copied,
    dropped: droppedFiles,
    errors,
    missingCode,
  };
}
