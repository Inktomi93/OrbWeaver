// SNAP_HELP's arm blocks, DERIVED. `contract/help.ts` places
// each arm's own `help` text into the section it belongs to; this module is the bookkeeping that makes
// "an arm cannot ship without its operator row" TRUE rather than aspirational:
//
//   · `armHelp(arm)` returns the arm's block and MARKS it placed. An unknown name throws — a typo in the
//     help template is an instrument error, not a silently missing section.
//   · `remainingArmHelp()` prints every arm the template did NOT place, so a new member of `ARMS` reaches
//     `--help` with no edit to the template at all. It is what makes the required `help` member bite: the
//     only way for an arm's row to be absent from `--help` is for the arm not to exist.
//
// Evaluation order matters and is guaranteed: a template literal evaluates its expressions left to right,
// so every `armHelp` call in `SNAP_HELP` has already run by the time `remainingArmHelp()` is reached.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { Arm } from "../../contract/arm-vocabulary.ts";
import { ARMS } from "../../contract/arm-vocabulary.ts";
import { ARM_DEFS } from "./registry.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --help");

const placed = new Set<Arm>();

export function armHelp(arm: Arm): string {
  if (!ARMS.includes(arm)) {
    throw new Error(`INSTRUMENT ERROR: --help asks for the "${arm}" arm, which is not in ARMS (tooling/src/snap/contract/arms.ts)`);
  }
  placed.add(arm);
  return ARM_DEFS[arm].help;
}

/** Every arm the help template did not place, under a heading that says what it is. Empty (and prints
 *  nothing at all) when the template covers the roster — which is the state this repo ships in. */
export function remainingArmHelp(): string {
  const rest = ARMS.filter((arm) => !placed.has(arm));
  if (rest.length === 0) {
    return "";
  }
  return `Other arms:\n${rest.map((arm) => ARM_DEFS[arm].help).join("\n")}\n\n`;
}
