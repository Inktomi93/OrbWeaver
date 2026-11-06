// The stage-root fence reads a live process's cwd and argv, so each case plants a real idle node process.
// Only a path whose segments are exactly `.cache/snap-stage` counts: a backup or renamed lookalike never does.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { pidIsStageRooted } from "../../../../tooling/src/snap/ops/stage-probe.ts";
import { scaledBudget } from "../../_load-budget.ts";

const READY = "ready\n";
const IDLE_SOURCE = `process.stdout.write(${JSON.stringify(READY)}); setInterval(() => undefined, 1_000_000);`;

const HOMES = [
  { name: "a stage dir", segments: [STAGE_ROOT_REL, "abc123"], rooted: true },
  { name: "the stage root itself", segments: [STAGE_ROOT_REL], rooted: true },
  { name: "a backup lookalike of the stage root", segments: [`${STAGE_ROOT_REL}-backup`, "abc123"], rooted: false },
  { name: "a name that merely ends in the cache dir", segments: [`x${STAGE_ROOT_REL}`, "abc123"], rooted: false },
] as const;

for (const { name, segments, rooted } of HOMES) {
  for (const channel of ["cwd", "argv"] as const) {
    test(`${name} is ${rooted ? "" : "not "}stage-rooted through its ${channel}`, { timeout: scaledBudget(30_000) }, async ({ scratch }) => {
      const home = join(scratch, ...segments);
      mkdirSync(home, { recursive: true });
      const script = join(home, "idle.mjs");
      writeFileSync(script, IDLE_SOURCE);
      // The cwd probe runs inline code from the planted dir; the argv probe runs the script by a path under
      // that dir from a neutral cwd, so each channel is the only one that can name the stage.
      const neutral = join(scratch, "neutral");
      mkdirSync(neutral, { recursive: true });
      const child = spawn(process.execPath, channel === "argv" ? [script] : ["-e", IDLE_SOURCE], {
        cwd: channel === "cwd" ? home : neutral,
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        await once(child.stdout, "data");
        if (child.pid === undefined) {
          throw new Error("the planted child has no pid");
        }
        expect(pidIsStageRooted(child.pid)).toBe(rooted);
      } finally {
        child.kill("SIGKILL");
      }
    });
  }
}
