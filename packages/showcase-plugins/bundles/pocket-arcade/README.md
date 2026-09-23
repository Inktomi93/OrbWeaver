# Pocket Arcade

**Archetype: the escape hatch (`ui.frame`).** Draws its OWN pixels in an isolated frame. Start here only when
the declarative vocabulary genuinely cannot spell your surface.

A complete, playable 2048 beside the transcript — something to fidget with while the narrator types. Arrow
keys or the on-screen pad; the board inherits whatever theme the app is wearing.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/pocket-arcade /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack pocket-arcade ./out
```

## The manifest

```json
"capabilities": ["ui.frame"]
```

One capability. `ui.frame` is deliberately NOT `ui.surface` — the hatch runs YOUR code in an isolated
document, which is a different consent sentence (its grant line says out loud that an isolated frame can
beacon over WebRTC, the one channel no policy closes). A one-capability manifest is also the easiest possible
yes for a user — notice how much of this plugin's trust story is the shortness of that array.

## When to reach for the frame — and when not to

The DECLARATIVE plane (`ui.register`, every other seeded example) is the default: house components, free
theming, free a11y, free layout. The house rule is that a surface expressible in the vocabulary MUST ship in
the vocabulary. The frame exists for ARBITRARY PIXELS — canvas games, bespoke visualizations, animated
scenes. A grid of merging tiles is exactly that.

## What a frame gets, honestly

* An **opaque-origin document**: `sandbox allow-scripts`, never `allow-same-origin`. No cookies, no
  `localStorage` (this game's state resets on remount, and its footer says so), no app DOM.
* **No network**: `default-src 'none'`, no `connect-src` — fetch/XHR/WebSocket are refused by the document's
  own response policy.
* **Host calls ride `postMessage`**: there is no `orb` inside a frame. Post
  `{ orbPluginFrameCall: { callId, fn, args } }` to `parent` and read the `orbPluginFrameResult` reply
  (`host-v1.d.ts`, `registerFrame`). Each call is re-gated against this plugin's grants. Before obeying any
  message, check `event.source === parent`, because other frames on the page can post to yours. This game
  makes no host calls.
* **Two theme tokens**, injected and live: `--sandbox-bg` and `--sandbox-fg` (plus the app's font). This
  game's entire palette is `color-mix()` over those two, which is why it lands correctly in ANY theme without
  shipping colors of its own — copy that trick before you ship a hardcoded palette into someone's light mode.
* **Bounds**: html ≤ 64 000 chars, css ≤ 16 000, ≤ 8 frames per plugin. An invalid registration is refused
  and logged, never activation-fatal.

Frame-eligible anchors today: `settings`, `chat-flank`, `tool-card`. Never `message-footer` (one document per
transcript row is a permanent no).

## Adapting it

* **A different game** — everything inside `GAME_HTML`/`GAME_CSS` is ordinary vanilla web code; the
  registration does not care what it draws. Keep it dependency-free (no CDN scripts — there is no network to
  load them over) and under the size caps.
* **An ambient scene** — a rain pane, a campfire, a starfield: same shape, no input handling.
* **A visualization**: bake the data into the document at activation, or read it live over the host-call
  bridge above (`storage.get`, `chat.listMessages` and the rest, each under this plugin's own grants). A
  simple live meter is still easier as the declarative plane's `meter`/state bindings.

## Honest gaps

* **State dies on remount.** No storage of any kind reaches an opaque-origin frame; a scroll away and back is
  a fresh board. For a fidget toy that is fine; for anything with progress it is not — that thing wants the
  declarative plane or the server half.
* **Keyboard focus is a click away.** An iframe only hears keys while focused; the board autofocuses on load
  and refocuses on click, but a person who clicked elsewhere must click the board again. The on-screen pad is
  the always-works input.
