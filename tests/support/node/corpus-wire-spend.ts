// A scripted corpus wire states whether its case spends every step. A required wire refuses at disposal with steps left,
// as `finiteReplies` does, so no caller has to remember to assert what remains.

/** `every-step`: the case owns the wire and must spend its whole script. `as-needed`: a shared execution serves whichever
 *  producers a run selects, so an unspent step is not a defect. */
export type CorpusWireSpend = "every-step" | "as-needed";

/** The disposal check every corpus wire runs. */
export function refuseUnspentSteps(wire: string, spend: CorpusWireSpend, unspent: number): void {
  if (spend === "every-step" && unspent > 0) {
    throw new Error(`${wire}: ${unspent} scripted step(s) never spent; a case that needs fewer steps scripts fewer`);
  }
}
