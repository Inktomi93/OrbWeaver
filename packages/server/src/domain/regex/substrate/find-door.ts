// The single-script write door (D53): a verb that stores a find pattern measures its compile first and refuses it,
// by name, when it costs more than the door admits. The lifts measure a whole plan at once (`persistence/
// portability-write.ts`).
import { DomainOperationError } from "@orb/kit/errors";
import type { SubstituteFindRegex } from "@orb/kit/regex";
import { REGEX_FIND_TOO_COSTLY } from "../contract/errors.ts";
import type { ProbeFindCompilesOp } from "../contract/portability.ts";

/** @throws {@link DomainOperationError} `regex_find_too_costly` when the pattern is refused; nothing is written. */
export async function requireFindAdmitted(
  probe: ProbeFindCompilesOp,
  script: { readonly name: string; readonly findRegex: string; readonly substituteRegex?: SubstituteFindRegex | undefined },
): Promise<void> {
  const [verdict] = await probe([{ findRegex: script.findRegex, substituteRegex: script.substituteRegex }]);
  if (verdict !== undefined && !verdict.ok) {
    throw new DomainOperationError(REGEX_FIND_TOO_COSTLY, `script ${JSON.stringify(script.name)} not saved: ${verdict.reason}`);
  }
}
