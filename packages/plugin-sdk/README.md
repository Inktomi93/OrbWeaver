# `@orb/plugin-sdk`

Type declarations for Orbweaver plugin authoring. This package contains no runtime code and has no
dependencies.

Orbweaver distributes the package as `orb-plugin-sdk-0.1.0.tgz` on the public
`plugin-authoring-v0.1.0` GitHub Release. Projects pin that anonymous release-asset URL; there is no npm
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
