---
kind: work
status: open
updated: 2026-10-24
priority: P3
plan: test-foundation
---

# Qualify loading reservations on QueryBoundary surfaces

## What

Select QueryBoundary loading surfaces with observable layout shifts. Check their existing reserveKey and rendered reservation before changing them.

## Why

Loading reservations should prevent layout shifts; source inspection alone cannot establish rendered behavior.

## Done when

Each selected defect has a corrected reservation and a rendered CT or Snap check across loading and settled states.

## Evidence

There is no failing-surface list. The surfaces below come from source and from `pnpm snap` runs on an isolated stage at `6a524b901ea7`.

### Surfaces

`ast-grep -l tsx '<QueryBoundary $$$A>$$$B</QueryBoundary>' packages/client/src` scanned 815 `.tsx` files and found 118 mounts in 104 files. 79 pass a `reserveKey`, 39 do not. The same pattern with `-l ts` scanned 770 `.ts` files and matched nothing. One mount passes `reserveBlock` (`rpg-hud-band.tsx`) and one passes it through the home tile contribution.

The 39 unkeyed mounts include modals, pickers, popovers, settings leaves and the app-shell context pane (`section-context-host.tsx`). No section sweep below attributes a shift to one of them.

### Method

Each section target (`home chats characters corpus config extensions databank presets refinery`) and each Settings group target (`config:personas appearance chat-behavior workloads backup connections automation admin about regex`) ran once per condition with `--motion-goto <target> --no-shot`, desktop (1280x800) and phone (`--mobile --viewport 390x844`). The reading is the run's `nonVirtualizedCls`.

- First boot: a fresh browser, so the surface-box store is empty and no `reserveBlock` applies.
- Repeat visit: the same run with the store seeded through `--local-storage orb:u/<user>/surface-box=...`, using boxes the same device and width wrote during one `--goto` tour. Boxes measured at desktop width and replayed at phone width mis-reserve by design and are not a reading.

Stage data: the owner's container clone (`reports/container-clone`, user `01m49k9qcqenard9eds8y09687`). A dev-db stage gave the same shape.

### Cumulative layout shift (clone stage)

| Target | Desktop first boot | Phone first boot | Desktop repeat | Phone repeat |
| - | - | - | - | - |
| home, chats, characters, extensions, databank | 0 | 0 | 0 | 0 |
| corpus | 0.0066 | 0 | 0.0066 | 0 |
| config | 0.0568 | 0 | 0 | 0.0000 |
| presets | 0.0021 | 0 | 0.0021 | 0 |
| refinery | 0.0095 | 0 | 0 | 0 |
| config:appearance | 0.0568 | 0.1168 | 0 | 0 |
| config:workloads | 0.2022 | 0.1175 | 0.0003 | 0 |
| config:connections | 0.0796 | 0.2518 | 0.0003 | 0 |
| config:admin | 0.0993 | 0.1157 | 0 | 0 |
| config:automation | 0.0032 | 0.0060 | 0.0004 | 0 |
| config:about | 0.0016 | 0.0062 | 0.0004 | 0 |
| config:personas, chat-behavior, backup, regex | at most 0.0003 | 0 | at most 0.0003 | 0 |

Run slots (`reports/runs/snap/`): `config:workloads`, first boot desktop `agent-a5a4fd04d218e888f-3802451-2026-10-24T13-50-46-824Z`, repeat desktop `...-3842939-2026-10-24T13-56-24-146Z`, repeat phone `...-3904492-2026-10-24T14-03-54-661Z`. `config:connections`: `...-3805038-2026-10-24T13-51-04-690Z`, `...-3845487-2026-10-24T13-56-42-840Z`, `...-3908352-2026-10-24T14-04-21-432Z`. `config:admin`: `...-3807095-2026-10-24T13-51-20-744Z`, `...-3847281-2026-10-24T13-56-58-595Z`, `...-3912412-2026-10-24T14-04-48-258Z`. Box tours: desktop `...-3786628-2026-10-24T13-48-22-815Z`, phone `...-3878088-2026-10-24T14-00-57-375Z`.

### Reading

- Every keyed surface holds its box on a repeat visit at the width that measured it. The first-boot shifts of 0.08 to 0.25 on `config:workloads`, `connections`, `admin` and `appearance` drop to at most 0.0004. The reservation works; no keyed boundary needs a corrected key.
- The first-boot shifts are the declared limit of measure-then-remember: no measurement exists and the settled heights are data and width dependent (connections list 571px at desktop and 960px at phone). A declared `reserveBlock` would need a constant per width. That is a design decision, not a defect in an existing reservation. See the open question below.
- Two repeat-visit residuals are not QueryBoundary reservations. `corpus` (+34px) is `understanding-pass-memory-off`, rendered from a non-suspending `useQuery` in `use-understanding-pass.ts`, which declares it suspends on nothing. `chats` (-77px on a dev-db stage) is the chat list pane, whose header states it renders its pending ladder itself rather than through a `QueryBoundary`. `presets` (0.0021) is the app-shell context pane boundary and sits far below any threshold.
- Entity-scoped constant keys: `character.editor` settles at 1482px for one character and 948px for another under one key. Opening the 1482px character with 948px seeded measured 0.0002 (run `...-3781629-2026-10-24T13-47-24-798Z`), because the boundary wraps the whole surface and nothing sits below it. Constant keys on surfaces with siblings below (`chat.context.*`, `automation.rule.activity`, `plugin.row.*`, `persona.editor.loreBook`) were not measured: the clone has no chat, persona or rule rows that vary their content.

### Cold stage

The first two cold `--isolated` boots of this checkout ended in `data-app-ready came up DEGRADED` (`NAV ERROR`, `BOOT-DEAD`): `...-3640440-2026-10-24T13-26-32-478Z` and `...-3646490-2026-10-24T13-27-36-470Z`. The third run on the warmed stage passed and is not a cold pass. A later `--fresh` rebuild with `--stage-db` booted clean on its first navigation.

### Open question

Does a first-boot shift on Settings groups need a declared first-boot box? No existing reservation is wrong, so no CT was added. If the answer is yes, the fix is `reserveBlock` per width on `config.workloads.*`, `config.connections.*`, `config.admin.*` and `config.appearance.looks`, with a CT that holds the read pending and asserts the box is unchanged across settle. If the answer is no, this item closes with no change.
