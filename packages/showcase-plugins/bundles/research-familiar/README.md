# Research Familiar

**Archetype: event reactor.** Watches the room, reaches the network, writes lore. Start here if your idea
begins with "when someone says/does X, then…".

Write `((lookup: Aurora borealis))` in a room and the familiar searches your indexed corpus first, falls back
to Wikipedia, and files a short result as a world-info entry so every later turn in that room can use it.
Library search may use your configured hosted embedding provider and charge your credential; the host caps it
at 120 queries an hour for this plugin.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/research-familiar /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.ts, build the checked JavaScript, then pack and install:
pnpm --filter @orb/showcase-plugins build
pnpm plugin:pack research-familiar ./out    # → ./out/research-familiar-1.3.0.zip
```

Settings → Plugins → drop the zip → tick the capabilities → turn it on. Keep the same `id` and it upgrades
your existing copy (storage survives, widened reach re-asks for consent). Change the `id` and you get an
independent second plugin — which is what you want while experimenting.

## Turning it on

Open Settings → Plugins → Research Familiar → Choose lore book. Select one of your owned books in the configuration dialog.

The picker writes `familiar_book_id` in your own global-variable namespace. The guest receives your selected id, not your book catalog.

Attach the selected book to each room where you want lookup results. Selection is configuration, not room write consent.

The familiar checks actual room attachment before searching or writing. A missing destination or required permission produces a private installer notice once.

Allow `notify` and `chat.read` to receive notices. With `storage.kv`, notice memory survives reactivation. A missing Wikipedia article remains quiet.

## The manifest

```json
"capabilities": ["chat.read", "worldinfo.read", "worldinfo.write", "global_vars", "storage.kv", "search.query", "events.subscribe", "net.fetch", "databank.ingest", "ui.surface", "notify"],
"netHosts": ["en.wikipedia.org"]
```

* `events.subscribe` — to hear `messageCommitted` at all.
* `net.fetch` — the Wikipedia request. **Requires `netHosts`**, and that list is the wall for guest network
  requests: the host pins every request and redirect hop to `en.wikipedia.org`. The separate `search.query`
  host call may send query text to your configured embedding provider.
* `worldinfo.write` — the `((lookup: …))` entry it files.
* `worldinfo.read` — verifies the configured book is attached to the current room before searching or writing.
* `search.query` — searches your indexed corpus first. Its query embedding may use a hosted, paid provider;
  the per-plugin ceiling is 120 queries an hour. An empty result falls back to Wikipedia.
* `databank.ingest` — the `((clip: …))` document it keeps (below).
* `chat.read` — needed for `chat.current()`, which mints the room handle every room-scoped call takes. Worth
  knowing when you are trimming a grant list: you cannot write to a room without being able to name it.
* `global_vars` — reading the configured book id.
* `storage.kv` — its private memory of what it has already looked up.
* `ui.surface` — the settings action and explicitly opened configuration dialog.
* `notify` — private configuration and required-permission notices to the installer, never the whole room.

## Two verbs, two destinations — the capability lesson

The same researched subject has two honest homes, and the difference between them is worth internalizing
before you design your own writes:

* **`((lookup: Term))` → a LORE BOOK** (`worldInfo.upsertEntry`). Room state: injected into every later
  prompt, so the excerpt is CUT short (a 4 KB entry taxes every turn forever); host-authority gated; needs a
  configured destination.
* **`((clip: Term))` → YOUR DATABANK** (`databank.ingest`). Your own library: the WHOLE summary, indexed for
  retrieval, deduped by content hash host-side (re-clipping identical text returns the same document). No
  destination to configure and no host authority to ask — a write into your own shelves is your own reach.

Each verb feature-detects its own grant at the moment of use: a marker for an unticked capability logs one
clear warning and a private notice when notification permissions allow it. It does not throw for a withheld grant.

## How it works

1. `events.on("messageCommitted", …)` — registered once at activation.
2. Delivery is filtered before your code runs: you only receive facts for rooms the **installer** can see
   (membership, plus the history floor, plus hidden-span stripping), and only human-caused ones unless the
   manifest opts in.
3. `admit()` runs the debounce chain, cheapest first — regex on the message, then two private-KV reads, then
   the config read. In a busy room the first line runs thousands of times and stops there.
4. For a lookup, `worldInfo.listBooks` verifies the configured destination is attached to this room, then
   `search.documents` checks the installer's indexed corpus.
5. An empty local result falls back to a fetch through the host, which enforces the allowlist, a 5 s deadline
   and a 1 MiB response cap, and answers a plain `{status, body}`.
6. `worldInfo.upsertEntry` files it. `entryKey` is the idempotency key: writing it again updates the same
   entry instead of adding a second.

## Adapting it

* **Different trigger** — change `LOOKUP_RE`, or subscribe to a different type. The taxonomy is closed
  (`messageCommitted`, `chatOpened`, `turnCompleted`, `character.updated`, …); an unknown type is refused at
  registration.
* **Different source** — change `SUMMARY_URL` **and** `manifest.netHosts` together. A URL whose host is not
  declared is refused, silently and correctly.
* **Somewhere else to put it** — swap `worldInfo.upsertEntry` for `storage.set` (private), `variables.set`
  (your global namespace) or `notifications.post` (a notice). Each is a different capability to declare.

## Honest gaps

* **You must host the room.** World-info writes need host authority. In a room the installer does not host,
  the write becomes a **confirm card** for the room's host and the call throws `PluginSuggestedError` — which
  the handler catches by name and logs. Nothing is lost, but nothing lands until someone says yes.
* **The destination must be attached.** The settings picker does not attach the book or grant room authority.
* **Wikipedia fetches are rate-floored at 360/hour per plugin; library queries at 120/hour per plugin.** There is no rate belt on event delivery —
  which is exactly why the marker and the two debounce layers are not optional decoration.
* **Macros in fetched text are neutralised** before storage. World-info content is macro-rendered later, at
  assembly, and that render can mutate chat state — so raw text from the internet is made inert first. Your
  entry will read identically to a human and do nothing as a macro.
