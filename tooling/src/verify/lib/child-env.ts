// THE COLOUR ENV A STAGE CHILD INHERITS — one decision, one home, because getting it wrong is silent.
//
// `runStage` composes `NO_COLOR=1` so every checker prints greppable plain text into its stage log. Node
// emits `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` whenever BOTH are
// present, once per child process (13 per push run, measured 2026-07-17), and the runner has always
// declined to SET `FORCE_COLOR` for that reason.
//
// NOT SETTING IT WAS NEVER ENOUGH (#2469, 2026-09-19). The value arrives INHERITED: an agent shell and a
// `pnpm` run both export it (`FORCE_COLOR=3` measured on the run that surfaced this), so the warning rode
// the stderr of every node child of every stage — noise in each stage log, and a real failure in any
// suite that asserts a child prints NOTHING on stderr and instead reads node's complaint about our own
// contradictory env. Dropping the key is
// the whole fix, and it lives here rather than inline so the claim has a name and a pin
// (`tests/tooling/verify/ops/run.int.test.ts`, which plants `FORCE_COLOR` in the parent as its control).
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";

refuseDirectInvocation(import.meta.url, "pnpm verify");

/** The colour override node warns about when it sits beside `NO_COLOR`; a stage child never carries it. */
const FORCE_COLOR_ENV = "FORCE_COLOR";

/** The parent environment a stage child inherits, with the contradictory colour override removed. */
export function colourNeutralParentEnv(): Record<string, string | undefined> {
  // biome-ignore lint/style/noProcessEnv: the parent env IS this function's subject — it composes what a spawned child inherits, not app config.
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== FORCE_COLOR_ENV));
}
