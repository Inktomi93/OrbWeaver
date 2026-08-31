# snap driving recipes

Worked chains for the recurring drive shapes. Every recipe is one Bash call unless stated. Flags
are current as of the `--scenario`/`--matrix`/`--expect-*` generation of the CLI — reconcile
against `pnpm snap --help` / the `scripts/probes/snap.ts` header before copying blindly; the
header outranks this file.

## Reach + inspect one surface (the default drive)

```bash
pnpm snap / --goto presets --map
pnpm snap / --goto settings:appearance --aria
pnpm snap / --goto modal:theme --shot-of '[role=dialog]'
```

Map first, then target what the map printed. Add assertions to make the run a receipt:

```bash
pnpm snap / --goto presets --expect-visible 'role=button[name="New preset"]' --text
```

## Create a room and act in it (one browser lifetime)

State does not survive a snap call — the create, the act, and the read all ride one chain.
`current` (not `latest`) names the room you just created: a fresh unsent room is unlisted until
the chat-list query refetches. The new-chat picker is a two-stage affordance: `modal:newChat`
opens a character picker; `Blank chat` / a character pick + `Start chat with N` is the click that
mints the room. Note the fill selector — the `composer` testid is on the footer WRAPPER; the
editable is the `textarea` inside it.

```bash
pnpm snap / --goto modal:newChat \
            --click 'text=Blank chat' \
            --open-chat current \
            --fill '[data-testid=composer] textarea=hello there' \
            --click '[data-testid=composer-send]' \
            --expect-visible '[role=article]' --text --json
```

## Scenario: a multi-step flow with checkpointed evidence

`{name?, defaults?, checkpoints:[{name, args}]}`; `args` is ordinary snap argv per checkpoint.
Checkpoints on the SAME url keep the live page — client state carries, which is the whole point:
a create in checkpoint one is still open in checkpoint three. Save the file lane-prefixed in the
scratchpad, not in the repo.

```json
{
  "name": "room-roundtrip",
  "defaults": ["--no-shot"],
  "checkpoints": [
    { "name": "create", "args": ["--goto", "modal:newChat", "--click", "text=Blank chat", "--open-chat", "current", "--expect-visible", "[data-testid=composer]"] },
    { "name": "send",   "args": ["--fill", "[data-testid=composer] textarea=hello there", "--click", "[data-testid=composer-send]", "--expect-visible", "[role=article]"] },
    { "name": "panel",  "args": ["--context-tab", "members", "--text"] }
  ]
}
```

```bash
pnpm snap / --scenario "$SCRATCHPAD/skill-author-room-roundtrip.json" --summary --json
```

`--summary` prints one `CHECKPOINT <name> PASS/FAIL` line each; the `--json` manifest keeps
per-checkpoint console/page-error slices. Checkpoints cannot carry
`--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff` or nest scenarios; stage flags go on
the outer command. Durability across a RELOAD is a separate, later plain call (a new browser is
the honest persistence test): `pnpm snap / --open-chat latest --expect-visible '[role=article]'`
— `latest` works there because the committed room is listed by then.

## Matrix: the 8-variant sweep

Desktop/mobile × light/dark × motion/reduced-motion, one command, each variant its own report and
`<out>-<variant>.png`:

```bash
pnpm snap / --goto chats --matrix
pnpm snap / --scenario "$SCRATCHPAD/skill-author-flow.json" --matrix   # composes
```

Refuses `--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`.

## Watch: streams and transients

Per-tick screenshot + re-run of every `--eval`, labeled by elapsed ms. Page 0 only.

```bash
pnpm snap / --open-chat <id> \
            --fill '[data-testid=composer] textarea=continue the scene' \
            --click '[data-testid=composer-send]' \
            --watch 8000 --every 500 \
            --eval 'document.querySelectorAll("[role=article]").length'
```

`--no-shot --watch` = the cheap state series (evals only, no per-tick PNGs). Any failed tick
reddens the exit.

## Multi-tab: drive one, read the passive one

Shared auth in one context; `@<idx>` targets a tab (unsuffixed = page 0):

```bash
pnpm snap / --pages 2 --open-chat@0 <id> --open-chat@1 <id> \
            --fill@0 '[data-testid=composer] textarea=hi' --click@0 '[data-testid=composer-send]' \
            --eval@1 '__orb.bus().live'
```

## Multi-user: host vs member (fixture sidecar)

The fixture must already be up (`pnpm fixture up` — operator call, snap
never boots it). Contexts are ISOLATED (own cookies), logged in as different dev users
(roster order: owner, member); same `@<idx>` targeting, shots suffix `-u<idx>`:

```bash
pnpm snap / --contexts 2 --eval@0 '__orb.snap()' --eval@1 '__orb.snap()'
pnpm snap / --as member --eval '__orb.snap()'      # single context, named user
```

No `--watch`/`--baseline`/`--diff` in context mode; `--contexts` + `--pages` together is refused.

## Static mock: same ruler, no stack

```bash
pnpm snap --file docs/design/mocks/config-rail/workspace.html --wide --contrast 'h1' --text
```

`--click`/`--fill` work (mocks with real controls are drivable); nav flags refuse — a static file
has no `__orb` bridge.

## Staged drive: don't fight the dev stack

```bash
pnpm snap / --isolated --goto chats --text     # frozen HEAD stage on :8888/:5273
pnpm snap / --dirty --goto chats --text        # working tree, re-syncs per call
pnpm snap --stage-status                       # marker + port owners + dirs
pnpm snap --stage-down                         # teardown (marker-less fallback included)
```

First boot pays worktree+install+boot; the stage stays warm across calls. Separate DB from the
dev stack — ids do not transfer.
