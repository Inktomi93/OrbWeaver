// The git-listed files of one checkout, shared by the citation suites: the real repository or a planted one.
// Tracked and untracked-but-not-ignored files count, so a file added before `git add` is still judged.
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execGit, GIT_READ_PREFIX } from "@orb/tooling/floor/git/git";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";

const LS_FILES_BUFFER_BYTES = 64 * 1024 * 1024;

export interface RepoTree {
  readonly root: string;
  /** Sorted repo-relative POSIX paths of the regular files that exist on disk. */
  readonly paths: readonly string[];
  readonly read: (path: string) => string;
}

export function loadTree(root: string): RepoTree {
  const listed = execGit(root, [...GIT_READ_PREFIX, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: LS_FILES_BUFFER_BYTES });
  const paths = [...new Set(listed.split("\0").filter((path) => path !== ""))]
    .filter((path) => {
      try {
        return lstatSync(join(root, path)).isFile();
      } catch {
        // A path the index lists but the checkout no longer holds is a pending delete, not a member.
        return false;
      }
    })
    .toSorted((left, right) => left.localeCompare(right));
  const texts = new Map<string, string>();
  return {
    root,
    paths,
    read: (path): string => {
      let text = texts.get(path);
      if (text === undefined) {
        text = readFileSync(join(root, path), "utf8");
        texts.set(path, text);
      }
      return text;
    },
  };
}

/** A planted checkout becomes a repository so git can list it and classify its ignored build output. */
export function loadPlantedTree(root: string): RepoTree {
  execFixtureGit(root, ["init", "-q"]);
  return loadTree(root);
}

export function isMarkdown(path: string): boolean {
  return path.endsWith(".md");
}

export function isTypeScript(path: string): boolean {
  return path.endsWith(".ts") || path.endsWith(".tsx");
}

export function underAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix));
}
