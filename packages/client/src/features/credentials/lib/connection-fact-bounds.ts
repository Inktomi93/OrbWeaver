// The bounds of a number fact, read off the contract schema the fact is declared through. The editor refuses what that
// schema refuses, so no list of bounds is kept beside the schema to drift from it, and a value the server would answer
// with a failure never reaches Save.

import type { z } from "zod";
import type { NumberBound, NumberEdit } from "./connection-fact-types.ts";

type ContractNumber = z.ZodNumber | z.ZodNumberFormat;

function bound(value: number): NumberBound {
  return { value, reads: String(value) };
}

/** The editor control for a number fact whose server schema is `schema`: whole when the schema takes integers only, above
 *  zero when its lower bound is an exclusive zero (`positive()`), else with its inclusive lower and upper bounds. */
export function numberEdit(schema: ContractNumber | z.ZodOptional<ContractNumber>): NumberEdit {
  const number = schema.type === "optional" ? schema.unwrap() : schema;
  // An integer schema carries the safe-integer range as its bounds; that range is no bound a person could hit.
  const lower = number.minValue !== null && number.minValue > Number.MIN_SAFE_INTEGER ? number.minValue : null;
  const upper = number.maxValue !== null && number.maxValue < Number.MAX_SAFE_INTEGER ? number.maxValue : null;
  // The schema's own parse says whether its lower bound is itself allowed.
  const lowerExcluded = lower !== null && !number.safeParse(lower).success;
  if (lowerExcluded && lower !== 0) {
    throw new Error(`numberEdit: a number fact excluding ${String(lower)} has no reading yet`);
  }
  return {
    kind: "number",
    ...(number.format === "safeint" ? { whole: true as const } : {}),
    ...(lowerExcluded ? { positive: true as const } : {}),
    ...(lower === null || lowerExcluded ? {} : { min: bound(lower) }),
    ...(upper === null ? {} : { max: bound(upper) }),
  };
}
