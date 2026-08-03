// The modal-registry Provider (client-architecture-lockdown.md §7) — split from the context+hook file so a
// JSX module never mixes a hook export with a component export (useComponentExportOnlyModules). The
// Provider is the createRegistryContext mint's Provider, bound to the modal registry.

import { modalRegistryContext } from "./modal-registry-context.ts";

export const ModalRegistryProvider = modalRegistryContext.Provider;
