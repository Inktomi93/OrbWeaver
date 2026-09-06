# Oracle Deck

**Archetype: tool provider.** Gives the model something it can call mid-turn. Start here if your idea begins
with "the narrator should be able to…".

Two tools: `draw` deals cards from a shuffled deck, `reveal` discloses the seed that produced the shuffle. The
narrator can say "the cards say…" and mean it, because the order was fixed — and publicly committed to —
before the first card was dealt.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/oracle-deck /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack oracle-deck ./out    # → ./out/oracle-deck-1.0.0.zip
```

Settings → Plugins → drop the zip → tick the capabilities → turn it on. Same `id` upgrades your existing copy
(private storage survives); a new `id` gives you an independent second plugin.

## The manifest

```json
"capabilities": ["storage.kv", "tools.register", "ui.surface", "chat.transform", "plugin_events"]
```

No network, no model spend, no room writes — the deck's core is still the cheapest archetype there is.
`ui.surface` draws the whole UI plane (the card, the page, the dialog, the command, the footer mark); drop it
and the tools still work, in the generic block. `chat.transform` carries the omen MACRO (a macro substitutes
into the prompt, which is that capability's reach), and `plugin_events` lets the deck ANNOUNCE its draws to
your other plugins. Every registration feature-detects its grant, so any subset of ticks still activates.

## How it works

`tools.register({name, description, parameters, handler})` runs once at activation. The host prefixes your
name — `draw` becomes `plugin_oracle__deck_draw` — and puts it in the same tool registry every first-party
tool lives in, so the model reaches it exactly the way it reaches anything else. Your `handler` runs inside
the sandbox on your grants, and **whatever string it returns is what the model reads, verbatim**: a handler
that returns `JSON.stringify(x)` hands the model exactly that JSON, unwrapped and un-re-encoded. `draw`
returns a **document** rather than a sentence for exactly that reason: the same fields the model reads are the
fields its card binds (`{ $state: "result.commitment" }` reads the result of the call being drawn).

`parameters` is raw JSON Schema, validated host-side. Keep it small and literal — that text is what the model
plans against.

### The commit-and-reveal mechanism

1. The first `draw` of a session mints a secret seed (`host.ids.mint()`) and prints a **commitment** derived
   from it. The commitment lands in the transcript, where it cannot be edited invisibly.
2. Every later `draw` deals the next card of the shuffle that seed determines.
3. `reveal` prints the seed and the full order, and retires the session. Anyone can recompute the commitment
   from the seed and check that the cards dealt are the cards that seed produces.

The shuffle uses a tiny in-file PRNG (MINSTD) seeded by a tiny in-file hash — **not** `host.random.next()`.
That is the whole trick: a shuffle drawn from the host PRNG could never be re-derived from a published seed,
because the verifier has no access to that stream. The host seam mints the SECRET; plain arithmetic turns the
secret into the ORDER. Both functions are five lines each so a suspicious player can re-implement them.

## The whole UI plane, in one plugin

Beyond the tool card, this file is the tour of every person-facing affordance a plugin has — each a few
lines, each labeled in `main.js`:

* **A command with TYPED ARGS** — `/plugin oracle-deck draw count=2` or `draw spread=past_present_future`.
  Declaring `args` (name/type/enum/required) buys the platform half free: the palette shows typed inputs, the
  composer autocompletes `name=value`, both sides validate before your code runs, and `onRun` receives a
  well-typed `values` bag. `reveal` declares none — the two shapes side by side.
* **A PAGE** (`anchor: "page"`) — the deck's dashboard behind the app's one Extensions rail entry.
* **A DIALOG** (`anchor: "dialog"`) — the reveal, opened only by `host.ui.openDialog` from the deck's OWN
  command or page action. A plugin structurally cannot open a modal spontaneously.
* **TOASTS** — the answer to every command (`host.ui.toast`), app-stamped with the plugin's name,
  rate-floored (10 s per plugin — two toasts inside the floor deliver one).
* **The OMEN MACRO** — `{{plugin_oracle__deck_omen}}` substitutes the session's most recent card anywhere
  macros run. A plugin macro is a VALUE (no arguments — the engine is synchronous and a guest is not),
  resolved once per turn, host-namespaced, and it degrades to `""` rather than ever throwing.
* **The DRAW ANNOUNCEMENT** — `host.pubsub.emit("draw", {...})` on the deck's private channel. Any of YOUR
  plugins can subscribe (`pubsub.on("oracle-deck", "draw", …)`) — the seeded scene-chips does, and offers an
  omen-flavored door after a draw. Emitting to nobody is free; put everything a listener needs IN the payload
  (a subscriber runs with no chat scope).
* **The FOOTER MARK** (`anchor: "message-footer"`) — the smallest legal per-row occupant: one static badge.
  Footers are static-only decoration (no bindings, no buttons, ≤ 8 nodes) repeated under every committed
  message — say one thing, quietly, or say nothing.

## Adapting it

* **A different deck** — replace `DECK`. Note that this is a breaking change to every commitment already
  printed in a transcript: a verifier needs the same deck to check a reveal.
* **A different tool entirely** — the shape is `register({name, description, parameters, handler})` and
  nothing about it is card-specific. A dice roller, a lookup table, a unit converter, a name generator are all
  the same twenty lines.
* **Room-aware tools** — declare `chat.read` and call `host.chat.current()` inside the handler to get the
  invocation's room handle. See the gap below before you plan around it.

## Honest gaps

* **No arbitrary pixels in the VOCABULARY.** The card is house components declared as data — an image per
  card or a canvas is not spellable there. (Bespoke pixels DO exist now, behind their own consent line: the
  `ui.frame` hatch — see the pocket-arcade example — and `tool-card` is a frame-eligible anchor. The
  declarative card remains the recommended shape; the hatch is the last resort.) A card is **optional and per
  tool** — `reveal` registers none, so a reveal renders in the generic block, which is also the fallback
  whenever a card cannot be drawn (a tool call is part of the record; the app never renders nothing for one).
* **No stable room identity.** The chat handle a tool invocation can obtain is a fresh opaque token each
  time, so a tool handler cannot key state per room. This deck is therefore ONE deck per install, shared
  across your rooms. (Event handlers do not have this problem — their fact carries the chat id.)
* **The commitment is a checksum, not a hash.** The guest realm ships no crypto, so the commitment is FNV-class
  arithmetic: tamper-**evident** against a careless swap, not tamper-**proof** against a determined one. Said
  plainly because a fairness claim you cannot cash is worse than no claim at all.
