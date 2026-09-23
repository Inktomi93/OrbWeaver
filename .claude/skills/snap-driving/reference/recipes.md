# snap driving recipes

Worked chains for the recurring drive shapes. Every recipe is one Bash call unless stated. Reconcile
against `pnpm snap --help` (source: `tooling/src/snap/contract/help.ts`) and `flags.md` beside this
file before copying blindly; the help outranks this file. Redirect every run to a log and read the log
(SKILL.md, "Read the output").

## The evidence cases (each a typed fact in `run.json`)

| Case | Flag | What it answers | Refuses to combine with |
| - | - | - | - |
| shot | (default) / `--shot-of` / `--full` / `--crop` | what it looks like (PNG, one image px per CSS px) | — |
| dead-css | on by default (`--no-deadcss`) | Tailwind classes never compiled, used-but-empty rules | — |
| aria | `--aria` / `--text` | the accessible tree, the oracle for names, roles, landmarks | — |
| map | `--map [sel]` | every control as a unique locator plus actionability; the SPA destination atlas | — |
| eval | `--eval <js>` | any in-page value, including `__orb.*` | — |
| contrast | `--contrast <sel>` (+`--contrast-pixel`) | WCAG ratio against the effective backdrop | — |
| cascade | `--cascade <sel=prop>` | why a property has that value (active/overloaded declarations) | `--lighthouse` |
| assert | `--expect-*` | a rendered fact as a PASS/FAIL result | — |
| app-snapshot | always on | coarse boot timing plus `__orb.snap()` overview | measured under load labels `load-suspect`; withheld only on an unproven or software-rendered browser |
| motion | `--motion [sel]` | one motion window: LoAF, CLS (non-virtualized), dirty animations, dropped frames | `--filmstrip`, `--cpu-profile` |
| perf | `--perf` | per-step input delay, long tasks, rAF gaps, CLS over the action tape (a meter, not a gate) | `--filmstrip`, `--cpu-profile` |
| cpu-profile | `--cpu-profile` / `--boot-trace` / `--react-profile` | who burns the frame, the boot trace, hottest components | `--perf`, `--motion`, `--filmstrip` |
| heap | `--heap <label>` / `--heap-compare` / `--heap-retainers` | memory growth, detached trees, retainers (diagnostic, never a budget) | `--filmstrip` |
| lighthouse | `--lighthouse desktop\|mobile` | axe/best-practices/seo on the settled page | `--cascade`; mobile fills the device slot |
| requests | `--requests [url]` / `--request-body <url>` | reads the surface issued, plus one JSON body | — |
| filmstrip | `--filmstrip` | a transition as a labelled contact sheet | every profiler/measurement case |
| design-audit | `--design-audit` | deterministic UI defect scan, population verdict, `--fail-on`, `--mobile` | positive control is a trailing `--eval`, run before the walk; a cold `--dirty` stage needs `--idle` |

## Reach + inspect one surface (the default drive)

```bash
pnpm snap / --goto presets --map
pnpm snap / --goto config:appearance --aria
pnpm snap / --goto modal:theme --shot-of '[role=dialog]'
```

Map first, then target what the map printed. Add assertions to make the run evidence:

```bash
pnpm snap / --goto presets --expect-visible 'role=button[name="New preset"]' --text
```

## Create a room and act in it (one browser lifetime)

State does not survive a snap call; the create, the act, and the read all ride one chain.
`current` (not `latest`) names the room you just created: a fresh unsent room is unlisted until
the chat-list query refetches. The new-chat picker is a two-stage affordance: `modal:newChat`
opens a character picker; `Blank chat` / a character pick + `Start chat with N` is the click that
mints the room. Note the fill selector: the `composer` testid is on the footer wrapper, and the
editable is the `textarea` inside it.

```bash
pnpm snap / --goto modal:newChat \
            --click 'text=Blank chat' \
            --open-chat current \
            --fill '[data-testid=composer] textarea=hello there' \
            --click '[data-testid=composer-send]' \
            --expect-visible '[role=article]' --text --json
```

## Filmstrip: inspect a transition

The contact sheet starts before the ordered action tape and stops after settle. Every retained frame is
labelled with its relative timestamp and most recent action; the RESULT/index points at the exact PNG.

```bash
pnpm snap / --goto config:appearance --filmstrip \
            --click 'role=button[name="Theme"]' --pause 700 --out theme-transition
```

Take performance, motion, CPU, heap, or trace evidence in a separate run; filmstrip deliberately refuses
those combinations so its JPEG encoding cannot contaminate the measurement window.

## Scenario: a multi-step flow with checkpointed evidence

`{name?, defaults?, checkpoints:[{name, args}]}`; `args` is ordinary snap argv per checkpoint.
Checkpoints on the same url keep the live page, so client state carries: a create in checkpoint one
is still open in checkpoint three. Save the file lane-prefixed in the scratchpad, not in the repo.

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
pnpm snap / --scenario "$SCRATCHPAD/skill-author-room-roundtrip.json" --scenario-summary --json
```

`--scenario-summary` prints one `CHECKPOINT <name> PASS/FAIL` line each; the `--json` manifest keeps
per-checkpoint console/page-error slices. Checkpoints cannot carry
`--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff` or nest scenarios; stage flags go on
the outer command. Durability across a reload is a separate, later plain call in a new browser, the
honest persistence test: `pnpm snap / --open-chat latest --expect-visible '[role=article]'`.
`latest` works there because the committed room is listed by then.

## Read a finished run without a browser

```bash
pnpm snap --reports                                   # every indexed run: id · checkout · sha · lane · verdict
pnpm snap --report latest --problems                  # the newest run's findings (default view)
pnpm snap --report <abs run.json> --all --arm contrast  # everything one case produced
```

The `FINDING` rows carry `next=`: the exact reader command narrowed to that finding's case. No
browser, no stage, no run slot needed.

## Matrix: the pairwise appearance-invariant sweep

Rated cells derived from the live Appearance carrier contract (theme × device × OS media × the app's
own rows, pairwise-planned, never a Cartesian sweep). Needs a stage:

```bash
pnpm snap / --isolated --goto chats --matrix
pnpm snap / --isolated --scenario "$SCRATCHPAD/skill-author-flow.json" --matrix   # composes
```

Read `MATRIX PLAN … cells=N pairs-uncovered=M` first: uncovered pairs are a stated hole.

Refuses `--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`.
Each cell is a disposable device/theme/media environment context, not a user identity; the owning
browser survives. Verified by `tests/tooling/snap/ops/session-matrix.suite.int.test.ts`.

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

Shared cookie/localStorage identity in one BrowserContext; DOM remains per tab. `@<idx>` targets a tab
(unsuffixed = page 0), screenshots use `-p<idx>`, and this mode makes no user identity claim:

```bash
pnpm snap / --pages 2 --open-chat@0 <id> --open-chat@1 <id> \
            --fill@0 '[data-testid=composer] textarea=hi' --click@0 '[data-testid=composer-send]' \
            --eval@1 '__orb.bus().live'
```

## Multi-user: host vs member (fixture sidecar)

The fixture must already be up (`pnpm fixture up`; an operator call, snap never boots it). Contexts
are isolated (own cookies), logged in as different dev users (roster order: owner, member); same
`@<idx>` targeting, shots suffix `-u<idx>`:

```bash
pnpm snap / --contexts 2 --eval@0 '__orb.snap()' --eval@1 '__orb.snap()'
pnpm snap / --as member --eval '__orb.snap()'      # single context, named user
```

No `--watch`/`--baseline`/`--diff` in context mode; `--contexts` + `--pages` together is refused.
This is a one-direction comparison/observation pass, not a scheduler for alternating humans. Any flow
where host and member take turns acting belongs in E2E with two explicit browser actors.

## Static mock: same ruler, no stack

```bash
pnpm snap --file reports/mocks/<name>.html --wide --contrast 'h1' --text
```

`--click`/`--fill` work (mocks with real controls are drivable); nav flags refuse — a static file
has no `__orb` bridge.

## Staged drive: don't fight the dev stack

```bash
pnpm snap / --isolated --goto chats --text     # frozen HEAD stage, banded ports (SKILL.md §8)
pnpm snap / --dirty --goto chats --text        # working tree, re-syncs per call
pnpm snap --stage-status                       # marker + port owners + dirs
pnpm snap --stage-down                         # teardown (marker-less fallback included)
```

The default stage sits on band 0 (`:8888`/`:5273`); a later concurrent stage takes the next band.
First boot pays worktree+install+boot; the stage stays warm across calls. Stage db provenance:
`rules/instruments.md`.
