// The client save boundary for a regex script: the one place the editor's values become the authored row.
//
// Fields that only one choice of passes can read are dropped when no pass reads them, so the stored row never
// carries a bound or a scope the screen no longer shows: depth and the author scope live only beside the display or
// prompt pass, and run on edit only beside the save pass. "Every position" and "every author" each have one
// spelling, the absent field, so a depth of {-1, no ceiling} and an author scope with two empty lists are dropped.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { EPHEMERAL_REGEX_PASSES, REGEX_DEPTH_FLOOR } from "@orb/kit/regex";

function readsEphemeral(values: CreateRegexScriptInput): boolean {
  return values.passes.some((pass) => (EPHEMERAL_REGEX_PASSES as readonly string[]).includes(pass));
}

/** The values a save writes. */
export function withSaveBoundary(values: CreateRegexScriptInput): CreateRegexScriptInput {
  const { depth, authors, ...rest } = values;
  const ephemeral = readsEphemeral(values);
  const keepsDepth = ephemeral && depth !== undefined && !(depth.min === REGEX_DEPTH_FLOOR && depth.max === null);
  const keepsAuthors = ephemeral && authors !== undefined && (authors.include.length > 0 || authors.exclude.length > 0);
  return {
    ...rest,
    runOnEdit: values.passes.includes("save") && values.runOnEdit,
    ...(keepsDepth ? { depth } : {}),
    ...(keepsAuthors ? { authors } : {}),
  };
}
