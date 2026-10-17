// The virtualizer memo exceptions expire when the installed compiler removes its denylist token.
import { mkdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { isStrictDescendant } from "@orb/kit/path-containment";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";

const COMPILER = "babel-plugin-react-compiler";
const BUNDLE = "dist/index.js";
const VIRTUALIZER = "@tanstack/react-virtual";
const CLIENT_PACKAGE = "packages/client/package.json";
const INSTALLED_COMPILER = `packages/client/node_modules/${COMPILER}`;
const HEALTHY_BUNDLE = `const denylist = "${VIRTUALIZER}";`;
const CLIENT_METADATA = '{"name":"@orb/client","private":true}';
const COMPILER_METADATA = JSON.stringify({ name: COMPILER, version: "1.0.0" });

function compilerContract(root: string): void {
  const manifest = createRequire(resolve(root, CLIENT_PACKAGE)).resolve(`${COMPILER}/package.json`);
  const directory = realpathSync(dirname(manifest));
  const bundle = realpathSync(join(directory, BUNDLE));
  expect(isStrictDescendant(directory, bundle, { sep }), "compiler bundle stays inside its installed package").toBe(true);
  expect(statSync(bundle).isFile(), "compiler bundle is a regular file").toBe(true);
  expect(readFileSync(bundle, "utf8"), "retire message-list/media-grid memo exceptions when this token disappears").toContain(VIRTUALIZER);
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function installation(root: string, bundle: string): void {
  write(root, CLIENT_PACKAGE, CLIENT_METADATA);
  write(root, `${INSTALLED_COMPILER}/package.json`, COMPILER_METADATA);
  write(root, `${INSTALLED_COMPILER}/${BUNDLE}`, bundle);
}

test("installed React Compiler still denylists the virtualizer used by manual-memo exceptions", ({ repoRoot }) => {
  expect(() => compilerContract(repoRoot)).not.toThrow();
});

test("a healthy installed compiler keeps the virtualizer expiry contract", ({ scratch }) => {
  installation(scratch, HEALTHY_BUNDLE);
  expect(() => compilerContract(scratch)).not.toThrow();
});

test("removing the denylist token expires the exceptions", ({ scratch }) => {
  installation(scratch, "export const compiler = true;");
  expect(() => compilerContract(scratch)).toThrow("retire message-list/media-grid");
});

test("an unavailable compiler cannot pass the expiry check", ({ scratch }) => {
  expect(() => compilerContract(scratch)).toThrow();
});

test("an unavailable bundle cannot pass the expiry check", ({ scratch }) => {
  write(scratch, CLIENT_PACKAGE, CLIENT_METADATA);
  write(scratch, `${INSTALLED_COMPILER}/package.json`, COMPILER_METADATA);
  expect(() => compilerContract(scratch)).toThrow();
});

test("a malformed installed package manifest refuses", ({ scratch }) => {
  installation(scratch, HEALTHY_BUNDLE);
  write(scratch, `${INSTALLED_COMPILER}/package.json`, "{");
  expect(() => compilerContract(scratch)).toThrow();
});

test("installed package links remain valid", ({ scratch }) => {
  const owner = join(scratch, "store-owner");
  installation(owner, HEALTHY_BUNDLE);
  write(scratch, CLIENT_PACKAGE, CLIENT_METADATA);
  mkdirSync(dirname(join(scratch, INSTALLED_COMPILER)), { recursive: true });
  symlinkSync(join(owner, INSTALLED_COMPILER), join(scratch, INSTALLED_COMPILER), "dir");
  expect(() => compilerContract(scratch)).not.toThrow();
});

test("an installed bundle link cannot escape the package", ({ scratch }) => {
  write(scratch, CLIENT_PACKAGE, CLIENT_METADATA);
  write(scratch, `${INSTALLED_COMPILER}/package.json`, COMPILER_METADATA);
  write(scratch, "outside.js", HEALTHY_BUNDLE);
  mkdirSync(dirname(join(scratch, INSTALLED_COMPILER, BUNDLE)), { recursive: true });
  symlinkSync(join(scratch, "outside.js"), join(scratch, INSTALLED_COMPILER, BUNDLE));
  expect(() => compilerContract(scratch)).toThrow("stays inside its installed package");
});

test("a directory cannot impersonate the installed bundle", ({ scratch }) => {
  write(scratch, CLIENT_PACKAGE, CLIENT_METADATA);
  write(scratch, `${INSTALLED_COMPILER}/package.json`, COMPILER_METADATA);
  mkdirSync(join(scratch, INSTALLED_COMPILER, BUNDLE), { recursive: true });
  expect(() => compilerContract(scratch)).toThrow("regular file");
});
