import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { z } from "zod";

const ROOT_MANIFEST = new URL("../../package.json", import.meta.url);
const REPOSITORY = fileURLToPath(new URL("../..", import.meta.url));
const manifestSchema = z.object({
  name: z.string().trim().min(1),
  private: z.boolean().optional(),
  dependencies: z.record(z.string(), z.string()).optional().default({}),
});

test("the private root accepts development ownership and rejects runtime or unreadable manifests", ({ scratch }) => {
  function assertDevelopmentRoot(path: string | URL, admittedRoot = scratch): void {
    const manifestPath = typeof path === "string" ? path : fileURLToPath(path);
    assert.ok(lstatSync(manifestPath).isFile(), "a package manifest must be an authored regular file, not a symbolic link");
    assert.equal(
      realpathSync(manifestPath),
      resolve(realpathSync(admittedRoot), relative(admittedRoot, manifestPath)),
      "a package manifest cannot traverse an authored symbolic link",
    );
    const manifest = manifestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(manifestPath))));
    assert.deepEqual(
      Object.keys(manifest.dependencies),
      [],
      "the private root has no production install; runtime dependencies belong to their workspace package",
    );
  }
  expect(() => assertDevelopmentRoot(ROOT_MANIFEST, REPOSITORY)).not.toThrow();

  {
    const path = join(scratch, "package.json");
    for (const dependencies of [{ tsx: "^4.0.0" }, { "fixture-runtime-dep": "1", another: "2" }]) {
      writeFileSync(path, JSON.stringify({ name: "orbweaver", private: true, dependencies }));
      expect(() => assertDevelopmentRoot(path)).toThrow("runtime dependencies belong to their workspace package");
    }
    for (const manifest of [
      { name: "orbweaver", private: true },
      { name: "orbweaver", private: true, dependencies: {} },
      { name: "orbweaver", private: true, devDependencies: { tsx: "^4.0.0" } },
    ]) {
      writeFileSync(path, JSON.stringify(manifest));
      assertDevelopmentRoot(path);
    }
  }
  const invalidUtf8 = join(scratch, "invalid-utf8.json");
  writeFileSync(invalidUtf8, Buffer.concat([Buffer.from('{"name":"orbweaver","note":"'), Buffer.from([0xff]), Buffer.from('"}')]));
  expect(() => assertDevelopmentRoot(invalidUtf8)).toThrow();
  const manifestTarget = join(scratch, "root-target.json");
  const manifestLink = join(scratch, "root-link.json");
  writeFileSync(manifestTarget, JSON.stringify({ name: "orbweaver", private: true }));
  symlinkSync(manifestTarget, manifestLink);
  expect(() => assertDevelopmentRoot(manifestLink)).toThrow();
  const admitted = join(scratch, "admitted");
  const external = join(scratch, "external-manifest");
  mkdirSync(join(admitted, "packages"), { recursive: true });
  mkdirSync(external);
  writeFileSync(join(external, "package.json"), JSON.stringify({ name: "orbweaver", private: true }));
  const directoryLink = join(admitted, "packages", "linked-package");
  symlinkSync(external, directoryLink, "dir");
  expect(() => assertDevelopmentRoot(join(directoryLink, "package.json"), admitted)).toThrow();
  const admittedAlias = join(scratch, "admitted-alias");
  symlinkSync(external, admittedAlias, "dir");
  expect(() => assertDevelopmentRoot(join(admittedAlias, "package.json"), admittedAlias)).not.toThrow();

  expect(() => assertDevelopmentRoot(join(scratch, "missing.json"))).toThrow("ENOENT");
  for (const source of ["", '{"name":', '{"name":"orbweaver","dependencies":{"tsx":["x"]}}', '{"name":"orbweaver","dependencies":null}', '{"private":true}']) {
    const path = join(scratch, "package.json");
    writeFileSync(path, source);
    expect(() => assertDevelopmentRoot(path), source).toThrow();
  }
});
