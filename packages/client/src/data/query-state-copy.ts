// The words of a read that has no data yet. Zero imports, so a Node-side spec reads the names production renders.

/** The line under a read that `networkMode: "online"` holds paused until the connection returns. */
export const QUERY_WAITING_LINE = "Waiting for connection…";

/** The sentence of a failed read: `label` is what failed to load, such as "your chats". */
export function queryFailedLabel(label: string): string {
  return `Couldn't load ${label}.`;
}

/** What failed to load, said by a boundary given no labeled error state. */
export const QUERY_DEFAULT_READ_LABEL = "this";
