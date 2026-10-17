// The installed Base UI surface, its adjudications, and the actual @orb/ui seals must agree.
import { lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { getWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import type { InstalledSurface, SurfaceManifest } from "@orb/tooling/verify";
import {
  BASE_UI_MANIFEST_REL,
  BASE_UI_PKG_REL,
  baseUiBindings,
  blindParts,
  readInstalledSurface,
  readManifest,
  renderedPartsByComponent,
  resetBaseUiSurfaceCache,
  truncatedParts,
} from "@orb/tooling/verify";
import type { SourceFile } from "ts-morph";
import { afterEach } from "vitest";
import { z } from "zod";

function ledger(root: string): SurfaceManifest {
  const canonicalRoot = realpathSync(root);
  let path = canonicalRoot;
  for (const segment of BASE_UI_MANIFEST_REL.split("/")) {
    path = join(path, segment);
    expect(lstatSync(path).isSymbolicLink(), `authored ledger path ${path}`).toBe(false);
  }
  new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  const manifest = readManifest(canonicalRoot);
  if (manifest === undefined) {
    throw new Error("Base UI ledger is absent or malformed");
  }
  return manifest;
}

function installed(root: string): InstalledSurface {
  z.object({ name: z.string().min(1), version: z.string().min(1) }).parse(JSON.parse(readFileSync(join(root, BASE_UI_PKG_REL, "package.json"), "utf8")));
  const surface = readInstalledSurface(root);
  if (surface === undefined) {
    throw new Error("Base UI package is absent");
  }
  expect(Object.keys(surface.components)).not.toEqual([]);
  expect(surface.version).not.toBe("");
  return surface;
}

function surfaceContract(manifest: SurfaceManifest, surface: InstalledSurface): void {
  expect(Object.keys(manifest.components)).not.toEqual([]);
  expect(blindParts(manifest)).toEqual([]);
  expect(truncatedParts(manifest)).toEqual([]);
  const components = Object.fromEntries(
    Object.entries(manifest.components).map(([name, component]) => [
      name,
      {
        ...component,
        parts: Object.fromEntries(
          Object.entries(component.parts).map(([partName, { disposition, why, ...shape }]) => {
            expect(disposition, `${name}.${partName}`).not.toBe("unresolved");
            expect(disposition === "exposed" || why.trim().length > 0, `${name}.${partName} reason`).toBe(true);
            return [partName, shape];
          }),
        ),
      },
    ]),
  );
  expect({ version: manifest.version, components }).toEqual(surface);
}

function uiSources(root: string): readonly SourceFile[] {
  return getWorkspace({ root, types: false, globs: [`${root}/packages/ui/src/**/*.ts`, `${root}/packages/ui/src/**/*.tsx`] }).getSourceFiles();
}

function anatomyContract(manifest: SurfaceManifest, files: readonly SourceFile[]): void {
  expect(
    files.some((file) => baseUiBindings(file).some(({ typeOnly }) => !typeOnly)),
    "nonempty value-import census",
  ).toBe(true);
  const rendered = renderedPartsByComponent(files, manifest);
  const exposed = new Set<string>();
  const actual = new Set<string>();
  for (const [name, component] of Object.entries(manifest.components)) {
    for (const [partName, part] of Object.entries(component.parts)) {
      if (part.kind !== "part" || part.disposition === "unresolved") {
        continue;
      }
      const key = `${name}.${partName}`;
      if (part.disposition === "exposed") {
        exposed.add(key);
      }
      if (rendered.get(name)?.has(partName) === true) {
        actual.add(key);
      }
    }
  }
  expect(actual).toEqual(exposed);
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function writeDeclarations(root: string): void {
  write(root, `${BASE_UI_PKG_REL}/select/index.d.ts`, 'export * as Select from "./index.parts.js";');
  write(root, `${BASE_UI_PKG_REL}/select/index.parts.d.ts`, 'export { SelectRoot as Root } from "./root/SelectRoot.js";');
  write(root, `${BASE_UI_PKG_REL}/select/root/SelectRoot.d.ts`, "export interface SelectRootProps { items?: string[] }");
}

const PART = {
  kind: "part",
  symbol: "SelectRoot",
  from: "./root/SelectRoot.js",
  props: ["items", "onValueChange"],
  handlers: { onValueChange: 2 },
  state: ["open"],
  inherits: [],
} as const;
const COMPONENT = { module: "@base-ui/react/select", namespaced: true, parts: { ["Root"]: { ...PART, disposition: "exposed", why: "" } } } as const;
const MANIFEST = { version: "9.9.9", components: { ["Select"]: COMPONENT } } satisfies SurfaceManifest;
const SURFACE = { version: MANIFEST.version, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: PART } } } } satisfies InstalledSurface;
const SEAL = 'import {Select as Base} from "@base-ui/react/select"; export const Seal=()=> <Base.Root/>;';
const SEAL_PATH = "packages/ui/src/primitives/select/seal.tsx";

afterEach(() => resetBaseUiSurfaceCache());

test("the installed package and committed adjudications agree with the complete public surface", ({ repoRoot }) => {
  expect(() => surfaceContract(ledger(repoRoot), installed(repoRoot))).not.toThrow();
});

test("the production @orb/ui seals render exactly the adjudicated anatomy", ({ repoRoot }) => {
  expect(() => anatomyContract(ledger(repoRoot), uiSources(repoRoot))).not.toThrow();
});

for (const [name, changed] of [
  ["version", { ...SURFACE, version: "10.0.0" }],
  ["component appeared", { ...SURFACE, components: { ...SURFACE.components, ["Added"]: SURFACE.components.Select } }],
  ["component vanished", { ...SURFACE, components: {} }],
  ["part appeared", { ...SURFACE, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: PART, ["Added"]: PART } } } }],
  ["part vanished", { ...SURFACE, components: { ["Select"]: { ...COMPONENT, parts: {} } } }],
  ...Object.entries({
    kind: "hook",
    symbol: "Replacement",
    from: "./replacement.js",
    props: ["changed"],
    handlers: { onValueChange: 1 },
    state: ["changed"],
    inherits: ["Changed"],
  }).map(([field, value]) => [field, { ...SURFACE, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: { ...PART, [field]: value } } } } }] as const),
  ["module", { ...SURFACE, components: { ["Select"]: { ...COMPONENT, module: "@base-ui/react/other", parts: { ["Root"]: PART } } } }],
  ["namespace", { ...SURFACE, components: { ["Select"]: { ...COMPONENT, namespaced: false, parts: { ["Root"]: PART } } } }],
] as const) {
  test(`surface drift refuses ${name}`, () => {
    expect(() => surfaceContract(MANIFEST, changed)).toThrow();
  });
}

test("the agreeing synthetic surface is accepted", () => {
  expect(() => surfaceContract(MANIFEST, SURFACE)).not.toThrow();
});

test("removing a real component or its real seal trips the contract", ({ repoRoot }) => {
  const manifest = ledger(repoRoot);
  const { Select, ...remaining } = manifest.components;
  expect(Select).toBeDefined();
  expect(() => surfaceContract({ ...manifest, components: remaining }, installed(repoRoot))).toThrow();
  const files = uiSources(repoRoot);
  expect(() =>
    anatomyContract(
      manifest,
      files.filter((file) => !file.getFilePath().includes("/primitives/select/")),
    ),
  ).toThrow();
});

for (const [name, part] of [
  ["unresolved", { ...PART, disposition: "unresolved", why: "" }],
  ["unreasoned omission", { ...PART, disposition: "sealed-away", why: " \n " }],
  ["blind", { ...PART, props: [], handlers: {}, disposition: "exposed", why: "" }],
  ["truncated", { ...PART, inherits: ["TRUNCATED:Props"], disposition: "exposed", why: "" }],
] as const) {
  test(`adjudication refuses ${name}`, () => {
    const manifest = { ...MANIFEST, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: part } } } };
    const shape = { ...PART, props: part.props, handlers: part.handlers, inherits: part.inherits };
    expect(() => surfaceContract(manifest, { ...SURFACE, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: shape } } } })).toThrow();
  });
}

test("reasoned omissions and non-anatomy exports do not invent render obligations", ({ scratch }) => {
  write(scratch, SEAL_PATH, SEAL);
  const manifest: SurfaceManifest = {
    ...MANIFEST,
    components: {
      ["Select"]: {
        ...COMPONENT,
        parts: {
          ["Root"]: COMPONENT.parts.Root,
          ["Omitted"]: { ...PART, disposition: "n-a", why: "No seal consumes this part." },
          ["Hook"]: { ...PART, kind: "hook", disposition: "exposed", why: "" },
          ["Type"]: { ...PART, kind: "type", disposition: "exposed", why: "" },
        },
      },
    },
  };
  expect(() => anatomyContract(manifest, uiSources(scratch))).not.toThrow();
});

for (const [name, source] of [
  ["removed render", 'import {Select as Base} from "@base-ui/react/select"; export const Seal=()=>null;'],
  ["type-only declaration", 'import type {Select as Base} from "@base-ui/react/select"; export const Seal=()=> <Base.Root/>;'],
  ["type-only specifier", 'import {type Select as Base} from "@base-ui/react/select"; export const Seal=()=> <Base.Root/>;'],
  ["comment import", '// import {Select as Base} from "@base-ui/react/select";\nexport const Seal=()=>null;'],
  ["indirect JSX declared limit", 'import {Select as Base} from "@base-ui/react/select"; const Root=Base.Root; export const Seal=()=> <Root/>;'],
] as const) {
  test(`anatomy rejects ${name}`, ({ scratch }) => {
    write(scratch, SEAL_PATH, source);
    expect(() => anatomyContract(MANIFEST, uiSources(scratch))).toThrow();
  });
}

test("anatomy rejects a rendered sealed-away part and ignores unresolved rulings owned by the surface contract", ({ scratch }) => {
  write(scratch, SEAL_PATH, SEAL);
  for (const disposition of ["sealed-away", "n-a"] as const) {
    const manifest = { ...MANIFEST, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: { ...PART, disposition, why: "Deliberately omitted." } } } } };
    expect(() => anatomyContract(manifest, uiSources(scratch))).toThrow();
  }
  expect(() =>
    anatomyContract(
      { ...MANIFEST, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: { ...PART, disposition: "unresolved", why: "" } } } } },
      uiSources(scratch),
    ),
  ).not.toThrow();
});

test("alias imports, paired JSX, and flat components retain their actual render identities", ({ scratch }) => {
  write(scratch, SEAL_PATH, SEAL.replace("<Base.Root/>", "<Base.Root></Base.Root>"));
  expect(() => anatomyContract(MANIFEST, uiSources(scratch))).not.toThrow();
  write(scratch, SEAL_PATH, 'import {Button as Renamed} from "@base-ui/react/button"; export const Seal=()=> <Renamed/>;');
  expect(() =>
    anatomyContract(
      { ...MANIFEST, components: { ["Button"]: { module: "@base-ui/react/button", namespaced: false, parts: { ["Button"]: COMPONENT.parts.Root } } } },
      uiSources(scratch),
    ),
  ).not.toThrow();
});

test("a sibling package cannot satisfy the UI seal census", ({ scratch }) => {
  write(scratch, "packages/client/src/not-a-seal.tsx", SEAL);
  expect(() => anatomyContract(MANIFEST, uiSources(scratch))).toThrow();
});

for (const [name, text] of [
  ["missing", undefined],
  ["empty", ""],
  ["unparseable", "{"],
  ["wrong shape", "{}"],
] as const) {
  test(`the ${name} ledger cannot pass as an empty contract`, ({ scratch }) => {
    if (text !== undefined) {
      write(scratch, BASE_UI_MANIFEST_REL, text);
    }
    expect(() => ledger(scratch)).toThrow();
  });
}

test("missing packages and missing versions refuse", ({ scratch }) => {
  expect(() => installed(scratch)).toThrow();
  writeDeclarations(scratch);
  write(scratch, `${BASE_UI_PKG_REL}/package.json`, '{"name":"@base-ui/react"}');
  expect(() => installed(scratch)).toThrow();
});

test("a package without declarations cannot pass as an empty contract", ({ scratch }) => {
  resetBaseUiSurfaceCache();
  write(scratch, `${BASE_UI_PKG_REL}/package.json`, '{"name":"@base-ui/react","version":"9.9.9"}');
  expect(() => installed(scratch)).toThrow();
});

test("an invalid UTF8 byte inside an otherwise valid omission reason refuses", ({ scratch }) => {
  const manifest = { ...MANIFEST, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: { ...PART, disposition: "sealed-away", why: "valid" } } } } };
  const json = JSON.stringify(manifest);
  const index = json.indexOf("valid");
  write(scratch, BASE_UI_MANIFEST_REL, json);
  writeFileSync(
    join(scratch, BASE_UI_MANIFEST_REL),
    Buffer.concat([Buffer.from(json.slice(0, index)), Buffer.from([255]), Buffer.from(json.slice(index + 1))]),
  );
  expect(() => ledger(scratch)).toThrow();
});

for (const ancestor of [false, true]) {
  test(`a valid ledger behind an authored ${ancestor ? "ancestor" : "final"} link refuses`, ({ scratch }) => {
    const targetDirectory = join(scratch, "actual-ledger");
    const target = join(targetDirectory, "baseui-surface.manifest.json");
    write(scratch, "actual-ledger/baseui-surface.manifest.json", JSON.stringify(MANIFEST));
    const path = ancestor ? dirname(join(scratch, BASE_UI_MANIFEST_REL)) : join(scratch, BASE_UI_MANIFEST_REL);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(ancestor ? targetDirectory : target, path, ancestor ? "dir" : "file");
    expect(() => ledger(scratch)).toThrow();
  });
}

test("an admitted repository-root alias is not an authored descendant link", ({ scratch }) => {
  write(scratch, BASE_UI_MANIFEST_REL, JSON.stringify(MANIFEST));
  const alias = join(scratch, "root-alias");
  symlinkSync(scratch, alias, "dir");
  expect(ledger(alias)).toEqual(MANIFEST);
});

for (const metadata of [{ version: "9.9.9" }, { name: "", version: "9.9.9" }, { name: "@base-ui/react", version: 9 }]) {
  test(`an installed package with invalid metadata refuses ${JSON.stringify(metadata)}`, ({ scratch }) => {
    writeDeclarations(scratch);
    write(scratch, `${BASE_UI_PKG_REL}/package.json`, JSON.stringify(metadata));
    expect(() => installed(scratch)).toThrow();
  });
}

test("a valid installed package may be reached through a pnpm-style link", ({ scratch }) => {
  const owner = join(scratch, "installed-owner");
  writeDeclarations(owner);
  write(owner, `${BASE_UI_PKG_REL}/package.json`, '{"name":"@base-ui/react","version":"9.9.9"}');
  mkdirSync(dirname(join(scratch, BASE_UI_PKG_REL)), { recursive: true });
  symlinkSync(join(owner, BASE_UI_PKG_REL), join(scratch, BASE_UI_PKG_REL), "dir");
  expect(installed(scratch).version).toBe("9.9.9");
});

test("package plumbing is not component anatomy and a reasoned n-a ruling is valid", ({ scratch }) => {
  writeDeclarations(scratch);
  write(scratch, `${BASE_UI_PKG_REL}/package.json`, '{"name":"@base-ui/react","version":"9.9.9"}');
  write(scratch, `${BASE_UI_PKG_REL}/docs/index.d.ts`, 'export * as Docs from "./index.parts.js";');
  write(scratch, `${BASE_UI_PKG_REL}/docs/index.parts.d.ts`, 'export { DocsRoot as Root } from "./root/DocsRoot.js";');
  write(scratch, `${BASE_UI_PKG_REL}/docs/root/DocsRoot.d.ts`, "export interface DocsRootProps { href?: string | undefined }");
  const part = { ...PART, props: ["items"], handlers: {}, state: [] };
  const surface = installed(scratch);
  expect(surface).toEqual({ ...SURFACE, components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: part } } } });
  const manifest: SurfaceManifest = {
    ...MANIFEST,
    components: { ["Select"]: { ...COMPONENT, parts: { ["Root"]: { ...part, disposition: "n-a", why: "No UI seal wraps Select; ends when one is added." } } } },
  };
  expect(() => surfaceContract(manifest, surface)).not.toThrow();
});
