// A request to open one connection's editor in the Connections list, made from another section of the pane (a Model
// roles door). The list owns which row is being edited; it takes the request once and clears it.

import type { UserConnectionId } from "@orb/kit/ids";
import { createGatedStore } from "#state";

interface ConnectionEditorRequestState {
  readonly requested: UserConnectionId | null;
  readonly request: (connectionId: UserConnectionId) => void;
  readonly clear: () => void;
}

const useConnectionEditorRequestStore = createGatedStore<ConnectionEditorRequestState>(
  "connection-editor-request",
  (set): ConnectionEditorRequestState => ({
    requested: null,
    request: (connectionId): void => set({ requested: connectionId }, false, "connectionEditorRequest/request"),
    clear: (): void => set({ requested: null }, false, "connectionEditorRequest/clear"),
  }),
);

export function useRequestedConnectionEditor(): UserConnectionId | null {
  return useConnectionEditorRequestStore((s) => s.requested);
}

export function useRequestConnectionEditor(): ConnectionEditorRequestState["request"] {
  return useConnectionEditorRequestStore((s) => s.request);
}

export function useClearConnectionEditorRequest(): ConnectionEditorRequestState["clear"] {
  return useConnectionEditorRequestStore((s) => s.clear);
}
