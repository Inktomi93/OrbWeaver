// The VENDOR CSS surface: the installed Base UI `CssVars` declarations and version, and the installed
// Streamdown bundles that are the only writers of its selectors (the ResourceHost access-pattern ruling §4).
//
// NO COMMITTED MIRROR SIDE (retired #10, `docs/work/0010-vendored-docs-leave-git.md`): a measured diff
// proved the committed `docs/vendor/base-ui` Markdown mirror's documented custom-property set was IDENTICAL
// to the set this reader already parses from the installed `*CssVars.d.ts` declarations — the mirror carried
// no fact the installed side didn't already carry, so it was deleted rather than relocated. Base UI's own
// public-surface version drift is caught independently by `baseui-surface-manifest`
// (`tooling/src/verify/gates/baseui-surface.manifest.json`, generated from the installed package by
// `ops/gen/baseui-surface.ts`) — this surface owns no version-comparison arm of its own.
//
// THE INSTALLED SIDE PUBLISHES NO REPO PATHS. Under pnpm those files live in the content-addressed store,
// reached through a symlink the authored reader refuses by construction. Their paths are ABSOLUTE and
// labelled as such — this whole surface is now an UNPOPULATED resource kind (`resource-declaration.ts`).

/** An installed file. Path is ABSOLUTE — a store path is not a member of any authored population, and
 *  spelling it repo-relative would be a path that resolves nowhere. */
export interface VendorInstalledFile {
  readonly path: string;
  readonly text: string;
}

export interface VendorCssSurface {
  /** The installed Base UI version, from its manifest. */
  readonly packageVersion: string;
  /** Every installed `*CssVars.d.ts`, sorted by absolute path. */
  readonly declarationFiles: readonly VendorInstalledFile[];
  /** Every installed Streamdown bundle under `dist/`, sorted. The emitted-selector grammar is the policy's;
   *  reading the WHOLE bundle set rather than one hash-named chunk is the door's, because a chunk name is a
   *  build artifact and a gate pinned to one goes silently blind at the next upgrade. */
  readonly selectorSources: readonly VendorInstalledFile[];
}
