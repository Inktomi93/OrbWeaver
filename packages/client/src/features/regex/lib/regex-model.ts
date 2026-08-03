// The regex collection's pure view-model — the collection KIND.
//
// `regexScriptTitle` used to live here; it moved to `lib/regex-placement-labels.ts` (beside the scent it
// pairs with) when `components/regex-scope-order.tsx` became a caller — `components/` sits below features
// and cannot import a feature's `lib/`.

/** The collection KIND — registry key, React key, selection kind axis. ONE home (the definition and the
 *  create verb that selects what it just made both read it). */
export const REGEX_COLLECTION_ID = "regex";
