import type { ResourceFact } from "../../../../tooling/src/verify/contract/resource.ts";
import { DEVTOOLS_CLOSURE_ROOT, TOKEN_CONTRACT_PATHS } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import type { GateResourceRequest } from "../../../../tooling/src/verify/contract/resource-declaration.ts";
import type { LedgerId } from "../../../../tooling/src/verify/contract/resource-document.ts";
import { DOCUMENT_CATALOG_PATH, LEDGER_DEFINITIONS } from "../../../../tooling/src/verify/contract/resource-document.ts";
import { EXACT_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-exact.ts";
import type { ResourceHost } from "../../../../tooling/src/verify/contract/resource-host.ts";
import { JSON_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-json.ts";
import type { SchemaFactStatus } from "../../../../tooling/src/verify/contract/schema-fact.ts";
import { resolveResourceDeclarations } from "../../../../tooling/src/verify/lib/resource-declaration.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function fact<T>(source: string, paths: readonly string[], value: T, status: SchemaFactStatus = "ready"): ResourceFact<T> {
  const receipt = { source, status, paths, members: paths.length, durationMs: 0 };
  return status === "ready"
    ? { status, value, paths, members: paths.length, receipt }
    : { status, reason: `${source} ${status}`, paths, members: paths.length, receipt };
}

function host(overrides: Partial<ResourceHost> = {}): ResourceHost {
  return {
    authoredTree: (id) => fact(`authored-tree:${id}`, ["tooling/src/z.ts", "tooling/src/a.ts"], []),
    authoredCss: () => fact("authored-css", ["packages/ui/src/z.css", "packages/client/src/a.css"], []),
    productCss: () => fact("product-css", ["packages/ui/src/theme.css"], []),
    cssInventory: (request) =>
      fact(`css-inventory:${request}`, ["packages/ui/src/theme.css"], {
        files: [{ path: "packages/ui/src/theme.css", text: "", rules: [], atRules: [], statements: [] }],
        declarations: [],
        selectors: [],
        selectorHooks: [],
        statements: [],
        customPropertyDefinitions: [],
        customPropertyReferences: [],
        population: {
          files: 1,
          rules: 0,
          declarations: 0,
          selectors: 0,
          selectorHooks: 0,
          statements: 0,
          customPropertyDefinitions: 0,
          customPropertyReferences: 0,
        },
      }),
    packageMetadata: (id) =>
      fact(`package:${id}`, [id === "root" ? "package.json" : `${id}/package.json`], {
        id,
        path: "package.json",
        name: "fixture",
        private: true,
        scripts: {},
        dependencies: { runtime: {}, development: {}, peer: {}, optional: {} },
        exports: {},
      }),
    staticConfig: (id) => fact(`static-config:${id}`, [`${id}.config.ts`], { id, path: `${id}.config.ts`, rows: [{ key: "include", value: "src", line: 1 }] }),
    nativeConfig: (): never => {
      throw new Error("native config requires an explicit fixture");
    },
    trackedFiles: () => fact("tracked-files", ["z.ts", "a.ts"], { repoPaths: ["z.ts", "a.ts"] }),
    candidateIndexDelta: () => fact("candidate-index-delta", [], { files: [] }),
    json: (id) => fact(`json:${id}`, [JSON_RESOURCE_PATHS[id]], { id, path: JSON_RESOURCE_PATHS[id], value: {} }),
    // The three UNPOPULATED doors. Each returns a ready fact with ZERO paths, which is the exact shape the
    // planning resolver would otherwise refuse as "an empty fact".
    installedPackage: (request) =>
      fact(`installed-package:${request.id}:${request.mode}`, [], {
        id: request.id,
        mode: "metadata",
        name: "x",
        version: "1",
        directory: null,
        exportKeys: [],
      }),
    mirrorIndex: (id) =>
      fact(`mirror-index:${id}`, ["packages/server/src/a.ts", "tests/server/a.test.ts"], {
        family: id,
        sourceRoot: "packages",
        testRoot: "tests",
        sourceFiles: new Set(["packages/server/src/a.ts"]),
        sourceDirectories: new Set(["packages/server/src"]),
        testFiles: new Set(["tests/server/a.test.ts"]),
        testsByDirectory: new Map([["tests/server", ["tests/server/a.test.ts"]]]),
      }),
    documents: () => fact("documents", ["docs/Mission.md", DOCUMENT_CATALOG_PATH], { documents: [], refusals: [], catalogMisses: [] }),
    ledger: ((id: LedgerId) => {
      const definition = LEDGER_DEFINITIONS[id];
      return fact(`ledger:${id}`, definition.paths, { id, nature: "markdown", documents: [] });
    }) as ResourceHost["ledger"],
    exactFiles: (ids) =>
      fact(
        `exact-file:${ids.join(",")}`,
        ids.map((id) => EXACT_RESOURCE_PATHS[id]),
        new Map(ids.map((id) => [id, { id, path: EXACT_RESOURCE_PATHS[id], text: "", bytes: 0, lines: 1 }] as const)),
      ),
    vendorCssSurface: () =>
      fact("vendor-css-surface", [], {
        packageVersion: "1.7.0",
        declarationFiles: [],
        selectorSources: [],
      }),
    tokenContract: () =>
      fact("token-contract", [TOKEN_CONTRACT_PATHS.base], {
        texts: { base: "", light: "", mocha: "", resolver: "", removed: "", formatSchema: "", resolverSchema: "" },
        paths: [TOKEN_CONTRACT_PATHS.base],
        removalBaseline: { status: "empty", reason: "fixture host" },
      }),
    devtoolsClosure: () =>
      fact("devtools-closure", [`${DEVTOOLS_CLOSURE_ROOT}/pin.json`], {
        root: DEVTOOLS_CLOSURE_ROOT,
        pinText: "",
        manifestText: "",
        licensesText: "",
        files: [],
        totalBytes: 0,
      }),
    authoredPaths: () => fact("authored-path", [], { identities: [] }),
    authoredText: () => fact("authored-text", [], { files: [], refusals: [] }),
    ...overrides,
  };
}

test("resolves closed requests to one exact sorted path set", () => {
  const requests: readonly GateResourceRequest[] = [{ kind: "tracked-files" }, { kind: "authored-tree", id: "tooling-slot" }];
  expect(resolveResourceDeclarations(host(), requests)).toEqual(["a.ts", "tooling/src/a.ts", "tooling/src/z.ts", "z.ts"]);
});

test("an UNPOPULATED declaration contributes no path and is not refused as an empty fact", () => {
  // The three unpopulated kinds each return a ready fact with zero paths. Without the named partition in
  // `resolveResourceDeclarations` every one of them throws "resolved an empty fact" — and a lane that
  // "fixed" that by weakening the rule for ALL kinds would silently un-arm the empty-population refusal
  // that every populated door depends on.
  const requests: readonly GateResourceRequest[] = [
    { kind: "authored-tree", id: "docs" },
    { kind: "authored-path" },
    { kind: "authored-text" },
    { kind: "installed-package", id: "base-ui", mode: "metadata" },
  ];
  expect(resolveResourceDeclarations(host({ authoredTree: (id) => fact(`authored-tree:${id}`, ["docs/a.md"], []) }), requests)).toEqual(["docs/a.md"]);
});

test("the demand doors are never ACQUIRED during planning — their host methods are not called", () => {
  // The partition must skip them, not call them with an empty subject: a demand door handed nothing would
  // answer "zero selectors, zero refusals", which reads as a clean corpus.
  let calls = 0;
  const counting = host({
    authoredPaths: () => {
      calls += 1;
      return fact("authored-path", [], { identities: [] });
    },
    authoredText: () => {
      calls += 1;
      return fact("authored-text", [], { files: [], refusals: [] });
    },
  });
  expect(resolveResourceDeclarations(counting, [{ kind: "tracked-files" }, { kind: "authored-path" }, { kind: "authored-text" }])).toEqual(["a.ts", "z.ts"]);
  expect(calls).toBe(0);
});

test.each(["missing", "empty", "unresolved"] as const)("refuses a %s declared fact", (status) => {
  expect(() =>
    resolveResourceDeclarations(host({ productCss: () => fact("product-css", status === "empty" ? [] : ["packages/ui/src/theme.css"], [], status) }), [
      { kind: "product-css" },
    ]),
  ).toThrow(new RegExp(status));
});

test("refuses duplicate requests and paths outside repo-relative resource identity", () => {
  expect(() => resolveResourceDeclarations(host(), [{ kind: "tracked-files" }, { kind: "tracked-files" }])).toThrow(/duplicate/i);
  expect(() =>
    resolveResourceDeclarations(host({ trackedFiles: () => fact("tracked-files", ["../outside.ts"], { repoPaths: ["../outside.ts"] }) }), [
      { kind: "tracked-files" },
    ]),
  ).toThrow(/repo-relative|invalid segment/i);
});

test("refuses a valid repo path returned by the wrong closed fact root", () => {
  expect(() =>
    resolveResourceDeclarations(host({ authoredTree: (id) => fact(`authored-tree:${id}`, ["packages/ui/src/foreign.ts"], []) }), [
      { kind: "authored-tree", id: "tooling-slot" },
    ]),
  ).toThrow(/cross-root/i);
});
