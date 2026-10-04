// A request to open one connection's editor in the Connections list, made from outside it (a Model roles door, a
// game's context-window notice). The list owns which row is being edited; it takes the request once and clears it.

import type { UserConnectionId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

/** Which editor to open, and whether to land with its Advanced tier expanded (where the stated facts, such as the
 *  context window, are set). */
interface ConnectionEditorRequest {
  readonly connectionId: UserConnectionId;
  readonly openAdvanced: boolean;
}

interface ConnectionEditorRequestState {
  readonly requested: ConnectionEditorRequest | null;
}

const useConnectionEditorRequestStore = createGatedStore<ConnectionEditorRequestState>(
  "connection-editor-request",
  (): ConnectionEditorRequestState => ({ requested: null }),
);

export function requestConnectionEditor(connectionId: UserConnectionId, opts: { readonly openAdvanced?: boolean } = {}): void {
  useConnectionEditorRequestStore.setState({ requested: { connectionId, openAdvanced: opts.openAdvanced ?? false } }, false, "connectionEditorRequest/request");
}

export function clearConnectionEditorRequest(): void {
  useConnectionEditorRequestStore.setState({ requested: null }, false, "connectionEditorRequest/clear");
}

export function useRequestedConnectionEditor(): ConnectionEditorRequest | null {
  return useConnectionEditorRequestStore((s) => s.requested);
}
