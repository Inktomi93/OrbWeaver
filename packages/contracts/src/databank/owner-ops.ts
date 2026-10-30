// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { DocumentId } from "@orb/kit/ids";

/** Capture the rooms a document reaches before junction teardown; call the thunk only after the owner-scoped write succeeds. */
export type CaptureDatabankRoomReachOp = (documentId: DocumentId) => Promise<() => void>;
