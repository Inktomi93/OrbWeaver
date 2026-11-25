// Build the two GitHub Release assets for the public author surface. release.yml attaches them unchanged to
// the plugin-authoring-v<version> release that release-please cuts; no npm registry is involved. The SDK and
// the toolchain share one version (release-please-config.json bumps both), so one tag names both assets.
// The toolchain asset is self-contained (D266): every workspace and transitive import is bundled into dist, and only
// its declared dependencies stay external, so a clean install outside the monorepo runs it. The declarations of the
// programmatic entry ship beside it, free of workspace imports.

import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { pnpmInvocation } from "@orb/tooling/floor/host/platform";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { build } from "vite";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGES = [
  { directory: "packages/plugin-sdk", tarballStem: "orb-plugin-sdk" },
  { directory: "packages/plugin-toolchain", tarballStem: "orb-plugin-toolchain" },
] as const;

// A bare module specifier in an import, dynamic import or require. A string that only holds "@orb/..." (the
// support registry names SDK entries) is data and does not match.
const BARE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)["']([^"'./][^"']*)["']/gu;
const NODE_BUILTIN_PREFIX = "node:";
const TOOLCHAIN_ENTRIES = { index: "src/index.ts", cli: "src/cli.ts" } as const;
// A relative import or re-export inside a declaration file. tsc keeps the `./x.ts` spelling of the source; a
// consumer resolves `./x.js` to `./x.d.ts`, so the shipped file says that.
const RELATIVE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']*)["']/gu;
const DECLARATION_ENTRY = "index.d.ts";

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly engines: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly sideEffects: boolean;
}

async function runPnpm(args: readonly string[], cwd: string): Promise<Awaited<ReturnType<typeof spawnNiced>>> {
  const invocation = pnpmInvocation({ ambient: inheritedProcessEnv(), platform: process.platform, nodePath: process.execPath, args });
  if (invocation.kind === "refused") {
    throw new Error(invocation.reason);
  }
  return await spawnNiced(invocation.command, invocation.args, { cwd });
}

async function pack(directory: string, outputDirectory: string): Promise<void> {
  const result = await runPnpm(["--config.verify-deps-before-run=false", "pack", "--pack-destination", outputDirectory], resolve(REPO_ROOT, directory));
  if (result.code !== 0) {
    throw new Error(`pnpm pack failed for ${directory}: ${result.stderr.trim()}`);
  }
}

// One build of the toolchain: everything inlines except the declared dependencies.
async function bundleToolchain(source: string, dependencies: readonly string[], outDir: string): Promise<void> {
  await build({
    configFile: false,
    logLevel: "warn",
    root: source,
    ssr: { noExternal: true, external: [...dependencies] },
    build: {
      ssr: true,
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      target: "esnext",
      rolldownOptions: {
        input: TOOLCHAIN_ENTRIES,
        external: dependencies.map((name) => new RegExp(`^${name}(/|$)`, "u")),
        output: { entryFileNames: "[name].js", chunkFileNames: "[name].js" },
      },
    },
  });
}

async function readTree(directory: string): Promise<ReadonlyMap<string, Buffer>> {
  const entries = (await readdir(directory, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
  const files = await Promise.all(
    entries.map(async (entry) => [join(entry.parentPath, entry.name).slice(directory.length), await readFile(join(entry.parentPath, entry.name))] as const),
  );
  return new Map(files.toSorted(([left], [right]) => left.localeCompare(right)));
}

function assertSameTree(left: ReadonlyMap<string, Buffer>, right: ReadonlyMap<string, Buffer>): void {
  const same = left.size === right.size && [...left].every(([name, bytes]) => right.get(name)?.equals(bytes) === true);
  if (!same) {
    throw new Error("the toolchain bundle is not deterministic across two clean builds");
  }
}

// A surviving `@orb/` specifier, or any other import the tarball does not declare, fails on a clean install.
function assertSelfContained(tree: ReadonlyMap<string, Buffer>, dependencies: readonly string[]): void {
  for (const [name, bytes] of tree) {
    for (const [, specifier] of bytes.toString("utf8").matchAll(BARE_SPECIFIER)) {
      const declared = dependencies.some((dependency) => specifier === dependency || specifier?.startsWith(`${dependency}/`) === true);
      if (specifier === undefined || !(declared || specifier.startsWith(NODE_BUILTIN_PREFIX))) {
        throw new Error(`the toolchain bundle ${name} imports "${specifier}", which is neither inlined nor a declared dependency`);
      }
    }
  }
}

// The public programmatic entry's declarations. tsc emits one `.d.ts` per source file, including the contracts the
// toolchain imports; only the files the entry reaches ship, and a shipped file may not import a workspace package.
async function emitDeclarations(source: string, root: string): Promise<ReadonlyMap<string, Buffer>> {
  const packages = dirname(source);
  const emitted = join(root, "declarations");
  const configPath = join(root, "tsconfig.declarations.json");
  await writeFile(
    configPath,
    JSON.stringify({
      extends: join(source, "tsconfig.json"),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        rootDir: packages,
        typeRoots: [join(source, "node_modules", "@types")],
        outDir: emitted,
        rewriteRelativeImportExtensions: true,
      },
      include: [join(source, "src"), join(REPO_ROOT, "reset.d.ts"), join(REPO_ROOT, "platform.d.ts")],
      exclude: ["**/node_modules"],
    }),
  );
  const compiled = await runPnpm(["--config.verify-deps-before-run=false", "exec", "tsc", "-p", configPath], source);
  if (compiled.code !== 0) {
    throw new Error(`toolchain declaration build failed: ${compiled.stdout.trim()} ${compiled.stderr.trim()}`);
  }
  const sourceRoot = join(emitted, relative(packages, source), "src");
  const reached = new Map<string, Buffer>();
  const pending = [DECLARATION_ENTRY];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (reached.has(name)) {
      continue;
    }
    const text = (await readFile(join(sourceRoot, name))).toString("utf8");
    reached.set(
      name,
      Buffer.from(
        text.replace(RELATIVE_SPECIFIER, (match, specifier: string) => {
          const target = relative(sourceRoot, resolve(dirname(join(sourceRoot, name)), specifier.replace(/\.(?:ts|js)$/u, ".d.ts")));
          if (target.startsWith("..")) {
            throw new Error(`the toolchain declaration ${name} imports ${specifier}, which lies outside the toolchain`);
          }
          pending.push(target);
          return match.replace(specifier, specifier.replace(/\.ts$/u, ".js"));
        }),
      ),
    );
  }
  return reached;
}

// The installed version of a dependency the workspace pins through the catalog, so the tarball names the
// exact version the bundled contracts were built against.
async function installedVersion(name: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(REPO_ROOT, "packages", "contracts", "node_modules", name, "package.json"), "utf8")) as {
    readonly version: string;
  };
  return manifest.version;
}

async function stagedToolchain(root: string): Promise<string> {
  const source = join(REPO_ROOT, "packages", "plugin-toolchain");
  const sourceManifest = JSON.parse(await readFile(join(source, "package.json"), "utf8")) as PackageManifest;
  const built = [join(root, "bundle-a"), join(root, "bundle-b")] as const;
  const declared = Object.keys(sourceManifest.dependencies);
  await bundleToolchain(source, declared, built[0]);
  await bundleToolchain(source, declared, built[1]);
  const [first, second] = await Promise.all([readTree(built[0]), readTree(built[1])]);
  assertSameTree(first, second);
  assertSelfContained(first, declared);
  const declarations = await emitDeclarations(source, root);
  assertSelfContained(declarations, declared);
  const stage = join(root, "plugin-toolchain");
  await mkdir(stage, { recursive: true });
  await cp(built[0], join(stage, "dist"), { recursive: true });
  for (const [name, bytes] of declarations) {
    await mkdir(dirname(join(stage, "dist", name)), { recursive: true });
    await writeFile(join(stage, "dist", name), bytes);
  }
  await cp(join(source, "README.md"), join(stage, "README.md"));
  await cp(join(REPO_ROOT, "LICENSE"), join(stage, "LICENSE"));
  const dependencies = Object.fromEntries(
    await Promise.all(
      Object.entries(sourceManifest.dependencies).map(
        async ([name, range]) => [name, range.startsWith("catalog:") ? await installedVersion(name) : range] as const,
      ),
    ),
  );
  await writeFile(
    join(stage, "package.json"),
    `${JSON.stringify(
      {
        name: sourceManifest.name,
        version: sourceManifest.version,
        private: true,
        description: sourceManifest.description,
        license: sourceManifest.license,
        type: "module",
        engines: sourceManifest.engines,
        files: ["dist"],
        bin: { "orb-plugin": "./dist/cli.js" },
        exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
        dependencies,
        sideEffects: sourceManifest.sideEffects,
      },
      null,
      2,
    )}\n`,
  );
  return stage;
}

async function writeAtomically(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

const output = resolve(process.argv[2] ?? join(REPO_ROOT, "dist", "plugin-authoring"));
const first = await mkdtemp(join(tmpdir(), "orb-plugin-author-release-a-"));
const second = await mkdtemp(join(tmpdir(), "orb-plugin-author-release-b-"));
const staging = await mkdtemp(join(tmpdir(), "orb-plugin-author-release-stage-"));
try {
  const versions = await Promise.all(
    PACKAGES.map(async ({ directory }) => (JSON.parse(await readFile(join(REPO_ROOT, directory, "package.json"), "utf8")) as PackageManifest).version),
  );
  const version = versions[0];
  if (version === undefined || versions.some((other) => other !== version)) {
    throw new Error(`plugin-sdk and plugin-toolchain must share one version, found ${versions.join(" and ")}`);
  }
  const assets = PACKAGES.map(({ directory, tarballStem }) => ({ directory, filename: `${tarballStem}-${version}.tgz` }));
  const toolchain = await stagedToolchain(staging);
  for (const asset of assets) {
    const directory = asset.directory === "packages/plugin-toolchain" ? toolchain : join(REPO_ROOT, asset.directory);
    await pack(directory, first);
    await pack(directory, second);
    const firstBytes = await readFile(join(first, asset.filename));
    const secondBytes = await readFile(join(second, asset.filename));
    if (!firstBytes.equals(secondBytes)) {
      throw new Error(`${asset.filename} is not deterministic across two clean packs`);
    }
    await writeAtomically(join(output, asset.filename), firstBytes);
    const digest = createHash("sha256").update(firstBytes).digest("hex");
    process.stdout.write(`${asset.filename} sha256=${digest}\n`);
  }
} finally {
  await Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true }), rm(staging, { recursive: true, force: true })]);
}
