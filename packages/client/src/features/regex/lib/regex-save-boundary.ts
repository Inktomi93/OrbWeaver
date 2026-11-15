// The client save boundary for a regex script: the one place the editor's values become the authored row.
//
// Fields that only one choice of passes can read are dropped when no pass reads them, so the stored row never
// carries a bound or a scope the screen no longer shows: depth and the author scope live only beside the display or
// prompt pass, and run on edit only beside the save pass. "Every position" and "every author" each have one
// spelling, the absent field, so a depth of {-1, no ceiling} and an author scope with two empty lists are dropped,
// and the save sends `null` for each so the stored row drops it too.

import type { CreateRegexScriptInput, UpdateRegexScriptInput } from "@orb/contracts/regex";
import { EPHEMERAL_REGEX_PASSES, REGEX_DEPTH_FLOOR } from "@orb/kit/regex";

function readsEphemeral(values: CreateRegexScriptInput): boolean {
  return values.passes.some((pass) => (EPHEMERAL_REGEX_PASSES as readonly string[]).includes(pass));
}

/** Whether a depth range or an author scope is set: the fields a move to the save pass drops. */
export function regexHoldsMessageScope({ depth, authors }: Pick<CreateRegexScriptInput, "depth" | "authors">): boolean {
  const keepsDepth = depth !== undefined && !(depth.min === REGEX_DEPTH_FLOOR && depth.max === null);
  return keepsDepth || (authors !== undefined && (authors.include.length > 0 || authors.exclude.length > 0));
}

/** The patch a save writes. A dropped depth or author scope is sent as `null`, the update's clear: an omitted key
 *  leaves the stored one in place. */
export function withSaveBoundary(values: CreateRegexScriptInput): UpdateRegexScriptInput {
  const { depth, authors, ...rest } = values;
  const ephemeral = readsEphemeral(values);
  return {
    ...rest,
    runOnEdit: values.passes.includes("save") && values.runOnEdit,
    depth: ephemeral && depth !== undefined && regexHoldsMessageScope({ depth }) ? depth : null,
    authors: ephemeral && authors !== undefined && regexHoldsMessageScope({ authors }) ? authors : null,
  };
}
