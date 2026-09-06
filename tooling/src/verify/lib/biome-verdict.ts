// The OUTPUT-HONESTY audit for the `lint:biome` stage (#1245). Biome's exit code is not its whole
// verdict: a JSONC comment placed directly before an element of `biome.json`'s `overrides` array breaks
// the WHOLE config parse, and biome then processes ZERO files while printing no diagnostic about it at
// ANY `--diagnostic-level` (measured on biome 2.5.1, 2026-09-06). With `--no-errors-on-unmatched` — the
// flag the registry's SCOPED biome argv carries, so that a legitimately config-ignored path is not a
// failure — that run exits 0 and says `Checked 0 files`. Every consumer downstream reads a green lint.
//
// A count of zero has TWO causes, and they are NOT the same fact (memory: `empty-population-vs-broken-probe`):
//   • the APPARATUS is broken (config parse failure) — nothing was measured, so the run is not a verdict;
//   • the POPULATION is honestly empty — every selected path is ignored by biome.json (a scoped run over
//     `routeTree.gen.ts` alone reaches this legitimately), and biome DID work.
// A blunt "zero ⇒ refuse" would cry wolf on the second, which trains readers to ignore exit 2. So a zero
// is DISCRIMINATED by a planted positive control in the same invocation: re-run biome over a sentinel the
// config must always lint. Control also zero ⇒ the config is broken ⇒ exit 2. Control non-zero ⇒ the zero
// was honest ⇒ the stage stays green and SAYS SO in a notice, because "linted nothing" must never read as
// "linted clean" in silence either.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runNicedSync } from "../../_shared/proc.ts";
import type { TranscriptAudit } from "../contract/stage.ts";

/** biome's own summary line, in every text reporter: `Checked 12 files in 3s.` / `Checked 1 file in 4s.` */
const CHECKED_LINE = /Checked (\d+) files? in /u;

/** The control's subject: the repo manifest. It is JSON (biome lints it), it is matched by `files.includes`'
 *  `**`, it is never negated, and it cannot be absent from a checkout — so "the control checked 0 files" can
 *  only mean the config did not apply. If someone ever ignores it, this refuses LOUDLY on every zero rather
 *  than going quietly blind, which is the direction an honesty guard is supposed to fail in. */
const CONTROL_SUBJECT = "package.json";
const BIOME_BIN = join("node_modules", ".bin", "biome");
/** biome's lint contract: 0 clean, 1 diagnostics. The control only asks HOW MANY FILES, so both count. */
const CONTROL_ACCEPTED_EXITS: readonly (number | null)[] = [0, 1];

/** The processed-file count biome printed, or `null` when its output carries no count line at all. */
export function parseCheckedFileCount(transcript: string): number | null {
  const match = CHECKED_LINE.exec(transcript);
  if (match?.[1] === undefined) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

/** Run the planted positive control: biome over `package.json` under the SAME config resolution (same cwd,
 *  no `--config-path` — an out-of-repo config path moves biome's project root and changes the question).
 *  Returns the control's own processed-file count, or `null` when the control itself could not be run. */
export function controlProbeCount(root: string): number | null {
  const bin = join(root, BIOME_BIN);
  if (!existsSync(bin)) {
    return null;
  }
  const res = runNicedSync(bin, ["check", CONTROL_SUBJECT, "--reporter=concise", "--no-errors-on-unmatched", "--diagnostic-level=error"], { cwd: root });
  if (!CONTROL_ACCEPTED_EXITS.includes(res.status)) {
    return null;
  }
  return parseCheckedFileCount(`${res.stdout}${res.stderr}`);
}

const REFUSAL_HEAD = "lint:biome measured NOTHING — this run is not a verdict.";

/** Judge one biome transcript. `readControl` is INJECTED so the discrimination is pinnable without
 *  spawning biome (and so a test can plant either arm of the control). Returns `null` when the transcript
 *  is an honest measurement of at least one file — the overwhelmingly common case, and the only one that
 *  costs nothing. */
export function auditBiomeTranscript(transcript: string, readControl: () => number | null): TranscriptAudit | null {
  const checked = parseCheckedFileCount(transcript);
  if (checked === null) {
    return {
      kind: "refusal",
      message: `${REFUSAL_HEAD} biome printed no "Checked N files" line, so how many files it processed is unknown — its output contract changed, or it died before summarising.`,
    };
  }
  if (checked > 0) {
    return null;
  }
  const control = readControl();
  if (control === null) {
    return {
      kind: "refusal",
      message: `${REFUSAL_HEAD} biome checked 0 files and the control probe over ${CONTROL_SUBJECT} could not be run at all (no ${BIOME_BIN}, or it exited outside its lint contract), so the zero cannot be discriminated.`,
    };
  }
  if (control === 0) {
    return {
      kind: "refusal",
      message:
        `${REFUSAL_HEAD} biome checked 0 files and so did the control probe over ${CONTROL_SUBJECT} — biome.json IS NOT BEING APPLIED. ` +
        "The known cause is a JSONC comment inside an array in biome.json (an `overrides` element preceded by a `//` line): the config parse fails whole, biome silently ignores every path, and with --no-errors-on-unmatched it exits 0. Fix the config and re-run; do not read this as a clean lint.",
    };
  }
  return {
    kind: "notice",
    message: `lint:biome checked 0 files: every selected path is ignored by biome.json (the control probe over ${CONTROL_SUBJECT} checked ${String(control)}, so the config IS applied). Nothing here was linted.`,
  };
}

/** The registry's hook: the audit bound to the REAL control probe. */
export function biomeStageAudit(transcript: string, root: string): TranscriptAudit | null {
  return auditBiomeTranscript(transcript, () => controlProbeCount(root));
}
