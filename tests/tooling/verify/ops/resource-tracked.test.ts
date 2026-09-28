import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { loadTrackedFiles } from "../../../../tooling/src/verify/ops/resource-tracked.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("Git failure is unresolved, while a valid empty index is empty", ({ scratch }) => {
  expect(loadTrackedFiles(scratch)).toMatchObject({ status: "unresolved", subprocess: { exitStatus: 128 } });
  execFixtureGit(scratch, ["init", "--quiet"]);
  expect(loadTrackedFiles(scratch)).toMatchObject({ status: "empty", subprocess: { exitStatus: 0 }, members: 0 });
  expect(loadTrackedFiles(scratch, [{ path: "missing.test.ts", executable: true }])).toMatchObject({
    status: "unresolved",
    reason: expect.stringContaining("not in the candidate index"),
  });
});

test("tracked inventory excludes untracked and overlay files and snapshots once per invocation", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  writeFileSync(join(scratch, "tracked file.ts"), "tracked");
  writeFileSync(join(scratch, "untracked.ts"), "untracked");
  execFixtureGit(scratch, ["add", "tracked file.ts"]);
  const invocation = createResourceHost({ root: scratch, overlay: { "virtual.ts": "virtual", "tracked file.ts": null } });
  const first = invocation.host.trackedFiles();
  expect(first).toMatchObject({
    status: "ready",
    value: { repoPaths: ["tracked file.ts"], executablePaths: [] },
    members: 1,
    subprocess: { command: "git-index", exitStatus: 0 },
  });
  execFixtureGit(scratch, ["add", "untracked.ts"]);
  expect(invocation.host.trackedFiles()).toBe(first);
  expect(invocation.receipts()).toHaveLength(1);
  expect(createResourceHost({ root: scratch }).host.trackedFiles()).toMatchObject({ status: "ready", members: 2 });
});

test("tracked inventory reads executable mode from the candidate index rather than filesystem mode", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  writeFileSync(join(scratch, "ordinary.test.ts"), "ordinary");
  writeFileSync(join(scratch, "executable.test.ts"), "executable");
  execFixtureGit(scratch, ["add", "ordinary.test.ts", "executable.test.ts"]);
  execFixtureGit(scratch, ["update-index", "--chmod=+x", "--", "executable.test.ts"]);

  expect(loadTrackedFiles(scratch)).toMatchObject({
    status: "ready",
    value: {
      repoPaths: ["executable.test.ts", "ordinary.test.ts"],
      executablePaths: ["executable.test.ts"],
    },
    members: 2,
  });

  const promoted = createResourceHost({
    root: scratch,
    trackedFileModeOverlays: [{ path: "ordinary.test.ts", executable: true }],
  }).host.trackedFiles();
  expect(promoted).toMatchObject({
    status: "ready",
    value: {
      repoPaths: ["executable.test.ts", "ordinary.test.ts"],
      executablePaths: ["executable.test.ts", "ordinary.test.ts"],
    },
    members: 2,
    subprocess: { command: "git-index", exitStatus: 0 },
  });

  expect(
    createResourceHost({
      root: scratch,
      trackedFileModeOverlays: [{ path: "executable.test.ts", executable: false }],
    }).host.trackedFiles(),
  ).toMatchObject({
    status: "ready",
    value: { executablePaths: [] },
    members: 2,
    subprocess: { command: "git-index", exitStatus: 0 },
  });
});

test("tracked mode overlays refuse identities outside the real candidate index and duplicate ownership", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  writeFileSync(join(scratch, "tracked.test.ts"), "tracked");
  execFixtureGit(scratch, ["add", "tracked.test.ts"]);

  expect(loadTrackedFiles(scratch, [{ path: "missing.test.ts", executable: true }])).toMatchObject({
    status: "unresolved",
    reason: expect.stringContaining("not in the candidate index"),
  });
  expect(
    loadTrackedFiles(scratch, [
      { path: "tracked.test.ts", executable: true },
      { path: "tracked.test.ts", executable: false },
    ]),
  ).toMatchObject({ status: "unresolved", reason: expect.stringContaining("declared more than once") });
});
