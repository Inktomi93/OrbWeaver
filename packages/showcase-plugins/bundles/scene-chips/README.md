# Scene Chips

**Archetype: room surface.** Puts something the whole room can see under the composer. Start here if your
idea begins with "there should be a button for…".

When the narrator lands a long beat, three chips appear: *Continue · Time skip · New scene*. Clicking one
drops its text into your composer, where you edit it and send it as your own line.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/scene-chips /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack scene-chips ./out    # → ./out/scene-chips-1.0.0.zip
```

Settings → Plugins → drop the zip → tick the capabilities → turn it on. Same `id` upgrades in place; a new
`id` gives you an independent copy.

## The manifest

```json
"capabilities": ["chat.read", "chat.quick_reply", "storage.kv", "events.subscribe", "plugin_events"]
```

* `chat.quick_reply` — the chips themselves.
* `chat.read` — for `chat.current()`, which mints the room handle the surface call takes.
* `events.subscribe` — hearing `messageCommitted`.
* `storage.kv` — the per-room cooldown stamp (and the noted omen, below).
* `plugin_events` — LISTENING to your other plugins (the composition demo, below).

## Listening to a sibling (`pubsub.on`)

Install the Oracle Deck too and the table starts playing together: the deck ANNOUNCES every draw on its
private channel, this plugin subscribes (`host.pubsub.on("oracle-deck", "draw", …)`), notes the card in its
own storage — and the next long beat offers a FOURTH door: *Follow the omen*. Three facts to copy correctly:

* **Absence is free.** Naming an emitter slug that is not installed simply never fires — composing with a
  sibling never makes it a dependency, and neither plugin knows or cares whether the other exists.
* **A pubsub handler runs with NO chat scope.** No `chat.current()`, no room writes — it may only touch
  per-install state. So the handler takes a NOTE (the card + when), and the room-scoped `messageCommitted`
  handler decides later whether the note is still fresh (ten minutes, here — an hour-old omen steering
  tonight's doors would read as a haunting).
* **The payload is the whole message.** `{name, data}`, exactly what the emitter published — never a domain
  event, never automation, never another user's plugins.

## The two things that decide the design

**A plugin's chips are always compose-mode.** The host pins the mode for the plugin emitter and the guest
carries no say in it. A `send`-mode chip would post its text as the clicking member's own in-fiction line, so
a plugin able to emit one would be putting words in a person's mouth on a single click. Compose mode makes
the member the author: text lands in their box, they edit, they send. **Write your `sendText` as a first
draft of something a person would say**, never as a command to the system.

**Host authority is required, and here it is a flat refusal — not a confirm card.** Chips are room-visible,
so host authority is the ceiling; but a chip's whole value is immediacy, and an ask the host must read and
approve before the text can appear as a chip has already shown the host the text. In a room the installer
does not host, `surfaceQuickReply` throws. Catch it, log it, move on.

## Debouncing, and why it is the whole plugin

Chips are transient: no row, no history, nothing to clean up, and — crucially — **no host-side rate belt at
all**, unlike `net.fetch` and `llm.quiet`. Nothing stops you carpeting a room in chip strips except your own
code. This one uses two gates:

1. only a **narrator** beat past 400 characters counts (a strip under every one-line exchange is wallpaper,
   and wallpaper gets ignored),
2. a **two-minute per-room cooldown**, claimed *before* the surface call — two deliveries can be in flight at
   once, and a stamp written on success would let both strips through.

The host caps a quick-reply arm at four choices. Three leaves room to breathe; and note that two plugins
offering four each would stack to eight under one composer.

## Adapting it

* **Different doors** — `CHOICES` is a plain array. Genre-specific openers, a stuck-scene rescue kit, a set
  of tone nudges.
* **Different moment** — subscribe to `chatOpened` for a welcome strip, or `turnCompleted`. Note that
  `chatOpened` fires per attach and is viewer-blind, so it is a poor fit for anything reconnect-sensitive.
* **Dynamic text** — declare `chat.read`, call `chat.listMessages`, and build `sendText` from the last beat.
  Keep it fast: this runs inside an invocation budget.

## Honest gaps

* **Compose-only, permanently.** See above. If you want a chip whose click *executes* something rather than
  seeding a message, that surface does not exist for plugins.
* **No dismissal, no persistence.** Chips are replaced by the next set and vanish; there is no read receipt
  and no way to know whether anyone clicked.
* **Room-wide.** A strip is visible to the whole room, not to one viewer. Design copy that reads sensibly to
  everyone present.
