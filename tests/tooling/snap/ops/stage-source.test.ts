// tooling/snap/ops/stage-source — `seedStageData` reads the dev data dir in the server's own layout and
// fills the stage's. The legacy-shape control is the arm that matters: a stale reader would copy nothing
// and say nothing, and every isolated stage would boot empty.

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { DB_FILE_NAME, SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import { afterEach, vi } from "vitest";
import { stagePaths } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { seedStageData } from "../../../../tooling/src/snap/ops/stage-source.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const roots: string[] = [];
function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orb-stage-source-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function captureStdout<T>(run: () => T): { readonly stdout: string; readonly value: T } {
  let stdout = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write);
  try {
    const value = run();
    return { stdout, value };
  } finally {
    write.mockRestore();
  }
}

test("a dev data dir in the current layout: the db, both keyfiles and the assets link land in the stage's data root", () => {
  const root = freshRoot();
  const devData = join(root, "data");
  mkdirSync(join(devData, "db"), { recursive: true });
  writeFileSync(join(devData, "db", DB_FILE_NAME), "dev-db");
  writeFileSync(join(devData, "db", `${DB_FILE_NAME}-wal`), "dev-wal");
  mkdirSync(join(devData, "secrets"));
  writeFileSync(join(devData, "secrets", SECRET_FILE_NAMES.credentialsKey), "key\n");
  writeFileSync(join(devData, "secrets", SECRET_FILE_NAMES.sessionSecret), "secret\n");
  mkdirSync(join(devData, "assets", "user_x"), { recursive: true });
  const paths = stagePaths(root, SHA);

  const provenance = seedStageData(root, paths);

  expect(provenance?.copiedFrom).toBe(join(devData, "db", DB_FILE_NAME));
  expect(readFileSync(join(paths.dataDir, "db", DB_FILE_NAME), "utf-8")).toBe("dev-db");
  expect(readFileSync(join(paths.dataDir, "db", `${DB_FILE_NAME}-wal`), "utf-8")).toBe("dev-wal");
  expect(readFileSync(join(paths.secretsDir, SECRET_FILE_NAMES.credentialsKey), "utf-8")).toBe("key\n");
  expect(readFileSync(join(paths.secretsDir, SECRET_FILE_NAMES.sessionSecret), "utf-8")).toBe("secret\n");
  expect(lstatSync(paths.assetsDir).isSymbolicLink()).toBe(true);
  expect(existsSync(join(paths.assetsDir, "user_x"))).toBe(true);
  // Idempotent: a second call keeps the stage's own copy and reports no new provenance.
  writeFileSync(join(devData, "db", DB_FILE_NAME), "dev-db-changed");
  expect(seedStageData(root, paths)).toBeNull();
  expect(readFileSync(join(paths.dataDir, "db", DB_FILE_NAME), "utf-8")).toBe("dev-db");
});

test("CONTROL: a dev data dir in the legacy shape copies nothing, returns null and says so", () => {
  const root = freshRoot();
  const devData = join(root, "data");
  mkdirSync(devData, { recursive: true });
  writeFileSync(join(devData, DB_FILE_NAME), "legacy-db");
  writeFileSync(join(devData, ".credentials-key"), "key\n");
  const paths = stagePaths(root, SHA);

  const { stdout, value } = captureStdout(() => seedStageData(root, paths));

  expect(value).toBeNull();
  expect(stdout).toContain("legacy layout");
  expect(stdout).toContain(join(devData, DB_FILE_NAME));
  expect(existsSync(paths.dataDir)).toBe(false);
});

test("a checkout with no dev data dir at all seeds nothing and prints nothing", () => {
  const root = freshRoot();
  const paths = stagePaths(root, SHA);
  const { stdout, value } = captureStdout(() => seedStageData(root, paths));
  expect(value).toBeNull();
  expect(stdout).toBe("");
  expect(existsSync(paths.dataDir)).toBe(false);
});
