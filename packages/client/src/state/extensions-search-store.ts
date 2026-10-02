// The Extensions finder and its sibling desktop/phone census consumers share one session-only filter.
// Like preset-search-store, rail navigation retains it but a reload does not revive yesterday's query.
import { createGatedStore } from "./create-gated-store.ts";

interface ExtensionsSearchState {
  readonly query: string;
}

const useExtensionsSearchStore = createGatedStore<ExtensionsSearchState>("extensions-search", (): ExtensionsSearchState => ({ query: "" }));

export function setExtensionsSearchQuery(query: string): void {
  useExtensionsSearchStore.setState({ query }, false, "extensions-search/query");
}

export function useExtensionsSearchQuery(): string {
  return useExtensionsSearchStore((state) => state.query);
}
