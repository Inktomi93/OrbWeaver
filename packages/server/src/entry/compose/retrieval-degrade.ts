// Compatibility door for existing callers; search owns refusal classification.

import { withRetrievalDegrade as retrieveWithDegrade } from "#domain/search";

/** The existing entry door retains the domain operation's identity. */
export const withRetrievalDegrade = retrieveWithDegrade;
