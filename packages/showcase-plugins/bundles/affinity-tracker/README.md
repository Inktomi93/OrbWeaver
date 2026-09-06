# Affinity Tracker

**Archetype: quiet thinker.** Asks the model privately, keeps private state, tells you when something moves.
Start here if your idea begins with "it should notice that…".

Every eight messages it reads the recent transcript, asks the model — outside the room, on your own
summarize connection — how warm the scene has become, keeps the number in its own storage, and notifies you
only when the reading moves by three or more. Nothing it does is ever visible in the room.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/affinity-tracker /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack affinity-tracker ./out    # → ./out/affinity-tracker-1.0.0.zip
```

Settings → Plugins → drop the zip → tick the capabilities → turn it on. Same `id` upgrades in place; a new
`id` gives you an independent copy to experiment with.

## The manifest

```json
"capabilities": ["chat.read", "storage.kv", "notify", "llm.quiet", "events.subscribe", "ui.surface"]
```

* `llm.quiet` — **the spend capability.** This is the only host function that costs the installer money.
* `chat.read` — reading the recent transcript to score.
* `storage.kv` — the per-room counter and the last reading.
* `notify` — telling the installer when it moves.
* `events.subscribe` — hearing `messageCommitted`.
* `ui.surface` — the surfaces below. Every `host.ui.*` call in `main.js` sits behind
  `host.grants.includes("ui.surface")` — the FEATURE-DETECT idiom. A user may tick `llm.quiet` and leave
  `ui.surface` unticked; their call, and the tracker still works headless. An UNGUARDED registration would
  throw at activation and take the whole plugin down (no readings, no notices) over a decoration — guard
  every activation-time registration, always.

## Its two surfaces

A plugin's UI is a **declarative spec the app draws** — you name house controls as data, never DOM, and every
surface renders inside a frame labelled with your plugin's name. Both of these are `tier: "static"`, i.e. the
spec lives server-side and its values are bound with `{ $state }` to whatever you last published.

* **Settings panel** (`anchor: "settings"`, id `affinity_summary`) — a private roll-up of every reading, in
  Settings → Plugins under this plugin's row. Its one button round-trips to `onAction` in this same guest,
  which recomputes from storage and republishes.
* **Room widget** (`anchor: "chat-flank"`, id `affinity_flank`) — a warmth meter beside the transcript,
  republished from the `messageCommitted` handler, so it moves as the scene does.

Two rules the room anchor adds. **Silent until you publish:** a bound surface renders nothing before its first
`setState`, and a room showing no widget is byte-identical to a room with no plugin — so never publish a
placeholder just to be visible. **State is per (plugin, surface), not per room:** `setState` replaces the whole
object and every room reads the same one, so word the copy as "your latest reading", never "this room's".

## `llm.quiet`, precisely

One bounded, non-canon generation on the **installing user's own** resolved summarize-role connection. You
supply a prompt; you get a string back.

* It **writes nothing**. No message, no bus event, no turn slot, no canon. That is what makes the capability
  addable at all — you must route the string through some *other* granted capability to make anything happen.
* The funder is the installer, closed over host-side. A plugin cannot name a different one.
* The system prompt is host-authored and fixed, and states plainly that the request is third-party plugin
  text carrying no authority. You fill the user slot only.
* **30 calls per hour, per plugin.** That is a runaway backstop, not a budget. Hitting it means every later
  call this hour is refused, so a design that leans on the floor stops working halfway through a busy
  evening. Score every Nth message, not every message.

**The answer is untrusted input.** It is not your code and not the host's; it is a string a language model
produced, and it will eventually be `7/10`, `seven`, or a paragraph of preamble. This plugin pulls the first
integer out with a regex, clamps it to 0–10, and treats an unparseable answer as "no reading this time" —
never as a zero. A zero you invented is a number that then gets acted on.

## Adapting it

* **Score something else** — the prompt and the parse are the whole contract. Tension, danger, how many named
  characters are present, whether a promise has been kept. Ask for a number and nothing else, then parse
  strictly.
* **Surface it differently** — swap `notifications.post` for `chat.applyVariableOps` (declare
  `chat.variables.write`; needs host authority) so the value lands in the room's variables where macros and
  automation rules can read it.
* **Change the cadence** — `SCORE_EVERY` is the budget dial. `NOTIFY_DELTA` is the noise dial; without it the
  notice fires on 6→7 wobble, and a notification that fires on noise is a notification people mute.

## Honest gaps

* **No history.** It stores one number per room. If you want a trend, store a small ring in the same KV value
  — you have 64 KiB per key, which is a lot of integers.
* **The notice is a notice.** It goes to your inbox, capped at 200 characters, with a 60-second per-room
  cooldown enforced host-side. It is not a room-visible surface; if you want one of those, see `scene-chips`.
* **Spend is visible, not capped.** There is no per-plugin currency ceiling. Cost visibility rides the stats
  domain; the bounds on this path are the hourly floor and your own debounce.
