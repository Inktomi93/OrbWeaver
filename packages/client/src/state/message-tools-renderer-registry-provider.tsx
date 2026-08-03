// The message-tools-renderer-registry Provider (client-architecture-lockdown.md §7) — split from the
// context file so a JSX module never mixes a hook export with a component export
// (useComponentExportOnlyModules). The Provider is the createRegistryContext mint's Provider, bound to the
// whole-message tool-renderer registry.

import { messageToolsRendererRegistryContext } from "./message-tools-renderer-registry-context.ts";

export const MessageToolsRendererRegistryProvider = messageToolsRendererRegistryContext.Provider;
