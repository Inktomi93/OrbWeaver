// One package linked through node_modules two ways, for the rules that judge a library by the program's answer
// (tooling/src/eslint/library-source.ts): as a workspace package, which is the tree's own, and as a dependency the
// store holds outside every node_modules directory, which is a library although no path names node_modules.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { plantLink } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import type { OrbRule } from "../../tooling/src/eslint/syntax.ts";
import { WORKSPACE_MANIFEST } from "../../tooling/src/package-effects/index.ts";

export const LINKS = ["workspace", "dependency"] as const;
export type Link = (typeof LINKS)[number];

/** Where each link keeps the package: a workspace package directory, or a store directory pnpm links in. */
export const PACKAGE_DIR: Readonly<Record<Link, string>> = { workspace: "packages/linked", dependency: "store/linked" };

/** A package by its manifest name and its files, relative to the package root; its types sit in `types`, `index.d.ts` by default.
 *  It sits in `directory`, which defaults to where its link keeps a package. */
export interface LinkedPackage {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly types?: string;
  readonly directory?: string;
}

type PlantedTree = (files: Readonly<Record<string, string>>) => Promise<string>;

/** Plant `tree` and each package, linked into `node_modules/<name>` from where its `link` keeps it. */
export async function plantLinkedPackages(
  plantedTree: PlantedTree,
  packages: readonly { readonly link: Link; readonly pkg: LinkedPackage }[],
  tree: Readonly<Record<string, string>>,
): Promise<string> {
  const placed = packages.map(({ link, pkg }) => ({ pkg, dir: pkg.directory ?? PACKAGE_DIR[link] }));
  const root = await plantedTree({
    [WORKSPACE_MANIFEST]: "packages:\n  - packages/*\n",
    ...Object.fromEntries(
      placed.flatMap(({ pkg, dir }) => [
        [`${dir}/package.json`, JSON.stringify({ name: pkg.name, types: `./${pkg.types ?? "index.d.ts"}` })],
        ...Object.entries(pkg.files).map(([path, text]) => [`${dir}/${path}`, text] as const),
      ]),
    ),
    ...tree,
  });
  for (const { pkg, dir } of placed) {
    plantLink(root, `node_modules/${pkg.name}`, join(root, dir), "dir");
  }
  return root;
}

/** Plant `tree` and one `pkg`, linked into `node_modules/<name>` from where `link` keeps it. */
export const plantLinked = (plantedTree: PlantedTree, link: Link, pkg: LinkedPackage, tree: Readonly<Record<string, string>>): Promise<string> =>
  plantLinkedPackages(plantedTree, [{ link, pkg }], tree);

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
};

/** The messages `rules`, registered under `orb/`, report on the planted `file`, over a program rooted at `files`. */
export function lintLinked(
  root: string,
  file: string,
  rules: Readonly<Record<string, OrbRule>>,
  { files = [file], options = {} }: { readonly files?: readonly string[]; readonly options?: ts.CompilerOptions } = {},
): readonly Linter.LintMessage[] {
  const fileName = join(root, file);
  const program = ts.createProgram({ rootNames: files.map((path) => join(root, path)), options: { ...OPTIONS, ...options } });
  return new Linter({ cwd: root }).verify(
    readFileSync(fileName, "utf8"),
    {
      files: ["**/*.ts", "**/*.tsx"],
      plugins: { orb: { rules } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: Object.fromEntries(Object.keys(rules).map((name) => [`orb/${name}`, "error"])),
    },
    { filename: fileName },
  );
}
