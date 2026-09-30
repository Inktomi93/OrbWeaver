#!/usr/bin/env node
// SessionStart hook, remote web sessions only: when the image ships an older Chromium than the pinned
// Playwright expects, map each missing pinned executable onto the nearest installed revision so CT can launch.
// The shared browsers root is never written: a private root mirrors it, and CLAUDE_ENV_FILE points Bash there.
import { appendFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REMOTE_ENV = "CLAUDE_CODE_REMOTE";
const BROWSERS_PATH_ENV = "PLAYWRIGHT_BROWSERS_PATH";
const ENV_FILE_ENV = "CLAUDE_ENV_FILE";
const REVISION_DIR = /^(.+)-(\d+)$/;
const MISSING_EXECUTABLE = /Executable doesn't exist at (\S+)/;
// An older revision may ship the executable under an older name; the pinned layout's own name is tried first.
const EXECUTABLE_NAMES = ["chrome-headless-shell", "headless_shell", "chrome"];

function say(line) {
  process.stdout.write(`${line}\n`);
}

/** Playwright's default browsers root on Linux, used when the environment does not name one. */
function browsersRoot(env) {
  return env[BROWSERS_PATH_ENV] || join(homedir(), ".cache", "ms-playwright");
}

/** The private root the mapping is built in. Derived from HOME, so a test can plant it. */
function shimRoot() {
  return join(homedir(), ".cache", "orb-playwright-shim");
}

/** Split an expected executable path into its browser name, pinned revision and path inside the revision dir. */
function parseExpected(root, expectedPath) {
  const rel = relative(root, expectedPath);
  const [dirName = "", ...inner] = rel.split(sep);
  const match = REVISION_DIR.exec(dirName);
  if (rel.startsWith("..") || match === null || inner.length === 0) {
    return null;
  }
  return { name: match[1], revision: Number(match[2]), inner: inner.join(sep) };
}

/** The installed revision of `name` nearest the pinned one, or null when there is none. */
function nearestRevision(entries, name, pinned) {
  let best = null;
  for (const entry of entries) {
    const match = REVISION_DIR.exec(entry);
    if (match === null || match[1] !== name || Number(match[2]) === pinned) {
      continue;
    }
    const revision = Number(match[2]);
    if (best === null || Math.abs(revision - pinned) < Math.abs(best - pinned)) {
      best = revision;
    }
  }
  return best;
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/** The executable inside an installed revision dir: the pinned layout first, then each subdir by known names. */
function findExecutable(dir, inner) {
  if (isFile(join(dir, inner))) {
    return join(dir, inner);
  }
  const names = [inner.split(sep).at(-1), ...EXECUTABLE_NAMES];
  for (const sub of readdirSync(dir)) {
    for (const name of names) {
      if (isFile(join(dir, sub, name))) {
        return join(dir, sub, name);
      }
    }
  }
  return null;
}

/** One mapping per missing pinned executable: where it must appear and what it resolves to, or why not. */
function planShim(root, missingPaths) {
  const entries = existsSync(root) ? readdirSync(root) : [];
  return missingPaths.flatMap((expected) => {
    const parsed = parseExpected(root, expected);
    if (parsed === null) {
      return [];
    }
    const revision = nearestRevision(entries, parsed.name, parsed.revision);
    const target = revision === null ? null : findExecutable(join(root, `${parsed.name}-${String(revision)}`), parsed.inner);
    return [{ ...parsed, installed: target === null ? null : revision, target }];
  });
}

/** Mirror `root` into `shim` and place each mapped executable at its pinned path. Rebuilt from scratch each run. */
function buildShim(root, shim, plan) {
  rmSync(shim, { recursive: true, force: true });
  mkdirSync(shim, { recursive: true });
  for (const entry of existsSync(root) ? readdirSync(root) : []) {
    symlinkSync(join(root, entry), join(shim, entry));
  }
  for (const mapping of plan) {
    if (mapping.target === null) {
      continue;
    }
    const link = join(shim, `${mapping.name}-${String(mapping.revision)}`, mapping.inner);
    mkdirSync(dirname(link), { recursive: true });
    // The real path, so the browser finds its resources beside the binary it actually runs.
    symlinkSync(realpathSync(mapping.target), link);
  }
}

/** The pinned executables this Playwright cannot find: the full browser's path, and the one a launch names. */
async function missingPinnedExecutables() {
  const { chromium } = await import("@playwright/test");
  const expected = new Set([chromium.executablePath()]);
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch (error) {
    const match = MISSING_EXECUTABLE.exec(error instanceof Error ? error.message : String(error));
    if (match !== null) {
      expected.add(match[1]);
    }
  }
  return [...expected].filter((path) => !existsSync(path));
}

async function main() {
  if (process.env[REMOTE_ENV] !== "true") {
    return;
  }
  const root = browsersRoot(process.env);
  const missing = await missingPinnedExecutables();
  if (missing.length === 0) {
    return;
  }
  const plan = planShim(root, missing);
  const mapped = plan.filter((mapping) => mapping.target !== null);
  for (const mapping of plan) {
    say(
      mapping.target === null
        ? `playwright: pinned ${mapping.name} r${String(mapping.revision)} is not installed and no other revision is; tests that need it cannot launch`
        : `playwright: pinned ${mapping.name} r${String(mapping.revision)} is not installed; mapped it to installed r${String(mapping.installed)} (${mapping.target})`,
    );
  }
  const envFile = process.env[ENV_FILE_ENV];
  if (mapped.length === 0 || envFile === undefined) {
    return;
  }
  const shim = shimRoot();
  buildShim(root, shim, plan);
  appendFileSync(envFile, `export ${BROWSERS_PATH_ENV}='${shim}'\n`);
  say(`playwright: ${BROWSERS_PATH_ENV}=${shim} for this session`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // A hook failure must never block the session; the next CT run reports a missing browser itself.
  main().catch((error) => {
    say(`playwright: revision shim skipped — ${error instanceof Error ? error.message : String(error)}`);
  });
}
