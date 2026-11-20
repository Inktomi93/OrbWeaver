// A request to open one connection's editor in the Connections list, made from outside it (a Model roles door, a
// game's context-window notice). The list owns which row is being edited; it takes the request once and clears it.

import type { UserConnectionId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

/** A stated fact a door names: the editor scrolls to its row and moves focus there. */
export type ConnectionEditorFact = "context-window" | "max-output";

/** Which editor to open, and whether to land with its Advanced tier expanded (where the stated facts, such as the
 *  context window, are set). A named fact opens that tier too. */
interface ConnectionEditorRequest {
  readonly connectionId: UserConnectionId;
  readonly openAdvanced: boolean;
  readonly fact: ConnectionEditorFact | undefined;
}

interface ConnectionEditorRequestState {
  readonly requested: ConnectionEditorRequest | null;
}

const useConnectionEditorRequestStore = createGatedStore<ConnectionEditorRequestState>(
  "connection-editor-request",
  (): ConnectionEditorRequestState => ({ requested: null }),
);

export function requestConnectionEditor(
  connectionId: UserConnectionId,
  opts: { readonly openAdvanced?: boolean; readonly fact?: ConnectionEditorFact } = {},
): void {
  useConnectionEditorRequestStore.setState(
    { requested: { connectionId, openAdvanced: opts.openAdvanced ?? opts.fact !== undefined, fact: opts.fact } },
    false,
    "connectionEditorRequest/request",
  );
}

export function clearConnectionEditorRequest(): void {
  useConnectionEditorRequestStore.setState({ requested: null }, false, "connectionEditorRequest/clear");
}

export function useRequestedConnectionEditor(): ConnectionEditorRequest | null {
  return useConnectionEditorRequestStore((s) => s.requested);
}
