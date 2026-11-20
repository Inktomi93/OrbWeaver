// A request to land on one regex script's row in the room's This chat tab, made from outside it (the stopped-script
// notice). The roster owns its rows: the row that matches takes the request once, scrolls itself into view and takes
// focus; a roster that holds no such row drops it, so a request never waits for a later mount.

import type { RegexScriptId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

interface RegexRowRequestState {
  readonly requested: RegexScriptId | null;
}

const useRegexRowRequestStore = createGatedStore<RegexRowRequestState>("regex-row-request", (): RegexRowRequestState => ({ requested: null }));

export function requestRegexRow(scriptId: RegexScriptId): void {
  useRegexRowRequestStore.setState({ requested: scriptId }, false, "regexRowRequest/request");
}

export function clearRegexRowRequest(): void {
  useRegexRowRequestStore.setState({ requested: null }, false, "regexRowRequest/clear");
}

export function useRequestedRegexRow(): RegexScriptId | null {
  return useRegexRowRequestStore((s) => s.requested);
}
