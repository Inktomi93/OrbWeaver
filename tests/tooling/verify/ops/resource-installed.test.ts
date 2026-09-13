// The installed-package door — ONE kind, three receipted modes (owner ruling 2026-09-11, guide §4).
//
// These arms read THE REAL INSTALLED TREE on purpose. Every one of the four ids is reached through a pnpm
// symlink into the content-addressed store, which is precisely why the authored `ResourceReader` cannot
// serve them ("authored resource traverses a symbolic link") and why a temp-root fixture would prove the
// wrong thing: a hand-built `node_modules` does not reproduce the store indirection that breaks the naive
// implementation. The refusal arms use a scratch root, where nothing resolves.
import { loadInstalledPackage } from "../../../../tooling/src/verify/ops/resource-installed.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
const SEMVER_RE = /^\d+\.\d+\.\d+/u;

test("metadata resolves a package reached only through a pnpm store symlink", () => {
  const fact = loadInstalledPackage(ROOT, { id: "base-ui", mode: "metadata" });

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready" || fact.value.mode !== "metadata") {
    throw new Error(`base-ui metadata refused: ${fact.status === "ready" ? "wrong mode" : fact.reason}`);
  }
  expect(fact.value.name).toBe("@base-ui/react");
  expect(fact.value.version).toMatch(SEMVER_RE);
  // MEASURED, not assumed: pnpm's store for this repository lives at `node_modules/.pnpm/**` INSIDE the
  // checkout, so `directory` is a real repo-relative path — and it is the STORE path, never the
  // `packages/ui/node_modules/@base-ui/react` symlink the importer sees. `null` is reserved for an install
  // genuinely outside the repository (a global or hoisted store), which this tree does not have.
  expect(fact.value.directory).toMatch(/^node_modules\/\.pnpm\/@base-ui\+react@/u);
  // An unpopulated door publishes no authored paths: a store path belongs to no policy's population.
  expect(fact.paths).toEqual([]);
});

test("a CHAINED id resolves from its sibling's manifest, which the repo root cannot reach", () => {
  // Measured 2026-09-11: `createRequire(<repo>/package.json).resolve("playwright-core/package.json")` is
  // MODULE_NOT_FOUND — playwright-core is reachable only from the resolved `@playwright/test` manifest.
  // `via` exists for this one real case, not as speculative generality.
  const fact = loadInstalledPackage(ROOT, { id: "playwright-core", mode: "metadata" });

  expect(fact.status).toBe("ready");
  expect(fact.status === "ready" && fact.value.mode === "metadata" ? fact.value.name : "").toBe("playwright-core");
});

test("text reads a file the package's own exports map REFUSES to resolve", () => {
  // `playwright-core/browsers.json` is ERR_PACKAGE_PATH_NOT_EXPORTED through node's resolver. An exports
  // map is a contract with a package's IMPORTERS; this door observes, so it joins the file to the resolved
  // package directory instead. Without that distinction this mode serves nothing at all.
  const fact = loadInstalledPackage(ROOT, { id: "playwright-core", mode: "text", file: "browsers.json" });

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready" || fact.value.mode !== "text") {
    throw new Error(`playwright-core text refused: ${fact.status === "ready" ? "wrong mode" : fact.reason}`);
  }
  expect(fact.value.file).toBe("browsers.json");
  expect(JSON.parse(fact.value.text)).toHaveProperty("browsers");
});

test("text cannot escape the package directory", () => {
  const fact = loadInstalledPackage(ROOT, { id: "playwright-core", mode: "text", file: "package.json/../../../../etc/hostname" });

  // The path identity rule refuses the traversal before the read; a door that reads one named file must not
  // become a door that reads any file on the box.
  expect(fact.status).toBe("unresolved");
});

test("ast enumerates the installed declaration surface and counts it as members", () => {
  const fact = loadInstalledPackage(ROOT, { id: "base-ui", mode: "ast" });

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready" || fact.value.mode !== "ast") {
    throw new Error(`base-ui ast refused: ${fact.status === "ready" ? "wrong mode" : fact.reason}`);
  }
  expect(fact.value.declarationPaths.length).toBeGreaterThan(0);
  expect(fact.value.declarationPaths.every((path) => path.endsWith(".d.ts"))).toBe(true);
  expect(fact.members).toBe(fact.value.declarationPaths.length);
});

test("an UNINSTALLED package is MISSING, not unresolved", ({ scratch }) => {
  // "run pnpm install" and "the reader is broken" are two different instructions, and a worktree that
  // skipped bootstrap hits the first every time.
  const fact = loadInstalledPackage(scratch, { id: "base-ui", mode: "metadata" });

  expect(fact.status).toBe("missing");
  expect(fact.status === "missing" ? fact.reason : "").toContain("not resolvable");
});

test("an unknown id refuses instead of resolving", () => {
  const fact = loadInstalledPackage(ROOT, { id: "not-installed-here" as "base-ui", mode: "metadata" });

  expect(fact.status).toBe("unresolved");
});
