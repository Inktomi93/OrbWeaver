// The `sideEffects` ruling for workspace package manifests. A bundler applies the field of the nearest manifest to every
// module it resolves from that package, the application's own modules included. A library declares it so a consumer's
// bundler can drop what nothing uses. An application never declares it: any value lets the bundler drop an effect-only
// import such as the stylesheet front door in packages/client/src/styles/index.ts, and no static check sees the loss.
// `.claude/rules/tooling.md` states the ruling; this table is the class of every workspace package, so a package with
// no class fails the check and the ruling holds at birth.
import { globSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

export type PackageEffectClass = "library" | "application";

/**
 * Repository-relative package directory to its class.
 * @remarks `packages/server` and `tooling` run entry modules and import-time effects from source, so a declaration there
 * would be false and would govern their entries the day a bundler reads them.
 */
export const PACKAGE_EFFECT_CLASS = {
  "packages/client": "application",
  "packages/contracts": "library",
  "packages/db": "library",
  "packages/default-content": "library",
  "packages/inference": "library",
  "packages/kit": "library",
  "packages/plugin-sdk": "library",
  "packages/plugin-toolchain": "library",
  "packages/server": "application",
  "packages/showcase-plugins": "library",
  "packages/ui": "library",
  "tests/support": "library",
  tooling: "application",
} as const satisfies Readonly<Record<string, PackageEffectClass>>;

const SIDE_EFFECTS_FIELD = "sideEffects";
const manifestSchema = z.object({ name: z.string().trim().min(1), private: z.boolean().optional(), [SIDE_EFFECTS_FIELD]: z.json().optional() });
const workspaceSchema = z.object({ packages: z.array(z.string().min(1)) });

/**
 * Read one authored package manifest: a regular file whose real path stays under `admittedRoot`, strict UTF-8, parsed.
 * @throws when the manifest is a link, escapes the root, is not UTF-8 or JSON, or lacks a name
 */
export function readAuthoredManifest(manifestPath: string, admittedRoot: string): z.infer<typeof manifestSchema> {
  if (!lstatSync(manifestPath).isFile()) {
    throw new Error(`a package manifest must be an authored regular file, not a symbolic link: ${manifestPath}`);
  }
  if (realpathSync(manifestPath) !== resolve(realpathSync(admittedRoot), relative(admittedRoot, manifestPath))) {
    throw new Error(`a package manifest cannot traverse an authored symbolic link: ${manifestPath}`);
  }
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(manifestPath));
  return manifestSchema.parse(JSON.parse(text));
}

/** Refuse a library manifest without `sideEffects` and an application manifest with it, whatever its value. */
export function assertPackageEffects(manifestPath: string, effectClass: PackageEffectClass, admittedRoot: string): void {
  const manifest = readAuthoredManifest(manifestPath, admittedRoot);
  const declares = Object.hasOwn(manifest, SIDE_EFFECTS_FIELD);
  if (effectClass === "application" && declares) {
    throw new Error(`${manifest.name} is an application and must not declare ${SIDE_EFFECTS_FIELD}, regardless of its value`);
  }
  if (effectClass === "library" && !declares) {
    throw new Error(`${manifest.name} is a library and must declare ${SIDE_EFFECTS_FIELD}`);
  }
}

/** The directories of the packages `pnpm-workspace.yaml` lists under `root`, relative to it. */
export function workspacePackageDirs(root: string): string[] {
  const { packages } = workspaceSchema.parse(parse(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")));
  return packages.flatMap((pattern) => globSync(`${pattern}/package.json`, { cwd: root }).map((manifest) => dirname(manifest))).sort();
}

/**
 * Judge every workspace package under `root` against its class in `classes`.
 * @throws when a package has no class, a class names no package, or a manifest breaks its class
 */
export function assertWorkspaceEffects(root: string, classes: Readonly<Record<string, PackageEffectClass>> = PACKAGE_EFFECT_CLASS): void {
  const dirs = workspacePackageDirs(root);
  const stale = Object.keys(classes).filter((dir) => !dirs.includes(dir));
  if (stale.length > 0) {
    throw new Error(`the package effect table names no workspace package: ${stale.join(", ")}`);
  }
  const classOf = new Map(Object.entries(classes));
  for (const dir of dirs) {
    const effectClass = classOf.get(dir);
    if (effectClass === undefined) {
      throw new Error(`workspace package ${dir} has no class in PACKAGE_EFFECT_CLASS (tooling/src/package-effects/index.ts)`);
    }
    assertPackageEffects(join(root, dir, "package.json"), effectClass, root);
  }
}
