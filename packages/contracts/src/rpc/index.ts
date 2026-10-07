// Shared HTTP batching policy: the client splits at the same count the server admits.
// Both ceilings are twice their independently observed representative boot/navigation maxima.

/** Maximum procedure calls in one HTTP request; client splitting and server admission share this value. */
export const TRPC_BATCH_MAX_ITEMS = 22;

/** Maximum encoded URL characters passed to the HTTP batch link, measured with the relative API base. */
export const TRPC_BATCH_MAX_URL_LENGTH = 1334;
