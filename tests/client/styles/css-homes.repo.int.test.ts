// Every tracked stylesheet under packages/ is a home in docs/law/client-architecture-lockdown.md §4.2, so a stray sheet fails here.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const SHELL_REGION_DIR = "packages/client/src/features/app-shell/surfaces/shell/";

/** The §4.2 homes: exact paths, plus the shell's region directory. */
const CSS_HOMES = {
  files: [
    "packages/ui/src/styles/theme.css",
    "packages/ui/src/styles/globals.css",
    "packages/ui/src/styles/layers.css",
    "packages/ui/src/styles/fonts.css",
    "packages/ui/src/styles/motion-floor.css",
    "packages/ui/src/styles/primitives.css",
    "packages/ui/src/styles/waystone.css",
    "packages/ui/src/styles/weave.css",
    "packages/ui/src/styles/tiers.css",
    "packages/ui/src/markdown/katex.css",
    "packages/client/src/styles/globals.css",
    "packages/client/src/styles/platform.css",
    "packages/client/src/styles/appearance-channel.gen.css",
    "packages/client/src/features/app-shell/surfaces/shell.css",
  ],
  directories: [SHELL_REGION_DIR],
} as const;

const isCssHome = (path: string, homes: typeof CSS_HOMES): boolean =>
  homes.files.some((file) => file === path) || homes.directories.some((directory) => path.startsWith(directory));

const trackedStylesheets = (): string[] =>
  execFileSync("git", ["ls-files", "-z", "--", "packages/**/*.css"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "");

test("every tracked stylesheet under packages is a §4.2 home", () => {
  const sheets = trackedStylesheets();
  expect(sheets.length).toBeGreaterThan(0);
  expect(sheets.filter((path) => !isCssHome(path, CSS_HOMES))).toEqual([]);
});

test("every named home is a tracked stylesheet, so a deleted home leaves the list", () => {
  const sheets = new Set(trackedStylesheets());
  expect(CSS_HOMES.files.filter((path) => !sheets.has(path))).toEqual([]);
});

test("a stray sheet beside a home or inside a feature is refused", () => {
  expect(isCssHome("packages/client/src/features/chat/surfaces/chat.css", CSS_HOMES)).toBe(false);
  expect(isCssHome("packages/ui/src/styles/extra.css", CSS_HOMES)).toBe(false);
  expect(isCssHome(`${SHELL_REGION_DIR}new-region.css`, CSS_HOMES)).toBe(true);
});
