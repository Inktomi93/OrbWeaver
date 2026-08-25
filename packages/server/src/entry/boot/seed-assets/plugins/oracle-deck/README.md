# Oracle Deck

**Archetype: tool provider.** Gives the model something it can call mid-turn. Start here if your idea begins
with "the narrator should be able to…".

Two tools: `draw` deals cards from a shuffled deck, `reveal` discloses the seed that produced the shuffle. The
narrator can say "the cards say…" and mean it, because the order was fixed — and publicly committed to —
before the first card was dealt.

## Copy me

```bash
cp -r packages/server/src/entry/boot/seed-assets/plugins/oracle-deck /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack oracle-deck ./out    # → ./out/oracle-deck-1.0.0.zip
```

Settings → Plugins → drop the zip → tick the capabilities → turn it on. Same `id` upgrades your existing copy
(private storage survives); a new `id` gives you an independent second plugin.

## The manifest

```json
"capabilities": ["storage.kv", "tools.register"]
```

Two capabilities and no network, no model, no room writes — which is the point of this archetype. A tool
provider is usually the cheapest thing you can build and the easiest one for a user to say yes to.

## How it works

`tools.register({name, description, parameters, handler})` runs once at activation. The host prefixes your
name — `draw` becomes `plugin_oracle_deck_draw` — and puts it in the same tool registry every first-party
tool lives in, so the model reaches it exactly the way it reaches anything else. Your `handler` runs inside
the sandbox on your grants, and **whatever string it returns is what the model reads, verbatim**: a handler
that returns `JSON.stringify(x)` hands the model exactly that JSON, unwrapped and un-re-encoded.

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

## Adapting it

* **A different deck** — replace `DECK`. Note that this is a breaking change to every commitment already
  printed in a transcript: a verifier needs the same deck to check a reveal.
* **A different tool entirely** — the shape is `register({name, description, parameters, handler})` and
  nothing about it is card-specific. A dice roller, a lookup table, a unit converter, a name generator are all
  the same twenty lines.
* **Room-aware tools** — declare `chat.read` and call `host.chat.current()` inside the handler to get the
  invocation's room handle. See the gap below before you plan around it.

## Honest gaps

* **No custom rendering, and this one is worth reading twice.** A plugin cannot register a client tool
  renderer — the registry is first-party and assembled at build time — so your tool's call and result render
  in the **generic tool block**. "Provably fair" survives intact (the draw is on canon, visibly); bespoke card
  art does not. Write your result string so it reads well as plain text, because plain text is what the room
  gets. A plugin renderer plane does not exist and is not scheduled.
* **No stable room identity.** The chat handle a tool invocation can obtain is a fresh opaque token each
  time, so a tool handler cannot key state per room. This deck is therefore ONE deck per install, shared
  across your rooms. (Event handlers do not have this problem — their fact carries the chat id.)
* **The commitment is a checksum, not a hash.** The guest realm ships no crypto, so the commitment is FNV-class
  arithmetic: tamper-**evident** against a careless swap, not tamper-**proof** against a determined one. Said
  plainly because a fairness claim you cannot cash is worse than no claim at all.
