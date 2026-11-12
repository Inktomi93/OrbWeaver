---
kind: adr
status: active
updated: 2026-11-12
---

# A full plugin IPC queue refuses one frame, never the channel

## Context

The plugin host's processes talk over inherited IPC channels: app to watchdog, watchdog to broker, and back. Each sender holds what it has not yet written, up to a byte cap. When a frame would pass the cap, the sender closed the channel and ended its process, so one owner's plugins could stop the host for every owner. Bridge calls with large arguments fill the broker's queue and the watchdog's relay to the app; large host results fill the parent's queue. Each plugin frame is sized by a plugin.

## Decision

**A full queue refuses the one frame that would overflow it, to the plugin that sized it, and the channel stays open.** Every hop's sender holds at most `PLUGIN_IPC_QUEUE_MAX_BYTES` unwritten:

| Hop | Plugin frames it carries | On a full share or queue |
| - | - | - |
| broker to watchdog | a Worker's bridge call, a command's answer, a log line | the call is refused back to the Worker; the answer is replaced by the channel-full refusal; the log line is dropped |
| watchdog to app | the same | the frame's route refusal goes back to the broker for a call, or on to the app in place of an answer; a log line is dropped |
| app to watchdog | a command's value, a host result | the command fails alone as host-unavailable; the result is replaced by the channel-full refusal |
| watchdog to broker | the same | the refusal goes back to the app for a command, or on to the broker in place of a result |

- **A frame a plugin sizes carries a route:** its runtime and the small refusal frame that answers it. A relay never parses a frame.
- **Each runtime has its own share of every queue.** `pluginIpcShareBytes` is what `PLUGIN_IPC_CONTROL_HEADROOM_BYTES` leaves, divided among `PLUGIN_BROKER_WORKER_MAX` Workers, with a floor of four capped host results. At the default Worker count each runtime has a quarter of the queue less the headroom, and no runtime's frames can take another's room. Where the floor binds the shares overlap, and the queue's own bound still holds.
- **Host control frames may use the headroom; plugin frames never do.** Control frames are refusals, runtime notices, cancels, disposes and readiness. A refused call owes one refusal frame, and at most `HOST_CALLS_IN_FLIGHT_MAX` calls per runtime are in flight, so every refusal fits. A control frame that does not fit means a broken channel, and the channel fails as before.
- **The refusal is coded and retryable.** Its name is `PLUGIN_HOST_UNAVAILABLE` and its message is `PLUGIN_CHANNEL_FULL`. A guest reads the name.
- **A host result is refused, never held.** A result too large for its runtime's share is replaced by the refusal at once, so no host memory stays pinned for a plugin that never takes it. The guest may retry.
- **Strikes follow cause.** A refusal is a conflict and never a strike (D346). A guest that lets its invocation overrun its CPU window copying arguments out takes the strike for that overrun, as for any other runaway invocation. A bystander's frames use its own share, so its calls are never refused for another plugin's flood.
- **The guest's CPU window bounds a flood too.** To fill a runtime's share with megabyte arguments a guest must copy about that many bytes out in one invocation, which ends at its CPU window first (D346). The share is the backstop across invocations and runtimes.

**Homes.**

- `PLUGIN_IPC_QUEUE_MAX_BYTES`, `PLUGIN_IPC_CONTROL_HEADROOM_BYTES`, `PLUGIN_IPC_REFUSAL_MAX_BYTES` and `pluginIpcShareBytes` in `packages/server/src/infra/plugin-host/budgets.ts`.
- `PluginIpcSender` and `relayFrame` in `packages/server/src/infra/plugin-host/process-channel.ts`; `PluginFrameRoute` in `packages/server/src/infra/plugin-host/contract/process-protocol.ts`.
- `PLUGIN_CHANNEL_FULL`, `channelFullBridgeResult` and `channelFullResponse` in `packages/server/src/infra/plugin-host/process-protocol.ts`.
- `offer`, `answer` and `forwardBridge` in `packages/server/src/infra/plugin-host/broker-entry.ts`; the relays in `packages/server/src/infra/plugin-host/broker-watchdog.ts`; `command` and `sendBridgeResult` in `packages/server/src/infra/plugin-host/process-runtime.ts`.
- Tests: `tests/server/infra/plugin-host/persistence/bridge-flood.int.test.ts`.

## Consequences

One owner's flood fills only its runtimes' shares; every other runtime keeps its own. A flooding plugin sees some of its calls refused and may retry them, or its invocation ends at its CPU window. A burst under the share, such as every full stored value read back at once, is served whole. A log line dropped on a full share stays in the plugin's own log ring.

## Alternatives rejected

- **Closing the channel on overflow.** One plugin's flood ended the host for every owner.
- **Holding a host result until the queue has room.** It pins host memory for a plugin that never takes its results, and it ties one plugin's reads to every queue's drain.
- **A per-call byte cap alone.** The arguments and results are already capped per call; the flood is many calls at once.
- **Parsing frames at the relay.** A route on the envelope lets the watchdog refuse a frame without reading it.
