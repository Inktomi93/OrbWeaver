import type { RegexScriptId } from "@orb/kit/ids";
import { useEffect } from "react";
import { clearRegexRowRequest, useRequestedRegexRow } from "#state";

/** Drops a request for a script the Regex section draws no row for: the section's reads have settled by the time it
 *  renders, so such a request never will match, and it must not wait for a later mount. */
export function useDropUnheldRegexRowRequest(drawn: readonly RegexScriptId[]): void {
  const requested = useRequestedRegexRow();
  const held = requested !== null && drawn.includes(requested);
  useEffect(() => {
    if (requested !== null && !held) {
      clearRegexRowRequest();
    }
  }, [requested, held]);
}
