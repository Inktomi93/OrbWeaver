// The authored-path identity door. The load-bearing arm is the LAST one: an in-repo symlink whose target
// resolves outside the root must be `outside`, because `trackedFiles()` returns repo paths and Git lists a
// symlink as an ordinary path — so without this door that escape satisfies every membership check a policy
// has and silently PASSES (`gates/runner-config-path-liveness.ts:23-31`).
//
// Every arm below plants a REAL filesystem object and reads a REAL verdict; there is no in-memory stand-in
// for a symlink, which is exactly why the door exists at this layer rather than in a pure reader.

import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runGit } from "@orb/tooling/floor/git/git";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { AuthoredPathIdentity } from "../../../../tooling/src/verify/contract/resource-path.ts";
import { loadAuthoredPaths } from "../../../../tooling/src/verify/ops/resource-path.ts";

function plantFile(root: string, path: string, text = "x\n"): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function identify(root: string, selectors: readonly string[], git: typeof runGit = runGit): readonly AuthoredPathIdentity[] {
  const load = loadAuthoredPaths(root, selectors, git);
  if (load.status !== "ready") {
    throw new Error(`authored-path load refused: ${load.reason}`);
  }
  return load.value.identities;
}

test("a repo-relative selector resolves to file, directory or absent, and the partition is total", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  plantFile(scratch, "tests/live.int.test.ts");
  const identities = identify(scratch, ["tests/live.int.test.ts", "tests", "tests/gone.int.test.ts", "tests/live.int.test.ts"]);

  // Four selectors demanded, three DISTINCT — one identity each, sorted, none dropped.
  expect(identities.map((identity) => identity.selector)).toEqual(["tests", "tests/gone.int.test.ts", "tests/live.int.test.ts"]);
  expect(identities.every((identity) => identity.form === "repo-relative")).toBe(true);
  expect(identities).toEqual([
    { selector: "tests", form: "repo-relative", status: "directory", path: "tests" },
    // A dead selector still carries its normalized path: the finding a liveness policy raises names it.
    { selector: "tests/gone.int.test.ts", form: "repo-relative", status: "absent", path: "tests/gone.int.test.ts" },
    { selector: "tests/live.int.test.ts", form: "repo-relative", status: "file", path: "tests/live.int.test.ts" },
  ]);
});

test("an absolute selector is normalized against the root, which a policy context cannot do", ({ scratch }) => {
  plantFile(scratch, "vitest.config.ts");
  // Identities come back sorted BY SELECTOR, so look them up rather than positionally.
  const identities = identify(scratch, [join(scratch, "vitest.config.ts"), "/etc"]);
  const inside = identities.find((identity) => identity.selector === join(scratch, "vitest.config.ts"));
  const elsewhere = identities.find((identity) => identity.selector === "/etc");

  // The whole point of the absolute half: `GatePolicyContext` carries no root, so this verdict is
  // unobtainable inside a policy. Both are `absolute`; only one relates to this repository.
  expect(inside).toEqual({ selector: join(scratch, "vitest.config.ts"), form: "absolute", status: "file", path: "vitest.config.ts" });
  expect(elsewhere?.form).toBe("absolute");
  expect(elsewhere?.status).toBe("outside");
});

test("a lexically escaping selector is outside and its reason never echoes the external target", ({ scratch }) => {
  const [escaped] = identify(scratch, ["../../etc/passwd"]);

  expect(escaped?.status).toBe("outside");
  expect(escaped).not.toHaveProperty("path");
  // A liveness verdict must not become a disclosure of what lives outside the checkout.
  expect(escaped?.status === "outside" ? escaped.reason : "").not.toContain("passwd");
});

test("AN IN-REPO SYMLINK RESOLVING OUTSIDE THE ROOT IS `outside`, AND ITS CONTAINED TWIN IS NOT", ({ scratch }) => {
  // The two-sided control. Both selectors are ordinary repo-relative paths that EXIST; both are symlinks;
  // only the target differs. Nothing available to a policy before this door could tell them apart.
  plantFile(scratch, "tests/real.int.test.ts");
  mkdirSync(join(scratch, "outside-the-root"), { recursive: true });
  writeFileSync(join(scratch, "outside-the-root", "secret.txt"), "secret\n");
  mkdirSync(join(scratch, "repo"), { recursive: true });
  plantFile(scratch, "repo/tests/real.int.test.ts");
  symlinkSync(join(scratch, "outside-the-root", "secret.txt"), join(scratch, "repo", "escape.ts"));
  symlinkSync("tests/real.int.test.ts", join(scratch, "repo", "contained.ts"));
  symlinkSync(join(scratch, "outside-the-root", "gone.txt"), join(scratch, "repo", "dangling.ts"));

  const root = join(scratch, "repo");
  const [contained, dangling, escaping] = identify(root, ["contained.ts", "dangling.ts", "escape.ts"]);

  // THE DEFECT ARM: exists, tracked-looking, repo-relative — and outside.
  expect(escaping?.status).toBe("outside");
  expect(escaping?.status === "outside" ? escaping.reason : "").toContain("symbolic link");
  // THE CONTROL: a symlink is not itself suspicious. An in-repo target resolves to its real kind, so the
  // arm above is a containment verdict rather than a blanket refusal of links.
  expect(contained).toEqual({ selector: "contained.ts", form: "repo-relative", status: "file", path: "contained.ts" });
  // A DANGLING link names nothing — the same verdict as a path that was never there, never `outside`.
  expect(dangling).toEqual({ selector: "dangling.ts", form: "repo-relative", status: "absent", path: "dangling.ts" });
});

test("a root reached through a symlink does not report its own contents as outside", ({ scratch }) => {
  // The false positive that would fire on every lane: a worktree under `.claude/worktrees/` is regularly
  // reached through a link, and comparing a realpathed TARGET against a LEXICAL root reports everything as
  // escaping. The root is realpathed separately for exactly this.
  mkdirSync(join(scratch, "real-root"), { recursive: true });
  plantFile(scratch, "real-root/vitest.config.ts");
  symlinkSync(join(scratch, "real-root"), join(scratch, "linked-root"));

  const [config] = identify(join(scratch, "linked-root"), ["vitest.config.ts"]);
  expect(config?.status).toBe("file");
});

test("an empty demand is an EMPTY fact, never a ready one with nothing in it", ({ scratch }) => {
  const load = loadAuthoredPaths(scratch, []);

  // A ready-but-empty fact reads exactly like "every selector is live". It is a refusal instead.
  expect(load.status).toBe("empty");
  expect(load.members).toBe(0);
});

test("the door owns no population: a ready fact publishes zero resource paths", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  plantFile(scratch, "tests/live.int.test.ts");
  const load = loadAuthoredPaths(scratch, ["tests/live.int.test.ts", "tests/gone.int.test.ts"]);

  // Publishing them would put a DEAD or ESCAPING selector into the policy's effective population, which is
  // the opposite of the verdict the policy asked for.
  expect(load.paths).toEqual([]);
  expect(load.members).toBe(2);
});

test("ignored build classification preserves absence and rejects missing descendants of existing output", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  plantFile(scratch, ".gitignore", "dist/\n");
  plantFile(scratch, "packages/showcase-plugins/package.json", "{}\n");
  const selector = "packages/showcase-plugins/dist/bundles/";
  expect(identify(scratch, [selector])).toEqual([
    { selector, form: "repo-relative", status: "absent", path: "packages/showcase-plugins/dist/bundles", ignoredBuildOutput: true },
  ]);
  plantFile(scratch, "packages/showcase-plugins/dist/bundles/live.js");
  expect(identify(scratch, [selector])[0]?.status).toBe("directory");
  const typo = "packages/showcase-plugins/dist/bundlez/";
  expect(identify(scratch, [typo])).toEqual([{ selector: typo, form: "repo-relative", status: "absent", path: "packages/showcase-plugins/dist/bundlez" }]);
});

test("ignored-output metadata does not acquit a missing path behind an external symlink", ({ scratch }) => {
  const root = join(scratch, "repo");
  plantFile(root, ".gitignore", "dist/\n");
  mkdirSync(join(scratch, "external"), { recursive: true });
  symlinkSync(join(scratch, "external"), join(root, "linked"));
  execFixtureGit(root, ["init", "-q"]);
  const selector = "linked/dist/bundles";
  expect(identify(root, [selector])).toEqual([{ selector, form: "repo-relative", status: "absent", path: selector }]);
});

test("a resource load shares prefix answers and the next load sees ignore edits", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  plantFile(scratch, ".gitignore", "dist/\n");
  plantFile(scratch, "packages/showcase-plugins/package.json", "{}\n");
  const selectors = ["packages/showcase-plugins/dist/a.js", "packages/showcase-plugins/dist/b.js"];
  let queries = 0;
  const countedGit: typeof runGit = (root, args, options) => {
    queries += 1;
    return runGit(root, args, options);
  };
  expect(identify(scratch, selectors, countedGit).every((identity) => identity.status === "absent" && identity.ignoredBuildOutput === true)).toBe(true);
  expect(queries).toBe(1);
  plantFile(scratch, ".gitignore", "out/\n");
  expect(identify(scratch, selectors).every((identity) => identity.status === "absent" && identity.ignoredBuildOutput === undefined)).toBe(true);
});

test("a fatal ignore batch refuses the resource instead of publishing partial identities", ({ scratch }) => {
  plantFile(scratch, "packages/live.ts");
  const fatalGit: typeof runGit = () => ({ status: 128, stdout: "", stderr: "private external target" });
  const load = loadAuthoredPaths(scratch, ["packages/live.ts", "packages/missing.ts"], fatalGit);
  expect(load).toEqual({ status: "unresolved", paths: [], members: 0, reason: expect.stringContaining("Git ignore classification failed") });
  if (load.status === "ready") {
    throw new Error("a failed batch published identities");
  }
  expect(load.reason).not.toContain("private external target");
  expect(load.reason).toContain("packages");
});

test("a contained symlink ancestor preserves Git's fatal refusal rather than becoming a missing path", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "-q"]);
  plantFile(scratch, ".gitignore", "dist/\n");
  mkdirSync(join(scratch, "packages/real"), { recursive: true });
  symlinkSync("real", join(scratch, "packages/linked"), "dir");
  const selector = "packages/linked/dist/missing.js";
  expect(runGit(scratch, ["check-ignore", "--", "packages/linked/dist", "packages/linked/dist/"]).status).toBe(128);
  const load = loadAuthoredPaths(scratch, [selector, "packages/real"]);
  expect(load.status).toBe("unresolved");
  if (load.status === "ready") {
    throw new Error("a fatal symlink query published identities");
  }
  expect(load.reason).toContain("exit 128");
  expect(load.reason).toContain("packages/linked/dist");
  expect(load.reason).not.toContain(scratch);
  expect(identify(scratch, ["packages/real/dist/missing.js"])[0]).toHaveProperty("ignoredBuildOutput", true);
});

test("existing and outside selectors spend no Git query, including a root reached through a symlink", ({ scratch }) => {
  plantFile(scratch, "real-root/packages/live.ts");
  symlinkSync("real-root", join(scratch, "linked-root"), "dir");
  let queries = 0;
  const git: typeof runGit = () => {
    queries += 1;
    throw new Error("no missing path means no Git query");
  };
  expect(identify(join(scratch, "linked-root"), ["packages/live.ts", "../../outside"], git).map((identity) => identity.status)).toEqual(["outside", "file"]);
  expect(queries).toBe(0);
});

test("a non-directory ancestor is unresolved, not absent or eligible for ignore classification", ({ scratch }) => {
  plantFile(scratch, "packages/file.ts");
  let queries = 0;
  const git: typeof runGit = () => {
    queries += 1;
    throw new Error("an unresolved selector is not an ignore query");
  };
  const selector = "packages/file.ts/missing.ts";
  expect(identify(scratch, [selector], git)).toEqual([{ selector, form: "repo-relative", status: "unresolved", reason: expect.stringContaining("ENOTDIR") }]);
  expect(queries).toBe(0);
});
