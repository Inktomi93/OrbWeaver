// Historical and candidate-index identities share the Git door; current disk/overlay membership remains mirror-owned.
import { resolve } from "node:path";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { GIT_READ_PREFIX, runGit } from "../../floor/git/git.ts";
import type { FixtureGitHistoryFoundation } from "../../floor/git/git-fixture.ts";
import { fixtureGitHistoryFoundation } from "../../floor/git/git-fixture.ts";
import { readGitPathHistory } from "../../floor/git/git-history.ts";
import type { ResourceLoad } from "../contract/resource.ts";
import type { GitPathHistoryResource, GitPathHistoryResourceId } from "../contract/resource-git-history.ts";
import { GIT_PATH_HISTORY_DEFINITIONS } from "../contract/resource-git-history.ts";
import { normalizePathSet } from "../lib/policy-validation.ts";
import { candidateIndexGitEnvironment } from "./resource-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

export function loadGitPathHistoryResource(
  root: string,
  id: GitPathHistoryResourceId,
  fixture?: FixtureGitHistoryFoundation,
): ResourceLoad<GitPathHistoryResource> {
  const definition = GIT_PATH_HISTORY_DEFINITIONS[id];
  const history = readGitPathHistory(root, {
    kind: "founded",
    path: definition.path,
    foundation: fixture === undefined ? definition.foundation : fixtureGitHistoryFoundation(fixture, root),
  });
  if (history.status !== "ready") {
    return { status: "unresolved", paths: [], members: 0, reason: history.reason };
  }
  const index = runGit(resolve(root), [...GIT_READ_PREFIX, "ls-files", "--cached", "-z", "--", `:(literal)${definition.path}`], {
    extra: candidateIndexGitEnvironment(root),
  });
  if (index.status !== 0 || (index.stdout !== "" && !index.stdout.endsWith("\0"))) {
    return { status: "unresolved", paths: [], members: 0, reason: "Git filename history cannot resolve the candidate index" };
  }
  const candidatePaths = normalizePathSet(index.stdout === "" ? [] : index.stdout.slice(0, -1).split("\0"), "historical candidate index path");
  const historical = history.value;
  // The founded tree root keeps a legitimate empty transition population distinct from acquisition failure.
  const paths = normalizePathSet(
    [definition.path, ...historical.initialPaths, ...historical.addedPaths, ...historical.deletedPaths, ...candidatePaths],
    "Git filename history resource path",
  );
  return { status: "ready", value: { history: historical, candidatePaths }, paths, members: paths.length };
}
