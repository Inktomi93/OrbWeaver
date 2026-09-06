# Story Clocks

**Archetype: room mechanics.** Writes ROOM state other machinery can read. Start here if your idea begins
with "the room should keep track of…".

Blades-in-the-Dark progress clocks: the host starts and ticks them from the room's host controls, the model
ticks them mid-turn through a tool, a flank widget shows them filling — and when a human tick FILLS one, the
plugin asks the narrator to take a turn and make it matter.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/story-clocks /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack story-clocks ./out
```

## The manifest

```json
"capabilities": ["chat.read", "chat.variables.write", "turn.trigger", "events.subscribe", "tools.register", "ui.surface"]
```

`turn.trigger` is SPEND (a filled clock asks for a paid model turn) — everything else is free. Note what is
NOT here: `storage.kv`. This plugin keeps no private state at all, and that absence is the lesson.

## How it works — the two state planes

A plugin has TWO writable planes, and choosing between them is this archetype's whole design decision:

* **`storage.kv`** — private, per plugin × installer. Nobody else can read it. Counters, cooldowns,
  sessions (see the affinity-tracker and the oracle-deck).
* **CHAT VARIABLES** (`chat.applyVariableOps`) — the room's member-visible plane: the same store `{{getvar}}`
  macros read, CEL predicates test, and automation rules react to.

A clock is ROOM state, so it lives in the room: `clock:the_ritual = "3/6"`. That one decision buys free
composition — a member can put `{{getvar::clock:the_ritual}}` in an author's note, and a rule can fire when
the value hits `"6/6"`, with zero code in this plugin. **When your state is ABOUT the room, put it IN the
room.**

The price of that plane is HOST AUTHORITY: `applyVariableOps` works only where the installer hosts the room
(a flat refusal elsewhere — a variable delta is not a human-weighable ask, so it never becomes a confirm
card). The host-controls surface (`chat-settings-section`) only MOUNTS for the host, so the human path is
coherent by construction; the model's tool path catches the refusal and answers the model in prose.

## The surfaces

* **`chat-settings-section`** — the host-controls band. The one anchor that is host-gated at the MOUNT, which
  is why it is the right home for room configuration.
* **`chat-flank`** — the read-only clock readout, published PER ROOM (`host.ui.setState(id, state, chat)` —
  the third argument keys the row to the room; omit it and every room shows the same publication).
* **`events.on("chatOpened")`** — the hydration idiom every per-room widget wants: a bound surface renders
  nothing until state is published for that room, so publish when the room opens.

## Adapting it

* **Different mechanics, same plane** — HP pools, faction reputation, weather, doom counters: all of them are
  `applyVariableOps` writes + a flank readout + (optionally) a tool so the model can move them.
* **Let rules react** — an automation rule on `messageCommitted` with a CEL predicate over
  `vars["clock:…"]` turns a filled clock into anything the rules plane can do. This plugin deliberately
  leaves that to the rules.
* **The fill consequence** — `narrateFill` shows the `chat.requestTurn` shape: guided, budget-gated,
  suggest-shaped (in a non-hosted room it becomes a confirm card and throws `PluginSuggestedError`, which is
  an outcome, not an error).

## Honest gaps

* **The readout updates on the plugin's own writes + `chatOpened`.** A variable someone ELSE changes (a rule,
  a `{{setvar}}` macro) is picked up on the next open or the next action — there is no "variable changed"
  trigger in the taxonomy today.
* **Four clocks per room, fixed slots.** A static surface declares its nodes up front, so the flank carries
  four line slots; unused ones publish `""` and render as nothing. (Dynamic-count collections exist for
  GRIDS — `tilesFrom`, see the card-atlas — but a clock list wants lines, and four is a table's honest
  attention budget anyway.)
* **The tool trusts the model's spelling.** `advance_clock` slugs whatever name the model says; `the ritual`
  and `the Ritual` are one clock, but `ritual` is another. The tool description tells the model to reuse
  names; a stricter design would enumerate live clocks in the description per call, at the cost of a
  re-registration dance this example keeps out of scope.
