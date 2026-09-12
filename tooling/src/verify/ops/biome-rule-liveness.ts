// The `config:biome-rule-liveness` stage — the SUCCESSOR to `biome-grant-liveness` arm six (#2074),
// deleted with a receipt by `97e68be91` because §12.3 forbids a final policy from doing a filesystem
// WRITE plus a subprocess spawn. The deletion was right; the HOLE it left is not.
//
// WHAT NOTHING ELSE ASKS. A `biome.json` override row that turns a rule OFF for named files is a promise
// that those files WOULD violate it. Path liveness — the arms that survived — proves the granted SUBJECT
// exists; it cannot prove the granted RULE still fires. A rule-off grant on a file that stopped violating
// the rule years ago is invisible to every other arm, and it is a LOADED GUN: the next violation written
// at that path inherits an exemption nobody granted it. There is no static way to ask this question. The
// only honest answer is to strip the rule-off grants from a COPY of biome.json, run the real biome binary
// over the granted files, and read which grants suppressed nothing — a write and a spawn, which is exactly
// why this is an OP and not a policy. `ops/config-snapshot.ts` already spawns a niced child for this class.
//
// IT REFUSES RATHER THAN GUESSES. Every shape this arm cannot trust — a truncated report, a non-lint
// diagnostic (the probe config broke), output that is not the reporter's shape, a run that processed ZERO
// files — THROWS, which the runner turns into exit 2. That matters more here than almost anywhere: each of
// those failures produces an EMPTY diagnostic list, which is byte-identical to "every grant is dead" and
// would red the whole config. A bare zero from this arm is never a verdict. The refusals live in
// `lib/biome-rule-liveness.ts` beside the judgement, so they are pinnable without spawning biome.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { RuleLivenessOutcome } from "../lib/biome-rule-liveness.ts";
import { judgeRuleLiveness } from "../lib/biome-rule-liveness.ts";
import { isFileExact } from "../lib/grant-liveness.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:biome-rule-liveness");

const CONFIG_REL = "biome.json";

/** The report lines, in the order a reader needs them: the denominators first, then the findings. */
export function ruleLivenessReport(outcome: RuleLivenessOutcome): readonly string[] {
  const lines = [
    `biome-rule-liveness — ${String(outcome.live)} live · ${String(outcome.dead.length)} dead rule-off grant(s) over ${String(outcome.filesProbed)} probed file(s); ` +
      `${String(outcome.filePairs)} (file × rule) pair(s), ${String(outcome.deadFilePairs)} of them unfired; ${String(outcome.skippedMixed)} mixed row(s) skipped (declared limit)`,
  ];
  for (const grant of outcome.dead) {
    lines.push(
      `  ${CONFIG_REL}: the rule-off grant \`${grant.group}/${grant.rule}\` over ${grant.anchor} suppresses NOTHING — ` +
        `the rule fires on none of its ${String(grant.files.length)} subject(s). Delete the grant; it is an exemption the next violation at that path would inherit.`,
    );
  }
  return lines;
}

/** The `biome-rule-liveness` verb. Exit 0 = every rule-off grant still suppresses something; 1 = a dead
 *  grant is named; 2 = the arm could not measure (thrown from the reader, never a clean zero here). */
export function runBiomeRuleLiveness(root: string): number {
  const configAbs = join(root, CONFIG_REL);
  if (!existsSync(configAbs)) {
    // THE BLINDNESS TRIPWIRE. No config means no grants means zero findings — a green that says nothing.
    throw new Error(`biome-rule-liveness: ${CONFIG_REL} is not on the tree, so there are no grants to judge and a clean exit would claim there were none.`);
  }
  const outcome = judgeRuleLiveness({ root, configText: readFileSync(configAbs, "utf8"), isExactPath: isFileExact });
  for (const line of ruleLivenessReport(outcome)) {
    process.stdout.write(`${line}\n`);
  }
  return outcome.dead.length > 0 ? EXIT.violations : EXIT.clean;
}
