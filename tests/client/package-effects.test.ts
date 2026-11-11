import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import type { PackageEffectClass } from "../../tooling/src/package-effects/index.ts";
import { assertPackageEffects, assertWorkspaceEffects, workspacePackageDirs } from "../../tooling/src/package-effects/index.ts";

const REPOSITORY = fileURLToPath(new URL("../..", import.meta.url));
const WORKSPACE_FILE = "pnpm-workspace.yaml";

test("the workspace manifests keep the sideEffects ruling, and the check refuses a package that breaks it or has no class", ({ importStagingDir }) => {
  expect(() => assertWorkspaceEffects(REPOSITORY)).not.toThrow();
  // The tree is judged only if the listing reaches the packages the ruling is about.
  expect(workspacePackageDirs(REPOSITORY)).toEqual(expect.arrayContaining(["packages/client", "packages/kit", "packages/ui", "tooling"]));

  const workspace = join(importStagingDir, "workspace");
  const classes: Readonly<Record<string, PackageEffectClass>> = {
    "packages/library": "library",
    "packages/application": "application",
    tooling: "application",
  };
  function plant(directory: string, manifest: Readonly<Record<string, unknown>>): void {
    mkdirSync(join(workspace, directory), { recursive: true });
    writeFileSync(join(workspace, directory, "package.json"), JSON.stringify({ private: true, ...manifest }));
  }
  function plantRuled(): void {
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, WORKSPACE_FILE), "packages:\n  - packages/*\n  - tooling\n");
    plant("packages/library", { name: "@orb/library", sideEffects: false });
    plant("packages/application", { name: "@orb/application" });
    plant("tooling", { name: "@orb/tooling" });
  }

  plantRuled();
  expect(() => assertWorkspaceEffects(workspace, classes)).not.toThrow();

  plant("packages/library", { name: "@orb/library" });
  expect(() => assertWorkspaceEffects(workspace, classes)).toThrow("@orb/library is a library and must declare sideEffects");
  plant("packages/library", { name: "@orb/library", sideEffects: ["**/*.css"] });
  expect(() => assertWorkspaceEffects(workspace, classes)).not.toThrow();

  for (const sideEffects of [["**/*.css"], false, true, null, {}, "", 0]) {
    plant("packages/application", { name: "@orb/application", sideEffects });
    expect(() => assertWorkspaceEffects(workspace, classes), JSON.stringify(sideEffects)).toThrow(
      "@orb/application is an application and must not declare sideEffects",
    );
  }
  plant("packages/application", { name: "@orb/application" });
  expect(() => assertWorkspaceEffects(workspace, classes)).not.toThrow();

  plant("packages/born-today", { name: "@orb/born-today", sideEffects: false });
  expect(() => assertWorkspaceEffects(workspace, classes)).toThrow("workspace package packages/born-today has no class");
  expect(() => assertWorkspaceEffects(workspace, { ...classes, "packages/born-today": "library" })).not.toThrow();
  expect(() => assertWorkspaceEffects(workspace, { ...classes, "packages/gone": "library" })).toThrow("names no workspace package: packages/gone");
});

test("a package manifest is read as an authored regular file, strict UTF-8 JSON with a name", ({ importStagingDir }) => {
  const manifest = join(importStagingDir, "package.json");
  const check = (effectClass: PackageEffectClass, path = manifest, admittedRoot = importStagingDir): void =>
    assertPackageEffects(path, effectClass, admittedRoot);

  for (const source of ["", "{", "null", "[]", '{"private":true}', '{"name":"","private":true}']) {
    writeFileSync(manifest, source);
    expect(() => check("application"), source).toThrow(/JSON|invalid_type|too_small|invalid_format/u);
  }
  expect(() => check("application", join(importStagingDir, "missing.json"))).toThrow("ENOENT");

  const invalidUtf8 = join(importStagingDir, "invalid-utf8.json");
  writeFileSync(invalidUtf8, Buffer.concat([Buffer.from('{"name":"@orb/client","note":"'), Buffer.from([0xff]), Buffer.from('"}')]));
  expect(() => check("application", invalidUtf8)).toThrow(expect.objectContaining({ code: "ERR_ENCODING_INVALID_ENCODED_DATA" }));

  const target = join(importStagingDir, "client-target.json");
  const link = join(importStagingDir, "client-link.json");
  writeFileSync(target, JSON.stringify({ name: "@orb/client", private: true }));
  expect(() => check("application", target)).not.toThrow();
  symlinkSync(target, link);
  expect(() => check("application", link)).toThrow("not a symbolic link");

  const admitted = join(importStagingDir, "admitted");
  const external = join(importStagingDir, "external-manifest");
  mkdirSync(join(admitted, "packages"), { recursive: true });
  mkdirSync(external);
  writeFileSync(join(external, "package.json"), JSON.stringify({ name: "@orb/client", private: true }));
  const directoryLink = join(admitted, "packages", "linked-package");
  symlinkSync(external, directoryLink, "dir");
  expect(() => check("application", join(directoryLink, "package.json"), admitted)).toThrow("cannot traverse an authored symbolic link");
  const admittedAlias = join(importStagingDir, "admitted-alias");
  symlinkSync(external, admittedAlias, "dir");
  expect(() => check("application", join(admittedAlias, "package.json"), admittedAlias)).not.toThrow();
});
