// @subject tests/support/node/corpus.ts
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { inspect } from "node:util";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { rethrowPrivateCorpusFailure } from "./corpus.ts";
import { test as base, expect } from "./fixtures.ts";

// Private admission refuses a CI environment; these tests run in CI, so they hand it an environment without those flags.
const LOCAL_ENVIRONMENT = inheritedProcessEnv({ ["CI"]: undefined, ["GITHUB_ACTIONS"]: undefined });
const PERMISSION_MODULUS = 0o1000;
const ARRAY_TAIL = "synthetic array tail without truncation";

const test = base.extend<{ privateRoot: string }>({
  privateRoot: async ({}, use): Promise<void> => {
    const directory = await mkdtemp(join(tmpdir(), "orb-private-failure-"));
    await using cleanup = new AsyncDisposableStack();
    cleanup.defer(() => rm(directory, { recursive: true, force: true }));
    await use(directory);
  },
});

async function artifactOf(directory: string): Promise<string> {
  const files = await readdir(directory);
  expect(files).toHaveLength(1);
  const file = files[0];
  if (file === undefined) {
    throw new Error("Private failure artifact is absent");
  }
  return join(directory, file);
}

test("privately retains native nested causes and data without changing the original rejection", async ({ privateRoot }) => {
  const nativeFailure = await readFile(join(privateRoot, "missing-native-input")).catch((error: unknown) => error);
  expect(nativeFailure).toBeInstanceOf(Error);
  let getterReads = 0;
  let customCalls = 0;
  const detail = "synthetic detail ".repeat(1000);
  const row = {
    detail,
    tail: [...Array.from({ length: 120 }, (_, index) => index), ARRAY_TAIL],
    nested: new SuppressedError(
      new Error("synthetic cleanup failure"),
      new Error("synthetic nested failure", { cause: nativeFailure }),
      "synthetic disposal failure",
    ),
  };
  Object.defineProperty(row, "unread", {
    enumerable: true,
    get: (): string => {
      getterReads += 1;
      return "accessor must remain unread";
    },
  });
  Object.defineProperty(row, inspect.custom, {
    value: (): string => {
      customCalls += 1;
      return "custom inspection must not run";
    },
  });
  const failure = new Error("synthetic private intake failed", { cause: [row] });

  await expect(rethrowPrivateCorpusFailure(privateRoot, failure, LOCAL_ENVIRONMENT)).rejects.toBe(failure);
  const artifact = await artifactOf(privateRoot);
  const text = await readFile(artifact, "utf8");
  expect(dirname(artifact)).toBe(privateRoot);
  expect((await stat(privateRoot)).mode % PERMISSION_MODULUS).toBe(0o700);
  expect((await stat(artifact)).mode % PERMISSION_MODULUS).toBe(0o600);
  expect(text).toContain("synthetic private intake failed");
  expect(text).toContain("synthetic nested failure");
  expect(text).toContain("synthetic cleanup failure");
  expect(text).toContain("synthetic disposal failure");
  expect(text).toContain("ENOENT");
  expect(text).toContain("missing-native-input");
  expect(text).toContain(detail);
  expect(text).toContain(ARRAY_TAIL);
  expect(getterReads).toBe(0);
  expect(customCalls).toBe(0);
});

test("an existing artifact is exclusive and capture refusal retains both native failure identities", async ({ privateRoot }) => {
  const first = new Error("first synthetic failure");
  await expect(rethrowPrivateCorpusFailure(privateRoot, first, LOCAL_ENVIRONMENT)).rejects.toBe(first);
  const artifact = await artifactOf(privateRoot);
  const before = await readFile(artifact);
  const original = new Error("second synthetic failure");
  const failure: unknown = await rethrowPrivateCorpusFailure(privateRoot, original, LOCAL_ENVIRONMENT).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(SuppressedError);
  if (!(failure instanceof SuppressedError)) {
    throw new Error("Capture failure did not preserve both errors");
  }
  expect(failure.suppressed).toBe(original);
  expect(failure.error).toMatchObject({ code: "EEXIST" });
  expect(await readFile(artifact)).toEqual(before);
});

test("a symlink artifact cannot redirect private evidence into an existing source", async ({ privateRoot }) => {
  const original = new Error("synthetic cause must stay private");
  await expect(rethrowPrivateCorpusFailure(privateRoot, original, LOCAL_ENVIRONMENT)).rejects.toBe(original);
  const artifact = await artifactOf(privateRoot);
  const source = join(dirname(privateRoot), `${basename(privateRoot)}-source`);
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(() => rm(source, { force: true }));
  const bytes = "synthetic original source bytes";
  await writeFile(source, bytes);
  await unlink(artifact);
  await symlink(source, artifact);
  const failure = await rethrowPrivateCorpusFailure(privateRoot, original, LOCAL_ENVIRONMENT).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(SuppressedError);
  if (!(failure instanceof SuppressedError)) {
    throw new Error("Symlink capture did not preserve original failure ownership");
  }
  expect(failure.suppressed).toBe(original);
  expect(failure.error).toBeInstanceOf(Error);
  expect(await readFile(source, "utf8")).toBe(bytes);
});

test("nonprivate and repository output roots refuse without writing evidence", async ({ privateRoot }) => {
  const original = new Error("synthetic sensitive failure");
  await chmod(privateRoot, 0o755);
  const nonprivate = await rethrowPrivateCorpusFailure(privateRoot, original, LOCAL_ENVIRONMENT).catch((error: unknown) => error);
  expect(nonprivate).toBeInstanceOf(SuppressedError);
  if (!(nonprivate instanceof SuppressedError)) {
    throw new Error("Private-mode refusal lost its original failure");
  }
  expect(nonprivate.suppressed).toBe(original);
  expect(nonprivate.error).toBeInstanceOf(Error);
  expect(await readdir(privateRoot)).toEqual([]);
  await chmod(privateRoot, 0o700);
  await mkdir(join(privateRoot, ".git"));
  const repository = await rethrowPrivateCorpusFailure(privateRoot, original, LOCAL_ENVIRONMENT).catch((error: unknown) => error);
  expect(repository).toBeInstanceOf(SuppressedError);
  if (!(repository instanceof SuppressedError)) {
    throw new Error("Repository refusal lost its original failure");
  }
  expect(repository.suppressed).toBe(original);
  expect(repository.error).toBeInstanceOf(Error);
  expect(await readdir(privateRoot)).toEqual([".git"]);
});

test("the actual public CLI wrong-input path creates no private artifact or private error output", async ({ privateRoot }) => {
  const result = await spawnNiced("pnpm", ["--config.verify-deps-before-run=false", "exec", "node", "scripts/corpus-fixture.ts", "publish"], {
    env: {
      ["npm_config_verify_deps_before_run"]: "false",
      ["PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN"]: "false",
      ["CORPUS_PRIVATE_RUN_ROOT"]: privateRoot,
    },
  });
  expect(result.code).toBe(3);
  expect(result.stdout + result.stderr).toContain("corpus-fixture requires");
  expect(result.stdout + result.stderr).not.toContain(privateRoot);
  expect(await readdir(privateRoot)).toEqual([]);
});
