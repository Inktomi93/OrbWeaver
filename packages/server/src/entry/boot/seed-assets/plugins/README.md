# Writing an Orbweaver plugin

This directory holds the five example plugins every Orbweaver user is given, one per **archetype**. They are
not decoration: they are the templates. Pick the one shaped like the thing you want, copy its folder, and
edit it.

```
research-familiar/     event reactor      watches the room, reaches the network, writes lore
oracle-deck/           tool provider      gives the model a tool it can call mid-turn
affinity-tracker/      quiet thinker      asks the model privately, keeps private state, notifies
draft-polish/          prompt transform   rewrites the draft on its way out — pure, local, 250 ms
scene-chips/           room surface       offers quick-reply chips the room can see
```

---

## The whole loop, in five lines

```bash
cp -r packages/server/src/entry/boot/seed-assets/plugins/oracle-deck /tmp/my-plugin
# edit /tmp/my-plugin/manifest.json  (give it your own `id` and `name`)
# edit /tmp/my-plugin/main.js
pnpm plugin:pack oracle-deck ./out       # packs a SEEDED example, for reference
# for your own folder: point the packer at it, or zip manifest.json + main.js yourself
```

Then open **Settings → Plugins**, drop the zip on the install card, tick the capabilities you are willing to
allow, and turn it on.

A bundle is a zip containing **exactly two files** — `manifest.json` and `main.js`, at the root, no folder,
no third entry. Anything else is refused at install. `pnpm plugin:pack <slug>` produces exactly that from a
source directory under this folder, and validates the manifest before it writes, so a bundle that would be
rejected at install is rejected on your machine instead.

### Tinkering with a plugin that is already installed

The five here arrive **installed, switched off, and allowed nothing**. Nothing happens until you open the
grant list and say yes. To change one:

1. copy its source folder somewhere of your own,
2. edit it,
3. pack it,
4. install the zip.

**If you keep the same `id`**, the install is an **upgrade** of your existing row: your plugin's private
storage survives, and your existing grants carry forward — *unless* the new manifest asks for something the
old one did not (a new capability, or a new `netHosts` entry). Widened reach forces the plugin back to
disabled and raises a re-consent notice naming exactly what is new. Narrowing never asks: consent to reach A
and B already covers reaching only A. A version that is *older* than what you have installed is refused
outright.

**If you change the `id`**, you get a second, independent plugin with its own storage and its own grants.
That is what you want while you are experimenting — the seeded original keeps working while your copy
misbehaves.

---

## `manifest.json`, field by field

```json
{
  "id": "oracle-deck",
  "name": "Oracle Deck",
  "version": "1.0.0",
  "hostVersion": 1,
  "entry": "main.js",
  "description": "A commit-and-reveal card deck the narrator can draw from mid-turn.",
  "author": "Orbweaver",
  "capabilities": ["storage.kv", "tools.register"],
  "netHosts": ["en.wikipedia.org"]
}
```

| Field | Rule |
| - | - |
| `id` | Lowercase slug, 2–64 chars, `[a-z0-9][a-z0-9-]*`. Unique **per user**, and the namespace prefix your tools get (`plugin_<id_with_underscores>_<toolname>`). Changing it makes a different plugin. |
| `name` | ≤ 80 chars. What the pane and any confirm card call it. |
| `version` | Exactly `major.minor.patch`. Only used for display and to refuse a downgrade. |
| `hostVersion` | `1`. The membrane major. A future host that no longer serves 1 refuses your bundle loudly rather than half-running it. |
| `entry` | Always the literal `"main.js"`. There is no module loader in the guest realm — one file, no imports. |
| `description` | ≤ 500 chars. Shown next to the name; write it for the person deciding whether to allow it. |
| `author` | Optional, ≤ 120 chars. |
| `capabilities` | A subset of the closed capability list below. **Declaring is asking**, not receiving. |
| `netHosts` | Exact hostnames, ≤ 8. Required if — and only if — you declare `net.fetch`. |
| `matchAutomationEvents` | Optional, default `false`. `false` means your event handlers only see human-caused (depth-0) events. Set it `true` only if you genuinely need to react to what other automation did, and understand that a hard cascade cap still applies. |
| `builtAgainst` | Optional `{engineVersion, engineCommit?}`. Displayed as provenance; never an install gate. |

Keep the whole `manifest.json` under 64 KiB and `main.js` under 1 MiB. The zip itself must be under 1 MiB.

---

## Capabilities: the fourteen things a plugin can ask for

Nothing is ambient. Every host function is gated at the **function**, by name, against the set the user
actually allowed — which can be narrower than what you declared. Read `host.grants` to feature-detect, or
catch `PluginCapabilityError` (its `.name` crosses the sandbox boundary intact).

| Capability | Unlocks | Notes |
| - | - | - |
| `chat.read` | `chat.current()`, `chat.listMessages()`, `chat.getVariables()` | You need this for `current()` even if all you want is the handle to pass to something else. |
| `chat.variables.write` | `chat.applyVariableOps()` | Host authority required — a flat refusal without it. |
| `chat.quick_reply` | `chat.surfaceQuickReply()` | Host authority required. Always compose-mode. |
| `chat.transform` | `transforms.register()` | 250 ms deadline, host-only rooms. |
| `worldinfo.write` | `worldInfo.upsertEntry()` | Host authority → otherwise becomes a confirm card. Book must be attached to the room. 64 entries per book per plugin. |
| `global_vars` | `variables.get/set/delete()` | The installing user's `{{getglobalvar}}` namespace. |
| `storage.kv` | `storage.get/set/delete/list()` | Your own private KV: ≤ 256 keys, ≤ 64 KiB per value, scoped per plugin × owner. |
| `notify` | `notifications.post()` | Participants only. 200-char cap, 60 s per-room cooldown. |
| `turn.trigger` | `chat.requestTurn()` | **Spend.** Host authority → otherwise a confirm card. |
| `imagery.generate` | `imagery.generatePicture()` | **Spend.** Host authority → otherwise a confirm card. |
| `llm.quiet` | `llm.quiet()` | **Spend.** 30 calls/hour per plugin. Writes nothing — you get a string. |
| `events.subscribe` | `events.on()` | Installed plugins only. |
| `tools.register` | `tools.register()` | Installed plugins only. |
| `net.fetch` | `net.fetch()` | Requires `netHosts`. 120 calls/hour per plugin, 5 s deadline, 1 MiB response cap, SSRF-guarded. |

### The three postures, and why a call can "succeed" without doing anything

Room-state writes need **host authority** — the installer must be the host of the room the invocation is in.
When they are:

* **`worldInfo.upsertEntry`, `chat.requestTurn`, `imagery.generatePicture`** become an **ask**: the act is
  stashed as a card the room's host confirms, and your call throws `PluginSuggestedError`. That is not a
  failure and not a refusal — it means "it became a question". Do not retry; retrying only replaces your own
  pending card.
* **`chat.applyVariableOps` and `chat.surfaceQuickReply`** stay a **flat refusal**. A variable delta is not a
  human-weighable question, and a chip approved after being read is just the chip, delivered late.

---

## The realm your code runs in

`orb.host(1)` is the only thing in scope. There is no `fetch`, no `require`, no `import`, no timers, no
`process`. `Date`, `Math.random` and `performance.now` exist but **throw** — time and entropy arrive as
injected host seams (`host.clock.nowEpochMs()`, `host.random.next()`, `host.ids.mint()`) so the same plugin
under the same inputs behaves identically every run. That determinism is what makes plugin behaviour testable
and reproducible; work with it rather than around it.

Budgets you cannot see but will meet:

* an invocation has a CPU deadline and a settlement deadline — a handler that never resolves is ended,
* at most 32 host calls may be in flight per invocation, and invocations on one plugin are serialised,
* the log ring is bounded per invocation and per instance; flooding it drops lines, it does not error,
* **three consecutive crashed invocations auto-disable your plugin** and notify the installer.

That last one is the single most important number in this document. **A handler must never throw.** Wrap the
body, log the failure, return. A flaky network, a model having a bad minute, a host refusal you expected —
none of those are defects, and all of them look identical to a crash if you let them escape.

---

## Debouncing is your job

Two capabilities carry host-side hourly floors (`net.fetch` at 120, `llm.quiet` at 30, per plugin). **Nothing
else does**, and in particular **event delivery has no rate belt at all**: your `messageCommitted` handler
runs on every committed message in every room you can see. The floors are backstops against a runaway
plugin, not budgets — a design that relies on them stops working halfway through a busy evening.

Every example here debounces, and each one shows a different way:

* **research-familiar** — acts only on an explicit `((lookup: …))` marker, remembers what it already did, and
  keeps a minimum gap between fetches.
* **affinity-tracker** — acts every Nth message via a counter in its own storage.
* **scene-chips** — a per-room cooldown timestamp, claimed *before* the surface call so two in-flight
  deliveries cannot both pass.

Claim the budget before you spend it, never after. Two deliveries can be in flight at once.

---

## What plugins cannot do (stated so you do not design around it)

* **No custom rendering.** The client's tool-renderer registry is first-party and assembled at build time. A
  plugin tool's call and result render in the generic tool block, so write your result string to read well as
  plain text.
* **No stable room identity in a tool handler.** The chat handle is a fresh opaque token per invocation, so a
  tool cannot key state per room. Event handlers can — their fact carries the chat id.
* **No fetching transform.** The transform deadline is 250 ms and the fetch deadline is 5 s. Structurally
  incompatible; there is no version of this that works.
* **No thinking outside `llm.quiet`.** There is no other model access, and `llm.quiet` cannot write.
* **No cross-plugin or cross-user reach.** Storage is keyed to you and your installer; you cannot name a
  different scope, a different funder, or a different notification recipient.
* **No module system.** One file. Inline what you need.

---

## Where these files live, and why they are not in a top-level `examples/`

The deployed image copies `packages/*/src` and nothing else, and the per-user seeder reads these sources at
runtime to pack each bundle. A repo-root `examples/` directory would not exist in a running container. They
sit here, beside the seeded avatars and the seeded example transcripts, for the same reason those do.
