// WHERE A CT SCREENSHOT LANDS (#1201, docs/design/1208-instrument-substrate.md §3.7) — the ONE door a CT
// spec uses to resolve `page.screenshot({ path })` / `locator.screenshot({ path })` into THIS CT RUN'S
// OWN artifact slot (`reports/runs/ct/<runId>/snaps/…`), never a shared family.
//
// SUPERSEDES story-shot.ts's `storyShot()` for CT (that helper's own header named this as its leftover:
// "giving [shots] a run slot needs the CT run's identity to reach the WORKER processes"). CT specs run in
// Playwright WORKER child processes, separate from the main runner process — `playwright-ct.config.ts`
// opens the "ct" instrument's run slot ONCE, in the main process, before any worker forks, and sets
// `CT_RUN_SLOT_DIR` on `process.env`; a plain child process inherits its parent's env unless overridden
// (nothing here overrides it), so every worker sees the same value. `ct-flaky-reporter.ts` ADOPTS that same
// slot for `ct-flaky.json` — one CT run, one slot, published once the run is over.
//
// `story-shot.ts` REMAINS the door for `tests/e2e/**` local specs: an e2e local spec runs under
// `playwright.config.ts`, a separate runner with no "ct" run slot to adopt, and giving it one is out of
// this ticket's scope (§3.9: the substrate gives the CT runner only the slot helper, nothing else).
//
// Gate `no-direct-reports-write` (tooling/src/verify/gates/no-direct-reports-write.ts) REDs a hand-spelled
// `reports/…` literal handed to `.screenshot({ path })` anywhere in `tests/**` — `ctSnapPath` is the only
// sanctioned producer of that path for a CT spec.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

/** The env var `playwright-ct.config.ts` sets, once, before workers fork — the absolute dir of this CT
 *  run's own slot (`reports/runs/ct/<runId>/`). */
export const CT_RUN_SLOT_ENV = "CT_RUN_SLOT_DIR";

const PNG_SUFFIX = /\.png$/iu;

/** The absolute path to write a CT screenshot named `name` — inside THIS CT run's own slot
 *  (`<slot>/snaps/<name>.png`), never a shared alias. `name` may carry the `.png` extension or not (the
 *  call sites this replaced used both spellings). Throws outside a playwright-ct run: `CT_RUN_SLOT_ENV`
 *  is set exactly once, by `playwright-ct.config.ts`, before workers fork. */
export function ctSnapPath(name: string): string {
  const slotDir = process.env[CT_RUN_SLOT_ENV];
  if (slotDir === undefined) {
    throw new Error(
      `ctSnapPath("${name}"): ${CT_RUN_SLOT_ENV} is unset — this only resolves inside a playwright-ct.config.ts run (docs/design/1208-instrument-substrate.md §3.7)`,
    );
  }
  const dir = join(slotDir, "snaps");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name.replace(PNG_SUFFIX, "")}.png`);
}
