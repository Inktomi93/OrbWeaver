// The INSTALLED tree — the one resource family that is deliberately not the authored transaction.
//
// ONE KIND WITH DECLARED MODES, NEVER THREE NARROW KINDS (owner ruling, 2026-09-11, guide §11). Three gates
// read three different things out of `node_modules`: a parsed `.d.ts` surface, a version tuple, and one raw
// bundled file. Giving each its own resource kind would make each capability serve exactly one gate — which
// is that gate's private reader wearing a contract's clothes — and would cost three passes over the four
// policing surfaces instead of one. The earlier design sketch (`resource-gate-access-patterns.md` §6–§7)
// proposes `baseUiSurface`, `installedReactCompiler` and `devtoolsClosure` as separate typed facts; the
// owner ruling is later and wins. What stays with those gates is their INTERPRETATION — surface adjudication,
// denylist membership, pin/hash/licence validation. This door owns loading, identity, status and receipts.
//
// RESOLUTION IS NODE'S OWN, NOT A PATH GUESS. Under pnpm `packages/ui/node_modules/@base-ui/react` is a
// SYMLINK into the content-addressed store, and `ResourceReader` refuses every symlink traversal by design
// (`ops/resource-reader.ts`: "authored resource traverses a symbolic link"). An installed package therefore
// cannot come through the authored reader at all — it is resolved with `createRequire(<base>).resolve(
// "<package>/package.json")`, node's own algorithm, from a DECLARED base. Measured 2026-09-11: the four ids
// below all resolve that way, and `playwright-core` resolves only from the already-resolved `@playwright/test`
// manifest, which is why `via` exists and is not speculative generality.
//
// A NAMED FILE IS JOINED TO THE PACKAGE DIRECTORY, NOT RESOLVED. `playwright-core/browsers.json` is
// ERR_PACKAGE_PATH_NOT_EXPORTED — an installed package's `exports` map is a contract with its IMPORTERS, and
// this door is an observer rather than an importer. So `text` mode resolves the manifest and joins the named
// file to its directory, which is exactly what the existing DevTools reader already does.

export const INSTALLED_PACKAGE_MODES = ["ast", "metadata", "text"] as const;
/** @public knip type-face false positive — the importable union spelling of the `INSTALLED_PACKAGE_MODES` vocabulary — one home
 *  for the axis (Spine-TypeScript-and-Patterns.md §5.5), which consumers reach through the literal today rather than by naming
 *  the alias. */
export type InstalledPackageMode = (typeof INSTALLED_PACKAGE_MODES)[number];

/** The closed id set is declared BEFORE the definitions so `via` can name a sibling id without the
 *  definitions object referencing its own inferred key type. The explicit `Record` annotation below then
 *  makes tsc force a definition for every id. */
export const INSTALLED_PACKAGE_IDS = ["base-ui", "react-compiler", "playwright-test", "playwright-core", "streamdown"] as const;
export type InstalledPackageId = (typeof INSTALLED_PACKAGE_IDS)[number];

export interface InstalledPackageDefinition {
  /** The npm package specifier, resolved through node from `from` (or from `via`'s resolved manifest). */
  readonly specifier: string;
  /** Repo-relative resolution base. Ignored when `via` is set. */
  readonly from: string;
  /** Resolve from ANOTHER installed id's manifest instead of a repo file. */
  readonly via?: InstalledPackageId;
  /** An EXPORTED subpath to locate the package directory by, for a package whose `exports` map refuses
   *  `./package.json`. Measured 2026-09-11: `streamdown` exports only `.` (import/types conditions, no
   *  `require`) and `./styles.css`, so both the manifest resolution and a CJS resolve of the bare specifier
   *  are ERR_PACKAGE_PATH_NOT_EXPORTED / "no exports main defined". The anchor keeps resolution inside
   *  NODE's algorithm rather than guessing a `node_modules/<name>` path, which under pnpm is the symlink
   *  rather than the store directory. */
  readonly directoryAnchor?: string;
}

export const INSTALLED_PACKAGE_DEFINITIONS: Readonly<Record<InstalledPackageId, InstalledPackageDefinition>> = {
  /** The Base UI family adjudicates the installed `.d.ts` surface against a committed manifest. */
  "base-ui": { specifier: "@base-ui/react", from: "packages/ui/package.json" },
  /** `no-manual-memo` needs only whether the bundled denylist still names `@tanstack/react-virtual`. */
  "react-compiler": { specifier: "babel-plugin-react-compiler", from: "packages/client/package.json" },
  /** Half of the DevTools browser tuple. */
  "playwright-test": { specifier: "@playwright/test", from: "package.json" },
  /** The other half; reachable only from the resolved `@playwright/test` manifest under pnpm. */
  "playwright-core": { specifier: "playwright-core", from: "package.json", via: "playwright-test" },
  /** The installed Markdown renderer whose bundled chunks are the ONLY writer of its `data-streamdown`
   *  selectors — the vendor half of `css-selector-has-a-writer`, reached through `vendorCssSurface`. */
  streamdown: { specifier: "streamdown", from: "packages/ui/package.json", directoryAnchor: "styles.css" },
};

/** @public knip type-face false positive — a structural field (`id`) of the exported `InstalledPackageFacts` shape (line 102),
 *  never referenced by its own name at any call site. */
export interface InstalledPackageMetadata {
  readonly name: string;
  readonly version: string;
  /** The RESOLVED package directory, repo-relative when it is inside the checkout and `null` when it is
   *  not. Measured on this tree: pnpm's store is `node_modules/.pnpm/**` INSIDE the repository, so this is
   *  normally a real repo path — and it is the STORE path, never the `packages/ui/node_modules/...` symlink
   *  an importer sees. `null` is the ordinary answer for a global or otherwise external store, never a
   *  refusal. */
  readonly directory: string | null;
  /** The manifest's own `exports` keys, sorted. Presence, never target semantics. */
  readonly exportKeys: readonly string[];
}

/** @public knip type-face false positive — a structural field (`id`) of the exported `InstalledPackageFacts` shape (line 101),
 *  never referenced by its own name at any call site. */
export interface InstalledPackageText {
  /** The named file, exactly as the request spelled it, relative to the package directory. */
  readonly file: string;
  readonly text: string;
}

/** Declaration files of the installed package, parsed once per invocation in the door's own workspace. The
 *  paths are the door's identity; the parsed sources are handed to the consumer's own interpretation.
 *  @public knip type-face false positive — a structural field (`id`) of the exported `InstalledPackageFacts` shape (line 100),
 *  never referenced by its own name at any call site. */
export interface InstalledPackageDeclarations {
  /** Absolute declaration-file paths, sorted. They are NOT repo paths: an installed package legitimately
   *  lives outside the checkout, and pretending otherwise is how a resolved store path becomes a lie. */
  readonly declarationPaths: readonly string[];
}

/** `text` mode names its file; the other two modes have nothing to name. A closed request rather than an
 *  optional field, so a `text` declaration that forgot its file cannot type-check. */
export type InstalledPackageRequest =
  | { readonly id: InstalledPackageId; readonly mode: "ast" | "metadata" }
  | { readonly id: InstalledPackageId; readonly mode: "text"; readonly file: string };

export type InstalledPackageFacts =
  | ({ readonly id: InstalledPackageId; readonly mode: "metadata" } & InstalledPackageMetadata)
  | ({ readonly id: InstalledPackageId; readonly mode: "text" } & InstalledPackageText)
  | ({ readonly id: InstalledPackageId; readonly mode: "ast" } & InstalledPackageDeclarations);
