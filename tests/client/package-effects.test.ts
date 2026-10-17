import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { z } from "zod";

const CLIENT = new URL("../../packages/client/package.json", import.meta.url);
const REPOSITORY = fileURLToPath(new URL("../..", import.meta.url));
const manifestSchema = z.object({ name: z.string().trim().min(1), private: z.boolean().optional(), sideEffects: z.json().optional() });

test("the client manifest preserves application effects and rejects every invalid field/input", ({ importStagingDir }) => {
  function assertClientManifest(path: string | URL, admittedRoot = importStagingDir): void {
    const manifestPath = typeof path === "string" ? path : fileURLToPath(path);
    assert.ok(lstatSync(manifestPath).isFile(), "a package manifest must be an authored regular file, not a symbolic link");
    assert.equal(
      realpathSync(manifestPath),
      resolve(realpathSync(admittedRoot), relative(admittedRoot, manifestPath)),
      "a package manifest cannot traverse an authored symbolic link",
    );
    const manifest = manifestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(manifestPath))));
    assert.equal(Object.hasOwn(manifest, "sideEffects"), false, "the client manifest must not declare sideEffects, regardless of its value");
  }
  expect(() => assertClientManifest(CLIENT, REPOSITORY)).not.toThrow();

  {
    const client = join(importStagingDir, "client.json");
    const library = join(importStagingDir, "ui.json");
    writeFileSync(library, JSON.stringify({ name: "@orb/ui", sideEffects: ["**/*.css"] }));
    for (const sideEffects of [["**/*.css"], false, true, null, {}, "", 0]) {
      writeFileSync(client, JSON.stringify({ name: "@orb/client", sideEffects }));
      expect(() => assertClientManifest(client)).toThrow("must not declare sideEffects");
    }
    for (const manifest of [
      { name: "@orb/client", private: true, exports: { ".": "./src/index.ts" } },
      { name: "@orb/client", private: true },
    ]) {
      writeFileSync(client, JSON.stringify(manifest));
      assertClientManifest(client);
    }
  }
  const invalidUtf8 = join(importStagingDir, "invalid-utf8.json");
  writeFileSync(invalidUtf8, Buffer.concat([Buffer.from('{"name":"@orb/client","note":"'), Buffer.from([0xff]), Buffer.from('"}')]));
  expect(() => assertClientManifest(invalidUtf8)).toThrow();
  const manifestTarget = join(importStagingDir, "client-target.json");
  const manifestLink = join(importStagingDir, "client-link.json");
  writeFileSync(manifestTarget, JSON.stringify({ name: "@orb/client", private: true }));
  symlinkSync(manifestTarget, manifestLink);
  expect(() => assertClientManifest(manifestLink)).toThrow();
  const admitted = join(importStagingDir, "admitted");
  const external = join(importStagingDir, "external-manifest");
  mkdirSync(join(admitted, "packages"), { recursive: true });
  mkdirSync(external);
  writeFileSync(join(external, "package.json"), JSON.stringify({ name: "@orb/client", private: true }));
  const directoryLink = join(admitted, "packages", "linked-package");
  symlinkSync(external, directoryLink, "dir");
  expect(() => assertClientManifest(join(directoryLink, "package.json"), admitted)).toThrow();
  const admittedAlias = join(importStagingDir, "admitted-alias");
  symlinkSync(external, admittedAlias, "dir");
  expect(() => assertClientManifest(join(admittedAlias, "package.json"), admittedAlias)).not.toThrow();

  expect(() => assertClientManifest(join(importStagingDir, "missing.json"))).toThrow("ENOENT");
  for (const source of ["", "{", "null", "[]", '{"private":true}', '{"name":"","private":true}']) {
    const path = join(importStagingDir, "client.json");
    writeFileSync(path, source);
    expect(() => assertClientManifest(path), source).toThrow();
  }
});
