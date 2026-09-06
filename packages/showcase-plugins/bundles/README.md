# Writing an Orbweaver plugin

This directory holds the nine example plugins every Orbweaver user is given, one per **archetype**. They are
not decoration: they are the templates. Pick the one shaped like the thing you want, copy its folder, and
edit it. Each has its own README; reading an example's code IS the documentation for the capabilities it uses.

```
research-familiar/     event reactor      watches the room, reaches the network, files lore + databank clips
oracle-deck/           tool provider      gives the model tools — plus the whole UI plane in one file:
                                          tool card, page, dialog, typed-arg commands, toasts, a macro,
                                          a pubsub announcement, the footer mark
affinity-tracker/      quiet thinker      asks the model privately, keeps private state, notifies;
                                          ships a scripted (browser-side) surface in ui.js
draft-polish/          text pipeline      one capability, two seams: prompt transform + display transform
scene-chips/           room surface       quick-reply chips the room can see; subscribes to a sibling's
                                          pubsub channel (install it with oracle-deck and watch)
story-clocks/          room mechanics     writes CHAT VARIABLES (the member-visible plane), host controls
                                          in the room band, a model tool, a turn on a filled clock
keepsake-camera/       spend pipeline     llm.quiet with a SCHEMA → imagery.generate, designed around the
                                          5 s host bound; an ARM-C bound-grid album page
pocket-arcade/         escape hatch       ui.frame — its own pixels (a playable 2048) in an isolated frame
card-atlas/            hub browser        the flagship: search two community hubs, preview, and import
                                          cards with provenance stamps — the product-sized template
```

---

## The whole loop, in five lines

```bash
cp -r packages/showcase-plugins/bundles/oracle-deck /tmp/my-plugin
# edit /tmp/my-plugin/manifest.json  (give it your own `id` and `name`)
# edit /tmp/my-plugin/main.js        (and ui.js, if you ship a scripted surface)
pnpm plugin:pack oracle-deck ./out       # packs a SEEDED example, for reference
# for your own folder: point the packer at it, or zip the entries yourself
```

Then open **Settings → Plugins**, drop the zip on the install card, tick the capabilities you are willing to
allow, and turn it on.

A bundle is a zip containing **`manifest.json` + `main.js`** at the root — plus, optionally, **`ui.js`**
(the browser-side half of a `scripted` surface; declaring `uiEntry` in the manifest and shipping the file
must agree, in both directions). Nothing else is admitted. `pnpm plugin:pack <slug>` produces exactly that
from a source directory under this folder, and validates the manifest before it writes, so a bundle that
would be rejected at install is rejected on your machine instead.

**Editor support:** copy `host-v1.d.ts` (in this directory) next to your `main.js`/`ui.js` and any
TypeScript-aware editor gives you completion and checking against the full host surface in plain JavaScript —
`orb.host(1)` for the server half, `orb.ui(1)` for the scripted half.

### Tinkering with a plugin that is already installed

The nine here arrive **installed, switched off, and allowed nothing**. Nothing happens until you open the
grant list and say yes — and consent is per-capability: a partial grant runs the plugin on what you allowed
and keeps the ask standing for the rest. To change one: copy its folder, edit, pack, install.

**If you keep the same `id`**, the install is an **upgrade** of your existing row: private storage survives,
grants carry forward — *unless* the new manifest asks for something the old one did not (a new capability, or
a new `netHosts` entry). Widened reach forces the plugin back to disabled and raises a re-consent notice
naming exactly what is new. Narrowing never asks. An older version than the installed one is refused.

**If you change the `id`**, you get a second, independent plugin with its own storage and grants — what you
want while experimenting.

---

## `manifest.json`, field by field

```json
{
  "id": "oracle-deck",
  "name": "Oracle Deck",
  "version": "1.1.0",
  "hostVersion": 1,
  "entry": "main.js",
  "uiEntry": "ui.js",
  "description": "…written for the person deciding whether to allow it…",
  "author": "Orbweaver",
  "capabilities": ["storage.kv", "tools.register"],
  "netHosts": ["en.wikipedia.org"]
}
```

| Field | Rule |
| - | - |
| `id` | Lowercase slug, 2–64 chars, `[a-z0-9][a-z0-9-]*`. Unique **per user**; the namespace root for your tools (`plugin_<id_with_underscores>_<toolname>`), your macro, and your per-card stamp (`plugin_<id>`). Changing it makes a different plugin. |
| `name` | ≤ 80 chars. What the pane and every attribution frame call it. |
| `version` | Exactly `major.minor.patch`. Display + downgrade refusal only. |
| `hostVersion` | `1`. The membrane major. A future host that no longer serves 1 refuses your bundle loudly rather than half-running it. |
| `entry` | Always the literal `"main.js"`. One file, no module loader — inline what you need (esbuild `--bundle` if you write in modules). |
| `uiEntry` | Optional, always the literal `"ui.js"` — the browser-side guest for `tier:"scripted"` surfaces. Requires `ui.surface` in `capabilities`. |
| `description` | ≤ 500 chars. Shown beside the grant list; write it for the person deciding. |
| `author` | Optional, ≤ 120 chars. |
| `capabilities` | A subset of the closed list below. **Declaring is asking**, not receiving. |
| `netHosts` | Exact hostnames, ≤ 8. Required iff you declare `net.fetch`. |
| `matchAutomationEvents` | Optional, default `false`: your event handlers see only human-caused (depth-0) facts. `true` opts into automation-caused ones, under the hard cascade cap. |
| `builtAgainst` | Optional `{engineVersion, engineCommit?}` provenance; displayed, never a gate. |

Caps: `manifest.json` ≤ 64 KiB, `main.js` and `ui.js` ≤ 1 MiB each, the zip ≤ 1 MiB.

---

## Capabilities: the twenty-three things a plugin can ask for

Nothing is ambient. Every host function is gated at the **function**, by name, against the set the user
actually allowed — which can be narrower than what you declared. Feature-detect with
`host.grants.includes("…")` (see the guard idiom below), or catch `PluginCapabilityError` by `.name`.

| Capability | Unlocks | Notes |
| - | - | - |
| `chat.read` | `chat.current()`, `chat.listMessages()`, `chat.getVariables()`, `chat.listCharacters()` | Needed for `current()` even if all you want is the handle. Reads are clamped to what the INSTALLER may see. `listCharacters` is the room's present CHARACTER seats (id/name/avatar) — never humans, never full cards. |
| `chat.variables.write` | `chat.applyVariableOps()` | The room's member-visible plane (macros/CEL/rules read it). Host authority required — flat refusal without it. |
| `chat.quick_reply` | `chat.surfaceQuickReply()` | Host authority required. Always compose-mode. |
| `chat.transform` | `transforms.register()`, `transforms.registerDisplay()`, `macros.register()` | One capability, three seams: prompt (250 ms, host-only rooms), display (your own screen), and value macros. |
| `worldinfo.read` | `worldInfo.listBooks()`, `worldInfo.listEntries()` | The room's ATTACHED lore, member-gated. A book id that is not attached (or not visible to you) answers `[]` — indistinguishable from an empty book, by design. A separate consent line from the write. |
| `worldinfo.write` | `worldInfo.upsertEntry()` | Host authority → otherwise a confirm card. Attached books only; 64 entries per book per plugin. |
| `global_vars` | `variables.get/set/delete()` | The installing user's `{{getglobalvar}}` namespace. |
| `storage.kv` | `storage.get/set/delete/list()` | Your private KV: ≤ 256 keys, ≤ 64 KiB per value, per plugin × owner. |
| `notify` | `notifications.post()` | Participants only. 200-char cap, 60 s per-room cooldown. The DURABLE channel (contrast `ui.toast`). |
| `ui.surface` | the whole declarative UI plane: `ui.register`, `ui.setState`, `ui.registerCommand`, `ui.toast`, `ui.openDialog` | See "The UI plane" below. Renders only for the installer. |
| `ui.frame` | `ui.registerFrame()` | The escape hatch: your own pixels in an isolated frame. Its consent line names the WebRTC residual out loud. See pocket-arcade. |
| `turn.trigger` | `chat.requestTurn()` | **Spend.** Host authority → otherwise a confirm card. |
| `imagery.generate` | `imagery.generatePicture()` | **Spend.** Host authority → otherwise a confirm card. Same args vocabulary as the automation `generate_image` arm. |
| `assets.read` | `assets.read(assetId)` | Read back one of the installer's OWN CAS assets (e.g. the id `generatePicture` just returned) as base64 + mime. Foreign/absent → `null`, leak-free; owned-but-over-1-MiB → metadata with `dataBase64: null`, never a truncated read. |
| `llm.quiet` | `llm.quiet(prompt, opts?)` | **Spend.** 30 calls/hour per plugin. `opts.schema` = structured output on the `structured` role (see keepsake-camera); `opts.imageAssetIds` attaches your installer's own CAS images for vision-capable models. Writes nothing — you get a string. |
| `databank.ingest` | `databank.ingest({name, text})` | A canon write into the installer's OWN databank. Content-hash deduped; the indexer auto-runs. No host authority — your shelves are yours. |
| `search.query` | `search.documents(queryText, opts?)` | Semantic search over the installer's OWN indexed corpus — including what your `databank.ingest` wrote (ingest, then retrieve: first-party RAG). Ranked hits, ≤ 20 per call (default 10). |
| `character.ingest` | `character.ingest(card)` | Import a V2/V3 card (plain JSON) into the installer's OWN library. Byte-identical re-ingests dedupe (`created: false`). |
| `character.card_state` | `character.setCardData()`, `getCardData()` | Your plugin's OWN portable blob on one of the installer's OWN characters (`data.extensions.plugin_<slug>` — host-stamped, unforgeable, survives export→import). |
| `events.subscribe` | `events.on(type, handler)` | The closed trigger taxonomy (`messageCommitted`, `chatOpened`, `turnCompleted`, …). Installed plugins only. |
| `plugin_events` | `pubsub.emit()`, `pubsub.on()` | The PRIVATE plane between YOUR OWN plugins: `plugin:<slug>:<name>` channels, installer-scoped, never a domain event, never automation. See oracle-deck (emit) + scene-chips (listen). |
| `tools.register` | `tools.register()` | Into the one tool registry the model already uses. |
| `net.fetch` | `net.fetch()` | Requires `netHosts`. 120 calls/hour per plugin, 5 s deadline, 1 MiB response cap, SSRF-guarded, GET/POST. |

### The postures — why a call can "succeed" without doing anything

Room-state writes need **host authority** — the installer must host the room the invocation is in. Where
they do not:

* **`worldInfo.upsertEntry`, `chat.requestTurn`, `imagery.generatePicture`** become an **ask**: a card the
  room's host confirms, and your call throws `PluginSuggestedError`. Not a failure — "it became a question".
  Do not retry; retrying only replaces your own pending card.
* **`chat.applyVariableOps` and `chat.surfaceQuickReply`** stay a **flat refusal** — a variable delta is not
  a human-weighable question, and a chip approved after being read is just the chip, delivered late.
* The **library writes** (`databank.ingest`, `character.ingest`, `card_state`) and **`llm.quiet`** need no
  host authority at all — they touch the installer's own things, not room state.

### THE GUARD IDIOM (the one bug every new author writes)

Registrations run at ACTIVATION, and an ungranted host call **throws** — so one unguarded
`host.ui.register(…)` takes your whole plugin down (no tools, no handlers) over a decoration the user simply
did not tick. Every registration in every example sits behind a feature-detect:

```js
if (host.grants.includes("ui.surface")) {
  host.ui.register({ /* … */ });
}
```

Guard at activation, always; feature-detect at USE for capabilities a handler spends (see keepsake-camera);
and when nothing is granted, log ONE clear dormant line so the person can find out why nothing happens.

---

## The realm your code runs in

`orb.host(1)` is the only thing in scope. No `fetch`, no `require`, no `import`, no timers, no `process` —
and **no `Date`**: `new Date()`, `Date.now()`, `Math.random` and `performance.now` all **throw**. Time and
entropy arrive as injected seams (`host.clock.nowEpochMs()`, `host.random.next()`, `host.ids.mint()`), so the
same plugin under the same inputs behaves identically every run — which is what makes plugin behavior
testable. Need a date caption? Arithmetic over epoch ms (see keepsake-camera's `ago()`). The free band also
carries `host.tokens.count(text)` — the host's own token-count estimator, synchronous, no capability, same
answer in both realms (a budgeting heuristic, not the model's tokenizer).

Budgets you cannot see but will meet:

* an invocation has a CPU deadline and a settlement deadline — a handler that never resolves is ended;
* **every HOST CALL rejects after 5 seconds**, however long the underlying work takes. Design slow calls so
  their real deliverable does not depend on the answer (keepsake-camera is the worked example);
* at most 32 host calls in flight per invocation; invocations on one plugin are serialized;
* the log ring is bounded; flooding it drops lines, it does not error;
* **three consecutive crashed invocations auto-disable your plugin** and notify the installer.

That last number is the most important one in this document. **A handler must never throw.** Wrap the body,
log the failure, return. A flaky network, a model having a bad minute, a refusal you expected — none are
defects, and all look identical to a crash if you let them escape.

---

## The UI plane (`ui.surface`)

You never touch the DOM. A surface is a **declarative spec** — a tree of house nodes the APP draws, inside a
frame that names your plugin, themed and accessible for free. Registered at activation like everything else:

```js
host.ui.register({ id, anchor, title, tier, spec, onAction });
```

**Anchors** — where a surface may mount:

| Anchor | What it is | Shown in |
| - | - | - |
| `settings` | your panel in the Plugins pane | affinity-tracker |
| `chat-flank` | a widget beside the transcript | affinity-tracker, story-clocks |
| `chat-settings-section` | the room's HOST-controls band (mounts only for the host) | story-clocks |
| `tool-card` | how one of your tools' calls renders (`toolName` links it) | oracle-deck |
| `page` | a full page behind the app's one **Extensions** rail entry | oracle-deck, keepsake-camera, card-atlas |
| `dialog` | a house modal, opened only by `host.ui.openDialog` from your own action/command | oracle-deck |
| `message-footer` | one STATIC decoration strip under every committed message — static-only, no bindings, ≤ 8 nodes; say one thing quietly | oracle-deck |

**Tiers** — who computes the tree: `static` (the spec lives server-side; values bind with `{ $state }` to
state you publish via `host.ui.setState`) · `scripted` (your `ui.js` computes whole trees in the browser at
native latency — see below) · `frame` (not this plane at all — `ui.registerFrame`, its own capability).

**Nodes**: `stack`/`row`/`section` (layout) · `text`/`badge`/`meter`/`keyValue`/`list`/`image`/`markdown`
(display) · `textField`/`numberField`/`toggle`/`select`/`slider` (form — values are client-side until an
action submits the whole bag) · `button`/`confirmButton` (actions; `confirmButton` gets the HOUSE confirm
dialog — you cannot draw your own) · `grid`/`masterDetail`/`searchBar` (the browse genre — card-atlas is the
tour). Bounds: 32 KiB / 256 nodes / depth 8 per spec; strings capped; no HTML, no CSS, no host chrome — the
impersonation walls are unspellable, not policed.

**Bindings and state.** Any display value may be `{ $state: "path.in.state" }`, resolved against what you
last published. `setState(surfaceId, state)` publishes plugin-wide; `setState(surfaceId, state, chatHandle)`
publishes PER ROOM — pick the scope that matches what the data is about (story-clocks vs keepsake-camera's
album). A bound surface renders NOTHING until its state lands, so publish once at activation if an empty
state is honest. Two BOUND-COLLECTION arms make cardinality data instead of structure: a grid's
`tilesFrom: { $state }` (an array of `{id, title, subtitle?, badge?, assetId?, alt?}`, validated and clamped
at resolve) with one grid-level `tileAction`, and an image's `assetFrom: { $state }`. State-sourced asset ids
pass the same format wall and the same owner-scoped resolve as declared ones — a foreign id paints nothing.

**Commands** (`ui.registerCommand`) ride `/plugin <your-slug> <name> …`, the Plugins wand menu, and the
command palette. Declare typed `args` (string/number/enum/boolean, required?) and the platform collects,
autocompletes and validates them on both surfaces before `onRun` sees the typed `values` bag; the raw `args`
remainder always arrives too. **Toasts** (`ui.toast`) are transient, app-stamped with your name, rate-floored
(10 s per plugin), and delivered on the round-trip the person just made — durable notices are `notify`.
**Dialogs** open only via `ui.openDialog(id)` of your OWN registered `dialog` surface, only as a round-trip
outcome: spontaneous modals are unspellable.

### The scripted tier (`ui.js`, Tier C)

For surfaces that must THINK between keystrokes (a filter box, local sorting), ship `ui.js`: it runs in a
sandboxed interpreter in the user's browser. `orb.ui(1)` gives you `render(surfaceId, tree)` (publish a whole
tree — same vocabulary), `onEvent(handler)` (receives `{surfaceId, event, values}`, where `event` is
`{type:"action", actionId}` or `{type:"field", name, value}`), the same `log`/`clock`/`random` seams, and
`host.*` — a READ-ONLY-ish relay of exactly nine functions (`chat.listMessages`, `chat.getVariables`, the
`variables` and `storage` planes), each re-gated server-side per call. No fetch, no writes, no registrations
— effects belong to the server half. The affinity-tracker's `ui.js` is the annotated template, including the
three rules that keep a scripted surface alive (render immediately; never block; batch host calls).

---

## The other seams, each with its worked example

* **Tools** (`tools.register`) — oracle-deck. Your name is prefixed to `plugin_<slug>_<name>`; the returned
  STRING is what the model reads, verbatim; return a JSON document if you also draw a card from it.
* **Prompt transforms** (`transforms.register`) — draft-polish. 250 ms, no I/O, rooms you host.
* **Display transforms** (`transforms.registerDisplay`) — draft-polish. Your own screen only, after your
  macros and display regex, before markdown; skip-on-failure.
* **Macros** (`macros.register`) — oracle-deck. A VALUE macro: no arguments, resolved once per turn,
  host-namespaced to `plugin_<slug>_<name>`, degrades to `""`.
* **Events** (`events.on`) — research-familiar, scene-chips, story-clocks. Delivery is pre-filtered to what
  the INSTALLER may see; `chatOpened` is the hydration moment for per-room surfaces.
* **The private event plane** (`pubsub.emit`/`on`) — oracle-deck announces, scene-chips listens. Installer-
  scoped, absence-tolerant, payload-complete (a subscriber has no chat scope).
* **The library writes** — research-familiar (`databank.ingest`), card-atlas (`character.ingest` +
  `card_state` provenance stamps).

## Debouncing is your job

Two capabilities carry host-side hourly floors (`net.fetch` 120, `llm.quiet` 30). **Nothing else does** —
event delivery has no rate belt at all. The floors are backstops, not budgets. Every example debounces
differently on purpose: the familiar's explicit marker + memory + gap; the tracker's every-Nth counter; the
chips' claimed-before-spent cooldown. Claim a budget BEFORE you spend it — two deliveries can be in flight.

## What plugins cannot do (stated so you do not design around it)

* **No host DOM, ever.** The declarative plane + the frame hatch ARE the UI story.
* **No arbitrary pixels in the vocabulary** — that is what `ui.frame` is for, behind its own consent line
  (and with no network and no host calls inside; pocket-arcade shows the honest shape). A surface expressible
  in the vocabulary must ship in the vocabulary.
* **No remote images.** An `image`/tile cover is an asset in the installer's own CAS — a URL is unspellable.
* **No stable room identity in a tool handler** (the handle is per-invocation; key tool state per install).
* **No fetching transform** (250 ms vs 5 s — structurally incompatible), and no timers anywhere: time-driven
  behavior rides automation rules, not sleeping guests.
* **No cross-plugin or cross-user reach.** Storage, surfaces, channels and stamps are all keyed to you and
  your installer; the pubsub plane reaches only the same installer's plugins.
* **No module system at runtime.** One file per entry; bundle ahead of time.

---

## Where these files live, and why they are not in a top-level `examples/`

The deployed image copies `packages/*/src` and nothing else, and the per-user seeder reads these sources at
runtime to pack each bundle. A repo-root `examples/` directory would not exist in a running container. They
sit here, beside the seeded avatars and the seeded example transcripts, for the same reason those do — and
`host-v1.d.ts` sits here with them so the SDK folder is one folder.
