---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: plugin
---

# Wire the host-call relay into plugin frames

## What

No mount of `PluginFrame` (`packages/client/src/features/plugin/components/plugin-frame.tsx`) passes `hostCall`, so every host call from a frame is refused. Pass the relay to `plugin.uiHostCall` at each anchor that mounts a frame, the same relay `plugin-scripted-surface.tsx` uses. The server gate (`fn` in `UI_PROXYABLE` and in the caller's grants) and the per-plugin in-flight cap already apply. Rewrite the header's pending-U4 paragraph to state the wired behavior.

## Why

The owner ruled that a frame gets the same server-gated host access as a scripted surface.

## Done when

Every frame anchor passes `hostCall`. A test proves a frame's granted call is relayed and answered, and a call outside the plugin's grants is still refused.

## Evidence

`PluginFrame` now owns its relay. It calls `usePluginHostCall` (`packages/client/src/features/plugin/hooks/use-plugin-host-call.ts`), which is bound to the mount's `pluginId` and `chatId`, and the scripted surface uses the same hook. So every anchor that mounts a frame has the relay, and none needs a prop. The chat anchors and the transcript tool card pass the room; dialog, page and settings frames have no room. The frame message cannot choose the plugin id: the parse drops every key except `callId`, `fn` and `args`, and the relay takes no id per call.

`tests/client/features/plugin/components/plugin-frame.ct.tsx` has five host-call cases. A granted call is answered. An ungranted call gets the reason-free refusal. A message naming a sibling plugin's id still travels under the frame's own id. A tool-card frame's chat-scoped call carries the transcript's room. The in-flight cap refuses the call past four and frees its slots once they settle. Against the unwired code, the three settings-anchor cases failed: every call was refused and nothing reached the wire. The tool-card case failed without the room pass. A scratch run that let the message pick the plugin id delivered the sibling's `variables.get` answer into the frame, and the escalation case caught it. All 97 plugin CTs pass, and the frame file passes `--repeat-each=5`.
