// The working-tree guard (docs/work/0062) over a throwaway fixture repository — never over the real
// checkout running this suite. `git-fixture.ts` isolates every fixture Git call from the checkout's own
// hooks and config, so a bug here can plant into `scratch` at worst.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { captureWorkingTree, diffWorkingTree } from "@orb/tooling/_shared/working-tree-guard";
import { expect, test } from "../../support/tool-fixtures.ts";

/** A committed, clean fixture repository — `captureWorkingTree` over it starts from an empty dirty-list. */
async function cleanFixtureRepo(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  execFixtureGit(root, ["init", "--quiet"]);
  await writeFile(join(root, "tracked.txt"), "committed content\n", "utf8");
  execFixtureGit(root, ["-c", "user.email=fixture@example.test", "-c", "user.name=fixture", "add", "tracked.txt"]);
  execFixtureGit(root, ["-c", "user.email=fixture@example.test", "-c", "user.name=fixture", "commit", "--quiet", "-m", "seed"]);
}

test("a run that adds a file inside the guarded root turns the diff red, naming the file", async ({ scratch }) => {
  const root = join(scratch, "fixture");
  await cleanFixtureRepo(root);
  const before = captureWorkingTree(root);

  await writeFile(join(root, "planted.txt"), "a test wrote this straight into the tree\n", "utf8");

  expect(diffWorkingTree(root, before)).toEqual(["added: planted.txt"]);
});

test("a run that only writes into its own mkdtemp directory stays green", async ({ scratch }) => {
  const root = join(scratch, "fixture");
  await cleanFixtureRepo(root);
  const before = captureWorkingTree(root);

  const elsewhere = join(scratch, "elsewhere");
  await mkdir(elsewhere, { recursive: true });
  await writeFile(join(elsewhere, "planted.txt"), "a test wrote this into its OWN temp dir\n", "utf8");

  expect(diffWorkingTree(root, before)).toEqual([]);
});

test("a run that modifies an already-dirty file further is still caught by its content hash", async ({ scratch }) => {
  const root = join(scratch, "fixture");
  await cleanFixtureRepo(root);
  await writeFile(join(root, "tracked.txt"), "already dirty before setup\n", "utf8");
  const before = captureWorkingTree(root);

  await writeFile(join(root, "tracked.txt"), "changed again during the run\n", "utf8");

  expect(diffWorkingTree(root, before)).toEqual(["changed: tracked.txt"]);
});

test("a run that removes a file that was dirty at setup is caught", async ({ scratch }) => {
  const root = join(scratch, "fixture");
  await cleanFixtureRepo(root);
  await writeFile(join(root, "untracked.txt"), "will be deleted\n", "utf8");
  const before = captureWorkingTree(root);

  execFixtureGit(root, ["clean", "-fq", "--", "untracked.txt"]);

  expect(diffWorkingTree(root, before)).toEqual(["removed: untracked.txt"]);
});

test("the sanctioned real-tree planter's __g_/__dc_ sentinel shape is exempt", async ({ scratch }) => {
  const root = join(scratch, "fixture");
  await cleanFixtureRepo(root);
  const before = captureWorkingTree(root);

  await writeFile(join(root, "__g_struct.probe.json"), "{}", "utf8");
  await mkdir(join(root, "packages", "__dc_probe"), { recursive: true });
  await writeFile(join(root, "packages", "__dc_probe", "index.ts"), "export {};\n", "utf8");

  expect(diffWorkingTree(root, before)).toEqual([]);
});
