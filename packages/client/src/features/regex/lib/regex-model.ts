// The regex collection's pure view-model — the collection KIND and the one-string row-name derivation.

import type { RegexScriptRow } from "@orb/contracts/regex";

/** The collection KIND — registry key, React key, selection kind axis. ONE home (the definition and the
 *  create verb that selects what it just made both read it). */
export const REGEX_COLLECTION_ID = "regex";

/** A row's name, with the empty-name arm spelled ONCE, so the list, the editor heading and the delete
 *  confirm can never announce a nameless script three different ways. */
export function regexScriptTitle(script: RegexScriptRow): string {
  return script.name === "" ? "Unnamed script" : script.name;
}
