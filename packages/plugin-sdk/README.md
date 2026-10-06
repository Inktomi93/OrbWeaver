# `@orb/plugin-sdk`

Type declarations for Orbweaver plugin authoring. This package contains no runtime code and has no
dependencies.

Orbweaver distributes the package as `orb-plugin-sdk-<version>.tgz` on each public
`plugin-authoring-v<version>` GitHub Release. Projects pin that anonymous release-asset URL; there is no npm
registry publication.

Choose exactly one entry for each TypeScript program:

- `@orb/plugin-sdk/main` declares `orb.host(1)` for the server QuickJS guest.
- `@orb/plugin-sdk/ui` declares `orb.ui(1)` for the scripted UI QuickJS guest.
- `@orb/plugin-sdk/frame` declares the isolated-frame message bridge and the injected
  `orbPluginAssetUrl("ui/assets/<name>")` helper. Add the DOM library in that frame's compiler program.

House-rendered image nodes, declared grid tiles, and detail-stage heroes may name a flat admitted raster with
`bundleAsset: "ui/assets/<name>"`. Orbweaver resolves that name through the current plugin installation; it
is not a URL or filesystem path.

Keep main, UI, and frame source in separate compiler programs. The runtime consumes built, self-contained
JavaScript; importing this package from an emitted guest script is unsupported.

## Explicit composer drafts and host-owned pickers

A command with `composerDraft: true` declares only a `composer-action` placement and no typed arguments. Only an explicit composer click supplies `input.draft`.

Return a string replacement. The host rejects nonstrings and bounds both input and output. The client replaces the visible draft only while that invocation still owns it, and offers exact-text Undo until the next edit.

Ordinary commands, slash dispatch, palette commands, and background events receive no unsent composer draft.

A select with `optionsFromHost: "owned-lore-books"` uses the installer's first-party catalog. It cannot also declare `options` or `optionsFrom`.

The guest receives only the person's selected id. Selection configures a destination; it does not attach a book or grant room write authority.
