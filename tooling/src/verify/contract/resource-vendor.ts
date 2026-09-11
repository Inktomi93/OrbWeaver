// The VENDOR CSS surface: the one identity that spans the committed Base UI Markdown mirror, the installed
// Base UI `CssVars` declarations and version, and the installed Streamdown bundles that are the only writers
// of its selectors (`resource-gate-access-patterns.md` §4).
//
// ONE COMPOSITE FACT, NOT THREE. Its two consumers (`css-var-defined`, `css-selector-has-a-writer`) each
// adjudicate a COMMITTED claim against an INSTALLED reality, and the whole point of both is that the two
// sides are compared. Splitting the sides into separate declarations would let a policy acquire one and
// judge as if it had both — which is the stale-vendor arm those gates exist to catch, reappearing one layer
// down.
//
// EVERY MEMBER IS REQUIRED, INCLUDING THE MIRROR INDEX. The index carries the mirror's version banner, and a
// version reconciliation whose left side silently became `undefined` does not fail — it PASSES, which is the
// worst available outcome for a contract whose job is to notice an upgrade. So an absent mirror, an absent
// index, an uninstalled package or a package with no declarations all REFUSE the fact; only the comparison
// itself — mirror version vs installed version, documented set vs declared set — is left to the policy.
//
// THE INSTALLED SIDE PUBLISHES NO REPO PATHS. Under pnpm those files live in the content-addressed store,
// reached through a symlink the authored reader refuses by construction. Their paths are ABSOLUTE and
// labelled as such; only the `docs/vendor/base-ui` mirror contributes to the authored population.

export const VENDOR_MIRROR_ROOT = "docs/vendor/base-ui";
export const VENDOR_MIRROR_INDEX = "docs/vendor/base-ui/INDEX.md";

/** A committed mirror document. Path is repo-relative; the API-table grammar stays in the consuming policy. */
export interface VendorMirrorDocument {
  readonly path: string;
  readonly text: string;
}

/** An installed file. Path is ABSOLUTE — a store path is not a member of any authored population, and
 *  spelling it repo-relative would be a path that resolves nowhere. */
export interface VendorInstalledFile {
  readonly path: string;
  readonly text: string;
}

export interface VendorCssSurface {
  readonly mirrorRoot: string;
  /** Every `.md` under the mirror root, sorted, INDEX included. */
  readonly mirrorDocuments: readonly VendorMirrorDocument[];
  /** The index document's text, hoisted because it is the version banner's one home. */
  readonly mirrorIndexText: string;
  /** The installed Base UI version, from its manifest. */
  readonly packageVersion: string;
  /** Every installed `*CssVars.d.ts`, sorted by absolute path. */
  readonly declarationFiles: readonly VendorInstalledFile[];
  /** Every installed Streamdown bundle under `dist/`, sorted. The emitted-selector grammar is the policy's;
   *  reading the WHOLE bundle set rather than one hash-named chunk is the door's, because a chunk name is a
   *  build artifact and a gate pinned to one goes silently blind at the next upgrade. */
  readonly selectorSources: readonly VendorInstalledFile[];
}
