// The WHOLE-MESSAGE tool-renderer registry as a React CONTEXT (client-architecture-lockdown.md §6c/§6d) —
// the context/hook/provider trio is the `createRegistryContext` mint (G26). Assembled ONCE at the door
// (main.tsx, G8) with the grafted per-message renderers, read by chat's `MessageToolCalls`. That consumer
// reads the raw `MessageToolsRendererRegistryContext` (null-tolerant `useContext`), NOT the throwing
// `useRegistry` — a build with no Provider (or a CT that mounts none) has ZERO message renderers and renders
// every tool record through the per-record `ToolRenderer` fallback, byte-identical.

import type { ContributorRegistry, MessageToolsRenderer } from "#lib";
import { createRegistryContext } from "#lib";

export type MessageToolsRendererRegistry = ContributorRegistry<MessageToolsRenderer>;

export const messageToolsRendererRegistryContext = createRegistryContext<MessageToolsRendererRegistry>("message-tools-renderer registry");
export const MessageToolsRendererRegistryContext = messageToolsRendererRegistryContext.Context;
