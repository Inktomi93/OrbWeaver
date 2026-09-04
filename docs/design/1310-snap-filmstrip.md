---
kind: design
status: active
updated: 2026-09-03
---

# 1310 — Snap filmstrip

## Outcome

`pnpm snap … --filmstrip` is the one transition-capture spelling. It captures the exact Playwright page already being driven and emits one bounded PNG contact sheet with ordered frames, relative timestamps, and argv action labels. No aliases, GIF, second browser, new context, re-emulation, hidden eval, or hidden screenshot action.

The old `pnpm record` surface retires to a loud recipe redirect. Its duplicate parser, driver, Playwright-video context, WebM/GIF render path, and ffmpeg strip code are deleted after parity tests pass. The shared ffmpeg primitive remains because Snap visual diff still imports it.

## Empirical boundary

The supplied transcript census found seven real Record calls: five succeeded and two failed on dialect drift. Agents opened zero GIFs and zero WebMs; four click-strip PNGs were the consumed evidence. The retained value is therefore a bounded contact sheet, not a general video encoder.

## Lifecycle fork

The existing run-arm lifecycle already owns the required action seam: `afterNavigation` runs before the argv tape, `beforeAction`/`afterAction` receive the exact shared action index, and `afterActions` runs after the tape. It lacks one boundary: after the shared bounded settle on each exact page.

Chosen extension: add required `afterSettle(ArmTapeContext)` to `ArmRunInstance` and `RunArms`, invoked by `capture()` immediately after `settlePage()` and before settled page arms. Every existing run arm gets a no-op implementation; registry runtime validation requires the member. Filmstrip starts `Page.startScreencast` in `afterNavigation`, records action markers in `beforeAction`, and stops/renders in `afterSettle`.

This is smaller and more truthful than a third lifecycle union or a capture.ts filmstrip branch. The arm remains one ordinary run arm; action dispatch stays owned by `driveActions` and no action is replayed.

Every capture host must invoke the same lifecycle:

| Host                                      | Integration                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ordinary one-shot / named session / pages | Existing `beginRunArms` → `capturePages`; gains total `afterSettle`                                                                                                                             |
| contexts                                  | Begin enabled run arms on the existing session, prepare once, pass them into each exact context capture, then measure/report/facts once                                                         |
| scenario checkpoint                       | Begin run arms from that checkpoint's inherited args, prepare before its capture, measure/report/facts after it; one fact batch per checkpoint                                                  |
| matrix                                    | Ordinary cells already use `runOnSession`; scenario cells inherit the checkpoint host. Each disposable environment context captures its own exact page; matrix contexts never become identities |

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

| Limit               | Initial policy                                     | Receipt                                         |
| ------------------- | -------------------------------------------------- | ----------------------------------------------- |
| frames              | 48 retained frames                                 | observed / retained / omitted                   |
| encoded frame bytes | 32 MiB aggregate                                   | observed bytes / retained bytes / omitted bytes |
| capture duration    | 15 seconds                                         | elapsed / cap / frames omitted after cap        |
| source dimensions   | CDP max width 640, max height 480, JPEG quality 70 | declared in artifact completeness detail        |

The duration timer stops the CDP screencast; later action markers remain recorded as outside the capture window. Count/byte caps keep acknowledging but omit payloads. Ordering is arrival sequence; relative timestamps use monotonic elapsed time from start. Every frame is labelled with the latest preceding argv action marker or `before actions`.

## Contact sheet and facts

Sharp builds one PNG grid in stable frame order. Each tile contains the frame plus a footer with `frame N · +Tms · action label`. The artifact is primary, channel `filmstrip`, schema `snap-filmstrip-contact-sheet-v1`, exact scope-v1 for its context/page/window, and structured limit receipts.

The `filmstrip` arm fact records state, observed/retained/omitted frames and bytes, duration, action-marker count, and the contact-sheet artifact ref. RESULT/end card print `filmstrip=<path|REFUSED|off>`, frame/omission counts, and action count. Browser-free report renders the arm state and artifact path from the ordinary run index; it derives no thresholds.

## Interference refusals

The parser refuses filmstrip before browser work with `--motion`, `--perf`, `--cpu-profile`, `--heap`, `--boot-trace`, or `--react-profile`: screencast encoding/frame delivery adds compositor, renderer, protocol, and host work inside those measurement windows. It also refuses `--probe`, which removes the transitions a filmstrip exists to inspect. Lighthouse/cascade remain legal because they are separate settled-surface reads and no rate verdict is inferred from the filmstrip.

## Record retirement

`pnpm record <argv>` exits misuse and prints one exact `pnpm snap … --filmstrip` recipe. The retirement translator preserves route, target/session/stage/environment, actions, `--out`, and `--json`; it maps Record's initial `--settle N` to an initial ordered `--pause N` and drops `--frames` because filmstrip is always the bounded frame contact sheet. Unsupported or malformed Record argv refuses with the old token named; no command silently disappears.

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
- `pnpm record` redirects to the exact Snap recipe and old implementation files are absent;
- terminal pairs, artifact metadata, run-index arm state, typed facts, and browser-free report agree.
