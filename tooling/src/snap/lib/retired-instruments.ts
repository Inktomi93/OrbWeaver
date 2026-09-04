// Active-recipe census for the two retired rendered CLIs. Mentions in frozen history/reviews and the
// retained internal engine source are provenance, not runnable guidance; every other tracked command
// line is a migration defect. A planted arbitrary path proves the zero can fail.
interface RetiredInstrumentFinding {
  readonly path: string;
  readonly line: number;
  readonly token: string;
  readonly text: string;
}

export interface RetiredInstrumentCensus {
  readonly scannedFileCount: number;
  readonly findings: readonly RetiredInstrumentFinding[];
}

const HISTORICAL_PREFIXES = ["docs/history/", "docs/reviews/", "docs/catalog/"] as const;
const INTERNAL_ENGINE_PREFIXES = ["tooling/src/motion-audit/", "tooling/src/cpu-profile/"] as const;
const MIGRATION_SPECS = new Set(["docs/design/1208-instrument-substrate.md"]);
const SELF_PROOF = "tests/tooling/snap/ops/unified-instrument.suite.int.test.ts";
// This file spells the retired vocabulary as data; once tracked, the corpus sweep reads it back as five
// findings on its own TOKENS line (the untracked overnight tree hid that — `git ls-files` never listed it).
const SELF_SOURCE = "tooling/src/snap/lib/retired-instruments.ts";
const LEGACY_COMMAND = /\bpnpm\s+(?:motion-audit|perf-meter)\b/u;
const TOKENS = ["pnpm motion-audit", "pnpm perf-meter", "--selector", "--window", "--cpuprofile"] as const;

function excluded(path: string): boolean {
  return (
    path === SELF_PROOF ||
    path === SELF_SOURCE ||
    MIGRATION_SPECS.has(path) ||
    HISTORICAL_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    INTERNAL_ENGINE_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

export function retiredInstrumentCensus(files: readonly { readonly path: string; readonly text: string }[]): RetiredInstrumentCensus {
  const findings: RetiredInstrumentFinding[] = [];
  let scannedFileCount = 0;
  for (const file of files) {
    if (excluded(file.path)) {
      continue;
    }
    scannedFileCount += 1;
    for (const [index, line] of file.text.split("\n").entries()) {
      if (!LEGACY_COMMAND.test(line)) {
        continue;
      }
      for (const token of TOKENS) {
        if (line.includes(token)) {
          findings.push({ path: file.path, line: index + 1, token, text: line.trim() });
        }
      }
    }
  }
  return { scannedFileCount, findings };
}
