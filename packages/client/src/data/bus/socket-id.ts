// The per-TAB socket id (SSE-1 §4.1/§6) — one prefixless branded id per DOCUMENT, minted at module load.
//
// Why a module const and not a rotating store: a viewer-identity change in this app is ALWAYS a full
// document load (login navigates; logout hard-redirects to /login — `features/auth/surfaces/account-surface.tsx`
// says so and `data/auth-bootstrap.ts` implements it), so the module re-evaluates and the id is re-minted for
// free. A `rotateSocketId()` with no caller would be dead wire pretending to enforce something the document
// lifecycle already enforces.
//
// It is NOT a capability: the server binds the cell to the minting principal and collapses a foreign id to a
// leak-free NOT_FOUND. It never appears in a frame and no domain ever sees it — pure transport state.

import type { SocketId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";

const SOCKET_ID: SocketId = newId<SocketId>();

/** This document's socket id — stable for the life of the tab. */
export function socketId(): SocketId {
  return SOCKET_ID;
}
