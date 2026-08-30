---
kind: review
status: archived
updated: 2026-08-30
---

# Chat transcript render attribution — #191

## Verdict

**ACCEPT AS DESIGNED.** The `chat:transcript` count is a development-only subtree-commit counter, not a count of full transcript executions, message reads, or DOM rows. The exact 11-commit reproduction contains one committed mount, two query/observer-driven parent executions, and eight descendant/virtualizer measurement commits. Production probes on the longest real room found a bounded 3–8-row DOM window, no post-boot long animation frames while moving among tail/middle/top, and no repeated frame gap above 100 ms. TanStack Virtual stays; no product-code change is warranted.

Reviewed provenance: `main` at `2895946d810415f85c5bb001d27af60d396660be` (`2026-08-20`, `fix(ui): settle overlay follow-up findings (#367 #368 #369)`). All source receipts, synthetic copies, builds, and live probes below derive from those exact bytes. A later movement of the `main` branch pointer is outside this review.

## Issue summary

[Issue #191](https://github.com/Inktomi93/orbweaver/issues/191) reported 11 `chat:transcript` commits with a 106 ms maximum for a three-message room and proposed reducing the count to two or three. The owner later ruled that TanStack Virtual remains and that the claim must be decided from attributed production cost, not the raw development counter. This review reproduces the 11, attributes their owners, tests representative short and longest-real-room windows, and records the durable technical disposition. Mutable issue and Project lifecycle remain in GitHub, not this report.

## Instrument contract and controls

- `packages/client/src/features/chat/surfaces/message-list-surface.tsx:69-91` wraps the entire `ChatThread` subtree in `RenderProfiler`; a profiler update can therefore be a descendant commit even when `ChatThread` does not execute.
- `packages/client/src/lib/render-stats.ts:19-38` increments once per React profiler callback and does not identify the component that owned the update.
- `packages/client/src/lib/render-profiler.tsx:28-37` returns children bare outside development. The production probes confirmed `typeof window.__orb === "undefined"`.
- `packages/client/src/main.tsx:100-146` mounts development under `StrictMode`; lines 139-143 also show the devtools/probe gate.
- The temporary source-only instrument recorded exact profiler callbacks, `ChatThread` function entries, TanStack Query cache events, DOM row counts, `ResizeObserver` activity, long animation frames, and `requestAnimationFrame` gaps. No product source was changed.

Positive controls proved the instrument could see the events it was intended to classify:

| control | planted event | observed result |
| - | - | - |
| profiler | `recordRender("chat191:positive-control", "update", 7)` | exactly one commit, phase `update`, duration 7 ms |
| main thread | deliberate 80 ms busy loop | 80.5 ms long-animation-frame entry and 49.9 ms rAF gap |

The production build was made with `./node_modules/.bin/vite build --configLoader native`; it contained neither the temporary source probes nor the development profiler/debug surface.

## Exact 11-commit reproduction

Room `chat_01m0a0vtmjesq84qhz2w0b016m` contains 3 selected messages and 7,721 selected-variant characters. Development without `StrictMode` reproduced exactly 11 transcript commits: 1 mount, 10 updates, 116 ms total, 66 ms maximum, and 3 DOM rows.

| commit | from open | phase | duration | direct evidence | attribution |
| - | - | - | - | - | - |
| 1 | 413.7 ms | mount | 6.1 ms | five `ChatThread` attempts occurred before the first commit while suspense/retry settled | committed transcript mount after core reads |
| 2 | 491.0 ms | update | 66.0 ms | no `ChatThread` entry; no query success | descendant virtualizer/row mount and measurement |
| 3 | 500.6 ms | nested-update | 7.1 ms | no `ChatThread` entry; no query success | descendant measurement settle |
| 4 | 502.2 ms | nested-update | 0.3 ms | no `ChatThread` entry; no query success | descendant measurement settle |
| 5 | 502.7 ms | update | 0.0 ms | no `ChatThread` entry; no query success | descendant measurement settle |
| 6 | 509.0 ms | update | 5.7 ms | one `ChatThread` entry; no query success | observer/options/subscription stabilization |
| 7 | 525.0 ms | update | 6.6 ms | no `ChatThread` entry; no query success | descendant measurement settle |
| 8 | 531.7 ms | update | 5.1 ms | no `ChatThread` entry; no query success | descendant measurement settle |
| 9 | 584.8 ms | update | 4.7 ms | one `ChatThread` entry immediately after four batched query successes | non-suspending query settlement |
| 10 | 585.9 ms | update | 0.2 ms | no additional `ChatThread` entry or query success | descendant settle |
| 11 | 691.3 ms | update | 14.4 ms | no additional `ChatThread` entry or query success | late content/row measurement settle |

The four query successes preceding commit 9 landed at the same 3328.2 ms timestamp: `regex.listScripts`, `regex.listRoomDisplayScripts`, `chat.previewContextFit`, and `chat.listMessageVariants`. They caused one parent execution, not four commits. `listMessageVariants` was legitimately enabled because the latest assistant message had more than one variant.

## Query, store, and StrictMode attribution

`packages/client/src/features/chat/surfaces/message-list-surface.tsx:105-110` owns the suspense floor: `chat.listMessages` plus `chat.getChat`. The same file keeps `rpg.getGame`, appearance/display preferences, and `previewContextFit` non-suspending at lines 126-136 and 214-230. The observed network/query behavior was:

- `settings.getUserSettings` is one shared cache key across `useChatStyle`, `useMessageAppearance`, and `useChatBehaviorPrefs` (`use-chat-style.ts:18-21`, `use-message-appearance.ts:40-43`, `use-chat-behavior-prefs.ts:26-29`); the three consumers did not issue three wire reads.
- `useDisplayScripts` owns two real query tiers and returns the stable empty/common arm without allocation (`packages/client/src/data/use-display-scripts.ts:50-74`).
- `rpg.getGame` remained disabled for the non-game room. `assets.resolveChatBlobRefs` remained disabled for an empty asset-id set (`packages/client/src/features/chat/hooks/attachment-url-provider.tsx:28-38`).
- `chat.listMessageVariants` is gated on `variantCount > 1` (`packages/client/src/features/chat/hooks/use-variant-history.ts:30-38`) and was the only row-specific late read in this room.
- `chatOpened` deliberately invalidates `chat.getChat` on attach (`packages/client/src/data/invalidation.ts:108-114`), accounting for the second observed `getChat` success rather than an identity-loop duplicate.
- The query client uses infinite stale time and structural sharing (`packages/client/src/data/query-client.ts:43-56`). No idle chat-store update was observed. Transcript store selectors are lifecycle-only rather than token-text subscriptions (`packages/client/src/features/chat/hooks/use-message-items.ts:41-49`; `packages/client/src/state/chat-stream.ts:365-372`).

| development control | transcript commits | `ChatThread` entries | query successes | conclusion |
| - | - | - | - | - |
| normal `StrictMode` | 13 | 13 | 19 | strict development replay adds executions/commits |
| no `StrictMode` | 11 | 7 | 19 | exact issue count; network work unchanged |
| no `StrictMode`, devtools/probe UI disabled, run 1 | 12 | 8 | 19 | devtools are not the count owner |
| no `StrictMode`, devtools/probe UI disabled, run 2 | 12 | 6 | 19 | scheduling varies; network work still unchanged |

StrictMode increased observer add/remove/setup churn but did not duplicate network success. The repeated no-devtools runs also show why a raw target of two or three development commits is not a stable performance contract.

## TanStack Virtual and longest-room evidence

The message list is intentionally windowed. `packages/ui/src/primitives/message-list/message-list.tsx:181-228` supplies count, overscan, stable item keys, end anchoring, direct DOM positioning, and no `flushSync`; lines 369-402 own resize observation with an equality guard; lines 430-445 render and measure only `virtualizer.getVirtualItems()`. The focused CT permanently asserts that a 500-item list renders more than zero but fewer than 20 rows (`tests/ui/primitives/message-list/message-list.ct.tsx:59-65`).

The longest real room in the isolated SQLite backup was `chat_01m0a0vtmmesq84qnf758eyyk1`, title `Bess — Feb 16, 2026 (2)`: 222 messages and 342,184 selected-variant characters. It exceeded the next room by 53 messages.

Development attribution after the room was ready:

| action | DOM rows | transcript commits | `ChatThread` entries | query successes | frame/blocking result |
| - | - | - | - | - | - |
| tail idle | 3 | 0 | 0 | 0 | no LoAF; no rAF gap over 20 ms |
| jump middle | 8 | 6 | 2 | 0 | one 83.4 ms dev rAF gap |
| 8-wheel burst | 6 | 18 | 0 | 0 | 145.1 ms descendant commit total over the action window; max commit 40.6 ms; max LoAF blocking 0.9 ms; max rAF gap 33.4 ms |
| jump top | 4 | 5 | 0 | 0 | max rAF gap 33.2 ms |
| jump tail | 3 | 6 | 2 | 0 | no LoAF; no rAF gap over 20 ms |

The wheel burst is the decisive negative control: 18 profiler commits occurred with zero `ChatThread` executions and zero query successes. The counter therefore cannot be interpreted as 18 transcript renders, 18 data reads, or work proportional to 222 messages.

Production evidence:

| scenario | DOM rows | LoAF | rAF gaps | interpretation |
| - | - | - | - | - |
| cold 3-message app load | 3 | worst blocking 46.1 ms | max 114.0 ms | full bundle/app boot, not isolated room work |
| cold 222-message app load | 3 | worst blocking 65.0 ms | max 121.5 ms | full bundle/app boot, not isolated room work |
| 222-message middle/top/tail after ready | 8 / 4 / 3 | none | none over 20 ms | bounded window and clean navigation |
| warm long → short room open | 3 | none | none over 20 ms | clean isolated room open |
| warm short → 222-message room open | 3 | one 60.2 ms LoAF with 0 ms blocking | 33.4 / 49.9 ms | no script-blocking or sustained frame problem |

Cold-load numbers intentionally remain in the receipt: they show whole-app boot cost, but they do not support rewriting transcript subscriptions or removing virtualization. The production room-open and ordinary-window controls are the relevant acceptance evidence.

## Behavioral and structural controls

Focused component tests on a clean synthetic copy of the reviewed commit:

```sh
npx playwright test -c playwright-ct.config.ts \
  tests/ui/primitives/message-list/message-list.ct.tsx \
  tests/client/features/chat/surfaces/message-list-surface.ct.tsx
```

Result: `CT SUMMARY — PASS · 44 passed · 0 failed · 0 flaky · 0 skipped`.

Recon inventory covered 188 tracked chat-feature TS/TSX source files, 6 tracked message-list primitive source files, and 99 tracked mirrored chat/message-list tests. A four-file hot-path memoization sweep used both structural (`ast-grep`, TS and TSX) and literal (`rg`) methods; neither found a manual `memo(...)`. The message list contains only the sanctioned stable callbacks used for registration and imperative seams. No manual memo was proposed because the React Compiler tree and the production evidence do not justify it.

Path history does not identify a recent virtualization regression. The profiler arrived in `02ff98fd6777e015d3351b6a108646758a440c0a` on 2026-08-15; the message-list virtualizer lineage starts at `cd7e93c02dbc83752b50388aefdcc3f6d019417c` on 2026-07-02 and was subsequently extended for reading-surface and accessibility behavior. The recent path commits before the reviewed tree concern those UI behaviors, while the live production controls above remain bounded.

## Command and artifact receipt

Representative commands executed from isolated copies or against the read-only backup:

```sh
git rev-parse HEAD
git show -s --format='%H%n%cs%n%s' 2895946d810415f85c5bb001d27af60d396660be

sqlite3 -readonly /tmp/chat-render-191-recon-SleJ1e/orb.db \
  "select c.id,c.title,count(m.id),sum(length(v.content)) from chats c join messages m on m.chat_id=c.id left join message_variants v on v.id=m.selected_variant_id group by c.id,c.title order by count(m.id) desc limit 5;"

node /tmp/chat191-probe.mjs http://localhost:5200/ \
  chat_01m0a0vtmjesq84qhz2w0b016m \
  /tmp/chat-render-191-recon-SleJ1e/short-no-strict.json

node /tmp/chat191-scroll.mjs http://localhost:5199/ \
  chat_01m0a0vtmmesq84qnf758eyyk1 \
  /tmp/chat-render-191-recon-SleJ1e/long-scroll-attributed.json

node /tmp/chat191-prod.mjs http://localhost:8901/ \
  01m09wfr2wf27bqrnssesmk9v9 \
  chat_01m0a0vtmmesq84qnf758eyyk1 \
  /tmp/chat-render-191-recon-SleJ1e/long-prod.json

npx playwright test -c playwright-ct.config.ts \
  tests/ui/primitives/message-list/message-list.ct.tsx \
  tests/client/features/chat/surfaces/message-list-surface.ct.tsx
```

Probe artifacts were intentionally kept outside the repository. Their content hashes preserve the evidence identity even after `/tmp` expires:

| artifact | SHA-256 |
| - | - |
| `short-no-strict.json` | `8c9435371cb80610dde21c65ce7b63cfd0d5086f4dab05ab982fdf4b83ab031e` |
| `long-scroll-attributed.json` | `2311864c80fe508827984d0314f8a7f365ffc3fc920445a07ca14c141f4fa90a` |
| `short-prod.json` | `758d38b83f5fdcc51a99e1ae1beeb39dac96068e510e1cfac3ce7a0611148614` |
| `long-prod.json` | `b19b602eda77b1d4f457f8194a8f290989d8e9615b635cc88d318620b34b4117` |
| `prod-warm-open-long.json` | `e99659ec8604a1a3e1b5f419d4400179d2e73ab46808c02c8a0828e6dd58f335` |

All private stages used ports `8898`–`8901` and `5198`–`5200`, a copied database, and engines disabled. The stages were stopped after capture; the investigation changed no repository or shared-stage state.

## Technical disposition and reopen thresholds

**No bounded architecture seam is justified.** Reducing the profiler number would either optimize descendant measurement that production already bounds, or force deliberate non-suspending reads behind a larger suspense boundary and trade progressive first paint for a development counter. Neither has demonstrated user-visible benefit.

Reopen the architecture question only when a representative production room, after app readiness, proves at least one of these:

- sustained or repeatable long-animation-frame blocking above 50 ms during room open or ordinary scrolling;
- repeated rAF gaps above 100 ms during ordinary scrolling;
- a virtualized DOM window above 20 message rows under the existing viewport/overscan contract; or
- a query/store owner issuing duplicate wire work or transcript executions without a corresponding state change.

Until then, the 11-commit reproduction is attributed instrumentation behavior plus progressive query and virtualizer settlement, not a product performance defect.
