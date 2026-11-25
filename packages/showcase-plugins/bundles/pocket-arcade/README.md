# Pocket Arcade

**Archetype: the escape hatch (`ui.frame`).** Draws its OWN pixels in an isolated frame. Start here only when
the declarative vocabulary genuinely cannot spell your surface.

A complete, playable 2048 beside the transcript — something to fidget with while the narrator types. Arrow
keys or the on-screen pad; the board inherits whatever theme the app is wearing.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/pocket-arcade /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.ts, build the checked JavaScript, then pack and install:
pnpm --filter @orb/showcase-plugins build
pnpm plugin:pack pocket-arcade ./out
```

## The manifest

```json
"capabilities": ["ui.frame", "storage.kv"]
```

`ui.frame` is deliberately NOT `ui.surface` — the hatch runs YOUR code in an isolated document, which is a
different consent sentence (its grant line says out loud that an isolated frame can beacon over WebRTC, the one
channel no policy closes). `storage.kv` is the plugin's own private key-value store, which the frame reaches over
the host-call bridge to keep the best score. A short manifest is the easiest possible yes for a user — notice how
much of this plugin's trust story is the shortness of that array.

## When to reach for the frame — and when not to

The DECLARATIVE plane (`ui.register`, every other seeded example) is the default: house components, free
theming, free a11y, free layout. The house rule is that a surface expressible in the vocabulary MUST ship in
the vocabulary. The frame exists for ARBITRARY PIXELS — canvas games, bespoke visualizations, animated
scenes. A grid of merging tiles is exactly that.

## What a frame gets, honestly

* An **opaque-origin document**: `sandbox allow-scripts`, never `allow-same-origin`. No cookies, no
  `localStorage` (this game's board resets on remount, and its footer says so), no app DOM.
* **No network**: `default-src 'none'`, no `connect-src` — fetch/XHR/WebSocket are refused by the document's
  own response policy.
* **Host calls ride `postMessage`**: there is no `orb` inside a frame. Post
  `{ orbPluginFrameCall: { callId, fn, args } }` to `parent` and read the `orbPluginFrameResult` reply
  (`@orb/plugin-sdk/frame`, `registerFrame`). Each call is re-gated against this plugin's grants. Before obeying any
  message, check `event.source === parent`, because other frames on the page can post to yours. This game
  reads its best score with `storage.get` on load and writes it with `storage.set` when you beat it, one save at
  a time (`frame.ts`). Without the `storage.kv` grant both calls come back refused and the game still plays.
* **Two theme tokens**, injected and live: `--sandbox-bg` and `--sandbox-fg` (plus the app's font). This
  game's entire palette is `color-mix()` over those two, which is why it lands correctly in ANY theme without
  shipping colors of its own — copy that trick before you ship a hardcoded palette into someone's light mode.
* **Bounds**: html ≤ 64 000 chars, css ≤ 16 000, ≤ 8 frames per plugin. An invalid registration is refused
  and logged, never activation-fatal.

`PLUGIN_ANCHOR_TIERS` in `packages/contracts/src/plugin/ui.ts` decides which anchors a frame may take: today
every anchor except `chat-settings-section` and `message-footer` (one document per transcript row is a
permanent no).

## Adapting it

* **A different game** — everything inside `GAME_HTML`/`GAME_CSS` is ordinary vanilla web code; the
  registration does not care what it draws. Keep it dependency-free (no CDN scripts — there is no network to
  load them over) and under the size caps.
* **An ambient scene** — a rain pane, a campfire, a starfield: same shape, no input handling.
* **A visualization**: bake the data into the document at activation, or read it live over the host-call
  bridge above (`storage.get`, `chat.listMessages` and the rest, each under this plugin's own grants). A
  simple live meter is still easier as the declarative plane's `meter`/state bindings.

## Honest gaps

* **The board dies on remount.** No browser storage reaches an opaque-origin frame; a scroll away and back is
  a fresh board. Only what the frame writes through `storage.set` survives, so persist the few values that
  matter (here, the best score) and keep the rest in memory.
* **Keyboard focus is a click away.** An iframe only hears keys while focused, and the host never lets a frame
  take focus as it loads: a frame that focuses itself on load has focus handed straight back to the page. So the
  person clicks the board (or Tabs into the frame) before the arrow keys work, and the board refocuses on every
  click. The on-screen pad is the always-works input.
