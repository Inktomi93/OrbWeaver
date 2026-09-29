# `@orb/plugin-toolchain`

Strict, deterministic TypeScript compilation, freshness checking, and packing for Orbweaver plugin runtimes.
In a standalone direct-Git plugin, keep TypeScript under `src/` and generate the installable entries at the
repository root:

```bash
orb-plugin build . --source-dir src --out-dir .
orb-plugin check . --source-dir src --out-dir .
```

Commit root `manifest.json`, `main.js`, optional `ui.js`, and admitted assets so a running Orbweaver instance
can install the public repository without building fetched source. `build` atomically writes deterministic
output and removes an obsolete generated `ui.js`; `check` recompiles without writing and refuses missing,
stale, or obsolete output. A `frame.ts` program is checked with DOM types and embedded into `main.js` at the
single `/* @orb-frame-script */` marker. A nested example can use its own plugin root:

```bash
orb-plugin build examples/frame --source-dir examples/frame/src --out-dir examples/frame
orb-plugin check examples/frame --source-dir examples/frame/src --out-dir examples/frame
```

When an upload or bundle URL needs a zip, `orb-plugin pack . --source-dir src --out dist/plugin.zip`
compiles in memory and writes deterministic bytes. With no source or output option, `build` and `check` use
source beside the manifest and `.orb-plugin/build` staging, which is the first-party showcase integration.
All commands resolve the installed `@orb/plugin-sdk` from the plugin project; `--sdk <directory>` selects an
unpacked SDK explicitly.

Generate a support guide from the checked registry shipped with the toolchain:

```bash
orb-plugin support --write AUTHORING-SUPPORT.md
orb-plugin support --check AUTHORING-SUPPORT.md
orb-plugin support --format json
```

The registry lists the supported capabilities, host calls by runtime, event hooks, transform points, surface
mounts, tiers, and composer placements. Orbweaver derives its growing members from the executable application
contracts before packaging the standalone toolchain. Template guides link to the generated file instead of
copying those lists.

The runtime entries are self-contained scripts. Imports, exports, Node globals, browser globals in QuickJS,
and network APIs inside isolated frames are rejected before emit.

`build` and `check` also link the `host.ui` references in `main.ts` across calls:

- A literal `setState` or `openDialog` target must name a surface that `main.ts` registers with `ui.register`.
- An `openDialog` target must be a `dialog` surface.
- A literal `{ $state }` path in a static spec must be one that a `setState` call for that surface can publish.
  A `tool-card` spec binds the tool call record instead, so it is not linked.
- A reference whose type is wider than a string literal is not checked.

The application installs only the emitted
JavaScript and never executes this toolchain or repository build scripts.

Orbweaver distributes this package and `@orb/plugin-sdk` as deterministic `.tgz` assets on the public
`plugin-authoring-v0.1.0` GitHub Release. No npm registry is involved. Ordinary plugin repositories do not
need a release asset; the generated root entries are directly Git-installable. The tarballs are author
infrastructure only.
