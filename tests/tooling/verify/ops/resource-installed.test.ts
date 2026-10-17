// @orb-waive-file no-test-fabrication("base-ui"): baselined when the gate widened to value casts; burn-down item 906.

// Native installed-package loading preserves metadata/declaration reads and exact text-overlay refusals.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { loadInstalledPackage } from "../../../../tooling/src/verify/ops/resource-installed.ts";

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

test("text substitutes an exact overlay only after the real target validates", () => {
  const request = { id: "react-compiler" as const, mode: "text" as const, file: "dist/index.js" };
  const fact = loadInstalledPackage(ROOT, request, { request, source: '{"browsers":[]}\n' });

  expect(fact).toMatchObject({ status: "ready", value: { id: "react-compiler", mode: "text", file: "dist/index.js", text: '{"browsers":[]}\n' } });
});

test("text overlays cannot invent a target or cross request identities", () => {
  const missingRequest = { id: "react-compiler" as const, mode: "text" as const, file: "liveness-missing.json" };
  expect(loadInstalledPackage(ROOT, missingRequest, { request: missingRequest, source: "{}\n" }).status).toBe("unresolved");

  const request = { id: "react-compiler" as const, mode: "text" as const, file: "dist/index.js" };
  const mismatch = {
    request: { id: "react-compiler" as const, mode: "text" as const, file: "package.json" },
    source: "export const compiler = true;\n",
  };
  expect(loadInstalledPackage(ROOT, request, mismatch)).toMatchObject({ status: "unresolved", reason: expect.stringContaining("does not match") });
});

test("text cannot escape the package directory", () => {
  const fact = loadInstalledPackage(ROOT, { id: "react-compiler", mode: "text", file: "package.json/../../../../etc/hostname" });

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
