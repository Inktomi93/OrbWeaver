---
kind: design
status: active
updated: 2026-09-04
---

# 1310 — Snap filmstrip

## Outcome

`pnpm snap … --filmstrip` is the one transition-capture spelling. It captures the exact Playwright page already being driven and emits one bounded PNG contact sheet with ordered frames, relative timestamps, and argv action labels. No aliases, GIF, second browser, new context, re-emulation, hidden eval, or hidden screenshot action.

The old `pnpm record` surface retires to a loud recipe redirect. Its duplicate parser, driver, Playwright-video context, WebM/GIF render path, and ffmpeg strip code are deleted after parity tests pass. The shared ffmpeg primitive remains because Snap visual diff still imports it.

**SUPERSEDED 2026-09-04 (#1315, owner ruling).** There is no recipe redirect and no `pnpm record` script: the whole `tooling/src/screen-record/` dir is gone. The product is unlaunched, so a retired spelling is grep-fixed at its call sites rather than kept alive behind a translator that has to be maintained, tested and retired a second time. Everything else in this document stands — `pnpm snap … --filmstrip` is unchanged and is still the one transition-capture spelling.

## Empirical boundary

The supplied transcript census found seven real Record calls: five succeeded and two failed on dialect drift. Agents opened zero GIFs and zero WebMs; four click-strip PNGs were the consumed evidence. The retained value is therefore a bounded contact sheet, not a general video encoder.

## Lifecycle fork

The existing run-arm lifecycle already owns the required action seam: `afterNavigation` runs before the argv tape, `beforeAction`/`afterAction` receive the exact shared action index, and `afterActions` runs after the tape. It lacks one boundary: after the shared bounded settle on each exact page.

Chosen extension: add required `afterSettle(ArmTapeContext)` to `ArmRunInstance` and `RunArms`, invoked by `capture()` immediately after `settlePage()` and before settled page arms. Every existing run arm gets a no-op implementation; registry runtime validation requires the member. Filmstrip starts `Page.startScreencast` in `afterNavigation`, records action markers in `beforeAction`, and stops/renders in `afterSettle`.

This is smaller and more truthful than a third lifecycle union or a capture.ts filmstrip branch. The arm remains one ordinary run arm; action dispatch stays owned by `driveActions` and no action is replayed.

Every capture host must invoke the same lifecycle:

| Host | Integration |
| - | - |
| ordinary one-shot / named session / pages | Existing `beginRunArms` → `capturePages`; gains total `afterSettle` |
| contexts | Begin enabled run arms on the existing session, prepare once, pass them into each exact context capture, then measure/report/facts once |
| scenario checkpoint | Begin run arms from that checkpoint's inherited args, prepare before its capture, measure/report/facts after it; one fact batch per checkpoint |
| matrix | Ordinary cells already use `runOnSession`; scenario cells inherit the checkpoint host. Each disposable environment context captures its own exact page; matrix contexts never become identities |

The architectural fork is whether contexts/scenarios host run arms generically or filmstrip grows private hooks. Recommendation: generic hosting. A private filmstrip door would be the second lifecycle implementation this program explicitly forbids.

## CDP capture

Default mechanism: `page.context().newCDPSession(page)` on the page already owned by the capture host, then `Page.startScreencast`. The arm proves the mechanism with an injected CDP controller before treating it as locked:

- listen before start; acknowledge every `Page.screencastFrame`, including omitted frames;
- detach exactly once after stop/listener removal;
- never close the Playwright page/context/browser;
- preserve a primary error plus stop/ack/detach cleanup failures in `AggregateError`;
- a static or fake-CDP run that produces no frame is an instrument refusal, never a clean empty contact sheet.

No WebM is retained. Playwright video requires context creation and caused Record's second-context session path; transcript evidence shows no consumer for that artifact and does not justify new encoding work.

## Bounds and omission truth

Filmstrip owns a pixel buffer, not a diagnostic ring. It may reuse #1308's monotonic-cursor and measured-limit vocabulary, but not its record capacities.

| Limit | Initial policy | Receipt |
| - | - | - |
| frames | 48 retained frames | observed / retained / omitted |
| encoded frame bytes | 32 MiB aggregate | observed bytes / retained bytes / omitted bytes |
| capture duration | 15 seconds | elapsed / cap / frames omitted after cap |
| source dimensions | CDP max width 640, max height 480, JPEG quality 70 | declared in artifact completeness detail |

The duration timer stops the CDP screencast; later action markers remain recorded as outside the capture window. Count/byte caps keep acknowledging but omit payloads. Ordering is arrival sequence; relative timestamps use monotonic elapsed time from start. Every frame is labelled with the latest preceding argv action marker or `before actions`.

## Contact sheet and facts

Sharp builds one PNG grid in stable frame order. Each tile contains the frame plus a footer with `frame N · +Tms · action label`. The artifact is primary, channel `filmstrip`, schema `snap-filmstrip-contact-sheet-v1`, exact scope-v1 for its context/page/window, and structured limit receipts.

The `filmstrip` arm fact records state, observed/retained/omitted frames and bytes, duration, action-marker count, and the contact-sheet artifact ref. RESULT/end card print `filmstrip=<path|REFUSED|off>`, frame/omission counts, and action count. Browser-free report renders the arm state and artifact path from the ordinary run index; it derives no thresholds.

## Interference refusals

The parser refuses filmstrip before browser work with `--motion`, `--perf`, `--cpu-profile`, `--heap`, `--boot-trace`, or `--react-profile`: screencast encoding/frame delivery adds compositor, renderer, protocol, and host work inside those measurement windows. It also refuses `--probe`, which removes the transitions a filmstrip exists to inspect. Lighthouse/cascade remain legal because they are separate settled-surface reads and no rate verdict is inferred from the filmstrip.

## Record retirement

THIS SECTION'S PLAN WAS SUPERSEDED BY AN OWNER RULING (2026-09-04, #1315): no doors, no shims. It
specified that the retired `pnpm record <argv>` would exit misuse and print one exact `pnpm snap … --filmstrip`
recipe through a retirement TRANSLATOR that preserved route, target/session/stage/environment, actions,
`--out` and `--json`, mapping Record's initial `--settle N` to an ordered `--pause N`. What shipped
instead: `tooling/src/screen-record/` is deleted whole, the `record` package.json script is gone, and
the spelling was grep-fixed out of the active corpus. The product is unlaunched, so there was nobody
outside this repo holding the old argv for a translator to serve.

Active help, the Snap driving skill, side-eye role, tooling roster, and verification design point to Snap filmstrip. Historical reports remain frozen.

## Proof plan

Exact suite: `tests/tooling/snap/ops/arms/filmstrip.suite.int.test.ts`.

- real animated transition yields multiple ordered frames and a readable labelled PNG contact sheet;
- fake/static CDP no-frame refusal;
- true argv action-marker order;
- exact named-session page and owner survival;
- scenario checkpoint exact scope and fact batch;
- pages and contexts exact branded scopes where each host supports filmstrip;
- count/byte/duration omissions and every-frame acknowledgement;
- start/stop/ack/detach failure cleanup, including `AggregateError` ordering;
- all interference combinations refuse before a run slot/browser;
- the retired `pnpm record` names nothing runnable at all and old implementation files are absent;
- terminal pairs, artifact metadata, run-index arm state, typed facts, and browser-free report agree.
