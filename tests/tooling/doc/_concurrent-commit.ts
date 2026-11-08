// A `reference-transaction` hook that, once a tool commit's ref update lands, locks the index so the checkout's
// index cannot follow, then lands a concurrent commit on HEAD before the tool can undo its own.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "../../../tooling/src/floor/git/git-fixture.ts";

export function plantConcurrentCommit(root: string, scratch: string): void {
  const hooksDir = join(scratch, "race-hooks");
  mkdirSync(hooksDir, { recursive: true });
  const marker = join(scratch, "race-fired");
  writeFileSync(
    join(hooksDir, "reference-transaction"),
    [
      "#!/bin/sh",
      `[ "$1" = committed ] || exit 0`,
      `[ -e "${marker}" ] && exit 0`,
      `touch "${marker}"`,
      "read -r old new ref",
      `touch "$(git rev-parse --git-path index.lock)"`,
      `concurrent=$(git commit-tree "$new^{tree}" -p "$new" -m "feat(x): concurrent")`,
      `git update-ref HEAD "$concurrent"`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  execFixtureGit(root, ["config", "--local", "core.hooksPath", hooksDir]);
}
