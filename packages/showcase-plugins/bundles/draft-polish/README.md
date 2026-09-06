# Draft Polish

**Archetype: the text pipeline.** One capability, two seams: rewrites what the MODEL reads (a prompt
transform) and typesets what YOUR SCREEN shows (a display transform). Start here if your idea begins with
"before the model sees it…" or "when this text renders…".

It tidies typographic scruff in the draft you are about to send — `...` becomes a real ellipsis, doubled
spaces collapse — and, on the display side, curls your quotes and sets your em dashes. The room's CANON stays
exactly what was typed; one seam changes what the model reads, the other what you see.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/draft-polish /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack draft-polish ./out    # → ./out/draft-polish-1.0.0.zip
```

Settings → Plugins → drop the zip → allow `chat.transform` → turn it on.

## The manifest

```json
"capabilities": ["chat.transform"]
```

One capability. This is the smallest possible plugin, and it is a genuinely useful one.

## The two walls, before you plan anything

**250 ms, and no I/O.** The registry bounds each transform's `apply` at 250 ms and skips it on a throw or a
timeout. `net.fetch`'s own deadline is 5 seconds. Those numbers are structurally incompatible: **a fetching
transform cannot exist.** Neither can a `llm.quiet` transform, nor anything else that leaves the sandbox.
What fits here is pure, local, synchronous-shaped text work.

**Rooms you host, only.** The prompt-transform registry is process-global and chat-blind, so the host gates
every plugin transform on the installer hosting the chat. In a room you do not host, your `apply` is never
called and the draft passes through untouched. You cannot detect this and must not design around it.

## How it works

`transforms.register({name, point, apply})` runs once at activation.

* `point` is `"user_input"` (the member's outgoing draft) or `"assembled_dynamic"` (the assembled prompt
  block).
* You do **not** supply an order. The host assigns plugin transforms a band above every first-party one, by
  registration order — a plugin can never jump ahead of the app's own rules.
* `apply` receives ONE object, `{draft, env}`, and returns the new draft. `env` is `{chatId, vars}`, handed
  over synchronously, so the common "branch on a chat variable" case needs no host call inside the deadline.
  That is what the `polishOff` opt-out below demonstrates.

Everything in `polish()` is a pure string function: testable in isolation, trivially inside the deadline, and
impossible to give an accidental side effect.

## The DISPLAY seam (`transforms.registerDisplay`)

The same capability's second registration, and a DIFFERENT contract — the two side by side are this
example's real lesson:

|              | prompt transform                       | display transform                       |
| ------------ | -------------------------------------- | --------------------------------------- |
| reaches      | the MODEL (and only the model)         | the INSTALLER's screen (and only it)    |
| input        | `{draft, env:{chatId, vars}}`          | `{text, env:{chatId, messageId}}`       |
| scope gate   | rooms you host                         | none — it is your own screen            |
| risk if wrong| the model answers unwritten words      | a glyph looks odd until you disable it  |

That last row is why the display side is BOLDER (smart quotes, em dashes) while the prompt side stays timid.
A throw or an overrun SKIPS a display transform — the row keeps the text it had, never a spinner.

Two mechanics worth copying: display text arrives BEFORE markdown renders, so `typeset()` splits out backtick
code spans and typesets only the prose between them (curling quotes inside `` `code` `` changes what the code
says); and the shared rules live in `tidy()` while trailing-space stripping stays PROMPT-only — its `$`
anchor eats the space before a code span when run on a segment, a bug this plugin's own test caught.

## Turning it off per room

```
{{setvar::polishOff::1}}
```

The plugin reads `env.vars` and returns the draft untouched. An always-on transform owes its users a way to
say no without revoking the whole grant.

## Adapting it

* **Different rules** — every rule in here is one a copy editor would make silently and nobody would argue
  with. Keep that bar. The failure mode of an over-eager transform is a member watching the model answer
  words they did not write.
* **Context-sensitive** — branch on `env.vars`, which is already in your hand. A transform that only applies
  in a particular room, or only while a scene flag is set, costs one `if`.
* **`assembled_dynamic`** — change `point` to rewrite the assembled prompt block instead of the member's
  draft. Much more powerful and much easier to break a scene with; test it against a real room.

## Honest gaps

* **Newlines are deliberately untouched.** Paragraph shape is authorial; collapsing it would be the
  meaning-changing edit this plugin swore off.
* **No feedback.** A skipped transform (deadline, throw, non-host room) is silent to you. There is no
  "was I applied?" signal — write `apply` so that being skipped is merely a missed nicety.
* **It runs on every draft in every room you host.** That is fine here because the work is a handful of
  regex passes, but it is the reason a transform must stay cheap.
