import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execNicedSync } from "@orb/tooling/_shared/proc";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { loadTrackedFiles } from "../../../../tooling/src/verify/ops/resource-tracked.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("Git failure is unresolved, while a valid empty index is empty", ({ scratch }) => {
  expect(loadTrackedFiles(scratch)).toMatchObject({ status: "unresolved", subprocess: { exitStatus: 128 } });
  execNicedSync("git", ["init", "--quiet", scratch]);
  expect(loadTrackedFiles(scratch)).toMatchObject({ status: "empty", subprocess: { exitStatus: 0 }, members: 0 });
});

test("tracked inventory excludes untracked and overlay files and snapshots once per invocation", ({ scratch }) => {
  execNicedSync("git", ["init", "--quiet", scratch]);
  writeFileSync(join(scratch, "tracked file.ts"), "tracked");
  writeFileSync(join(scratch, "untracked.ts"), "untracked");
  execNicedSync("git", ["-C", scratch, "add", "tracked file.ts"]);
  const invocation = createResourceHost({ root: scratch, overlay: { "virtual.ts": "virtual", "tracked file.ts": null } });
  const first = invocation.host.trackedFiles();
  expect(first).toMatchObject({ status: "ready", value: { repoPaths: ["tracked file.ts"] }, members: 1, subprocess: { command: "git-index", exitStatus: 0 } });
  execNicedSync("git", ["-C", scratch, "add", "untracked.ts"]);
  expect(invocation.host.trackedFiles()).toBe(first);
  expect(invocation.receipts()).toHaveLength(1);
  expect(createResourceHost({ root: scratch }).host.trackedFiles()).toMatchObject({ status: "ready", members: 2 });
});
