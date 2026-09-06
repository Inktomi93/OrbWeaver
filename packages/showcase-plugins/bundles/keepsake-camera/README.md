# Keepsake Camera

**Archetype: the spend pipeline.** Chains the two paid capabilities into one product moment. Start here if
your idea begins with "generate something from the scene…".

`/plugin keepsake-camera snapshot` reads the last few beats, asks the model — privately, structured — for a
title and a painting prompt, and paints the moment into the room as a postcard. Every keepsake the camera
catches also lands in its album page under the Extensions rail.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/keepsake-camera /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack keepsake-camera ./out
```

## The manifest

```json
"capabilities": ["chat.read", "storage.kv", "llm.quiet", "imagery.generate", "ui.surface"]
```

`llm.quiet` (30/hour per plugin) and `imagery.generate` are SPEND — they run on the installer's own
connections and cost real money. Both are feature-detected at USE, so a partial grant degrades to a clear
sentence: without `llm.quiet` the titling falls back to a local one; without `imagery.generate` the whole
camera says why it cannot click.

## How it works — the three lessons

1. **Structured output.** `host.llm.quiet(prompt, { schema })` routes to the installer's `structured`-role
   connection and constrains the answer to your JSON Schema. You get the model's JSON back AS TEXT — parse
   it, and STILL clamp every field (`parseKeepsake`): a schema constrains shape, not length or sense.
   Contrast with the affinity-tracker's prose-and-strict-parse; reach for the schema when you need more than
   one field back.

2. **The host-call deadline, designed around.** Every host function rejects the guest after a fixed
   real-time bound (5 s), and an image generation routinely takes longer. So the slow call's REAL deliverable
   is made independent of its answer: `quiet: false` means the pipeline posts the finished postcard to the
   ROOM whether or not this guest is still listening. When the call answers in time, the camera "catches" the
   keepsake into the album; when it times out, the room still gets its postcard and the toast says the album
   missed one. **A pipeline that NEEDS a slow call's answer breaks on every slow backend.**

3. **Host authority on spend.** `imagery.generate` in a room the installer does not host becomes a CONFIRM
   CARD for the room's host — the call throws `PluginSuggestedError`, which means "it became a question", not
   "it failed". Catch it by `.name` and tell the person.

## The album (the bound-collection vocabulary)

The album page is a `masterDetail` whose browse stage is a BOUND grid — `tilesFrom: { $state: "tiles" }` —
so the tile COUNT is data: one keepsake is one tile, never ghost slots. The detail stage's picture is a BOUND
image (`assetFrom`), and its `open`/`back`/`discard` navigation is ordinary published state, so leaving the
Extensions section and returning lands where you were. Published with NO chat handle: the album is a
cross-room roll-up (the deliberate contrast with the story-clocks' per-room `setState(…, chat)`).

One realm rule this file paid for so you don't: **there is no `Date` in the guest.** `new Date(x)` THROWS
(the determinism stubs) — time exists only as `host.clock.nowEpochMs()`, so the "kept … ago" caption is plain
arithmetic over the injected clock.

## Adapting it

* **Different subjects** — portraits (`mode` + `subjectCharacterId` on the same args), locations, item cards:
  the pipeline shape (read → title → paint → keep) carries.
* **Different triggers** — an `events.on("messageCommitted")` arm could auto-snapshot chapter breaks; budget
  it like the affinity-tracker (every Nth, never every) because BOTH halves of this pipeline are spend.
* **No titling model** — drop `llm.quiet` from the manifest entirely; the local fallback already carries the
  camera.

## Honest gaps

* **The album only keeps what the camera catches in time** (the deadline design above). The room's transcript
  is the complete record; the album is the fast-path bonus.
* **The style list is the plugin's taste.** Four suffixes in `STYLES`; the image model's own vocabulary is
  far richer — the `note` arg is the escape valve.
