# Research Familiar

**Archetype: event reactor.** Watches the room, reaches the network, writes lore. Start here if your idea
begins with "when someone says/does X, then…".

Write `((lookup: Aurora borealis))` in a room and the familiar fetches the Wikipedia summary for it and files
it as a world-info entry, so every later turn in that room can use it. Zero model spend — it reads an
encyclopedia, not an LLM.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/research-familiar /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack research-familiar ./out    # → ./out/research-familiar-1.0.0.zip
```

Settings → Plugins → drop the zip → tick the capabilities → turn it on. Keep the same `id` and it upgrades
your existing copy (storage survives, widened reach re-asks for consent). Change the `id` and you get an
independent second plugin — which is what you want while experimenting.

## Turning it on

It needs one thing you have to give it: the lore book to write into. A plugin cannot browse your books — the
host surface exposes `worldInfo.upsertEntry` and nothing else — so it reads the target from your own global
variable namespace. From any chat:

```
{{setglobalvar::familiar_book_id::wib_your_book_id_here}}
```

Until that is set the familiar stays completely inert and says so in its log. That is deliberate: a plugin
that guesses where to write is a plugin that writes somewhere you did not mean.

## The manifest

```json
"capabilities": ["chat.read", "worldinfo.write", "global_vars", "storage.kv", "events.subscribe", "net.fetch", "databank.ingest"],
"netHosts": ["en.wikipedia.org"]
```

* `events.subscribe` — to hear `messageCommitted` at all.
* `net.fetch` — the outbound request. **Requires `netHosts`**, and that list is the wall: the host pins every
  request and every redirect hop to it. The guest cannot widen it, and `en.wikipedia.org` is the only place
  this plugin can ever reach.
* `worldinfo.write` — the `((lookup: …))` entry it files.
* `databank.ingest` — the `((clip: …))` document it keeps (below).
* `chat.read` — needed for `chat.current()`, which mints the room handle every room-scoped call takes. Worth
  knowing when you are trimming a grant list: you cannot write to a room without being able to name it.
* `global_vars` — reading the configured book id.
* `storage.kv` — its private memory of what it has already looked up.

## Two verbs, two destinations — the capability lesson

The same fetch has two honest homes, and the difference between them is worth internalizing before you
design your own writes:

* **`((lookup: Term))` → a LORE BOOK** (`worldInfo.upsertEntry`). Room state: injected into every later
  prompt, so the excerpt is CUT short (a 4 KB entry taxes every turn forever); host-authority gated; needs a
  configured destination.
* **`((clip: Term))` → YOUR DATABANK** (`databank.ingest`). Your own library: the WHOLE summary, indexed for
  retrieval, deduped by content hash host-side (re-clipping identical text returns the same document). No
  destination to configure and no host authority to ask — a write into your own shelves is your own reach.

Each verb feature-detects its own grant at the moment of use: a marker for an unticked capability logs one
clear warning and stays silent, never a throw (a throw is a strike against the three-crash auto-disable).

## How it works

1. `events.on("messageCommitted", …)` — registered once at activation.
2. Delivery is filtered before your code runs: you only receive facts for rooms the **installer** can see
   (membership, plus the history floor, plus hidden-span stripping), and only human-caused ones unless the
   manifest opts in.
3. `admit()` runs the debounce chain, cheapest first — regex on the message, then two private-KV reads, then
   the config read. In a busy room the first line runs thousands of times and stops there.
4. The fetch happens through the host, which enforces the allowlist, a 5 s deadline and a 1 MiB response cap,
   and answers a plain `{status, body}`. There is no `Response` object in the guest realm.
5. `worldInfo.upsertEntry` files it. `entryKey` is the idempotency key: writing it again updates the same
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
* **No book browsing.** The global-variable dance above exists because there is no "list my books" host
  function. If that changes, this plugin gets simpler.
* **Egress is rate-floored at 120/hour per plugin**, and there is no rate belt on event delivery at all —
  which is exactly why the marker and the two debounce layers are not optional decoration.
* **Macros in fetched text are neutralised** before storage. World-info content is macro-rendered later, at
  assembly, and that render can mutate chat state — so raw text from the internet is made inert first. Your
  entry will read identically to a human and do nothing as a macro.
