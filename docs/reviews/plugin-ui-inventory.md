# Plugin UI inventory

## Outcome

`await __orb.pluginUi()` inventories the signed-in owner's runtime-listed plugin surfaces and commands. It retains installed identities and statuses separately from registrations.

The reader uses production `plugin.list`, `plugin.listSurfaces` and `plugin.listCommands`. Surface publication summaries inspect existing exact query-cache keys only. No surface-state request, command execution, grant change, activation or guest boot is added.

The existing DEV import door installs the handle. Navigation capabilities remain synchronous. The capability index, evidence-source index and agent-tools README describe the reader.

## Observations and limits

- Surface metadata identifies existing attribution shells by install, surface and canonical anchor. A mounted shell does not establish content readiness.
- Command metadata identifies actual composer controls by install, command, target and direct, overflow or media location. Measurement copies have no command identity.
- The composer publishes its existing overflow partition independently of menu-item mounting. Closed menus therefore retain placement evidence.
- Host observations include paint visibility, inert ancestry, aria-hidden ancestry, a selector and its zero-based index. Hidden retained subtrees do not become visible hosts.
- Missing hosts and unread publication scopes remain unobserved. They are not classified as ineligible or unsupported.
- Runtime registration lists are not complete manifest inventories. Disabled and errored installs can have no runtime-listed surfaces or commands.
- Cache publication summaries can be stale. Their status and update timestamps remain visible. Scripted, frame and per-call tool-card content use other planes and have no publication summary.
- Render specifications, raw state, command argument schemas and handler references are excluded from the public inventory type and runtime projection.

Private `data-orb-plugin-*` attributes are DEV-gated and add no wrappers or paint. The owner-CSS generator harvests slot, shell-class and appearance hooks; these attributes are outside that published surface.

ESLint's existing named DOM-boundary table registers the inventory's exact selector calls. The general DOM-addressing rule remains unchanged.

## Verification

Completed checks:

- `pnpm exec biome check <changed source and type-contract paths> --write --diagnostic-level=error` passes.
- `pnpm lint:eslint <changed source, configuration and type-contract paths>` passes with no warnings.
- `pnpm typecheck tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json` passes, including the inventory privacy type contract.
- `pnpm format:docs docs/reviews/plugin-ui-inventory.md packages/client/src/lib/agent-tools.README.md` completes.
- `git diff --check` passes.

The native compiler checks the type contract; no runtime test suite is claimed. Static checks do not establish runtime behavior.

No public package door is added solely to test DEV composition glue. No production implementation is replaced with fake plugin policy.

The main session owns real DEV-install Snap verification, including owner-scoped registration reads, cache-publication distinctions, host observations and composer placement. The lane starts no application server or browser and touches no audit clone or production runtime.
