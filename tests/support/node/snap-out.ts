// CT screenshots resolve through the slot opened by playwright-ct.config.ts and inherited by every
// worker. The reporter adopts and publishes the same identity after the run completes.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { CT_RUN_SLOT_ENV } from "@orb/tooling/_shared/ct-run-slot";

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
