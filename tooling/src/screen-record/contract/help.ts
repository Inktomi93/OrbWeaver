// record's operator contract, moved out of ops/parse.ts to match snap's shape (contract/help.ts is
// prose, not parser machinery — docs/design/1208-instrument-substrate.md §4.3/§10.3). Slice 1 of #1290.
import { SESSION_FLAG_HELP } from "@orb/tooling/_shared/instrument-argv";
import { DEFAULT_FRAMES_OFFSET_MS, DEFAULT_SETTLE_MS } from "./defaults.ts";

export const RECORD_HELP = `record — animation-responsiveness screencasts

Usage:
  pnpm record [route] [flags]

Steps (ONE argv-ordered tape):
  --click/--jsclick/--hover <sel>   --fill "sel=value"   --wheel "sel=dy"   --pause <ms>

Run:
  --base <url> · --viewport <WxH> · --settle <ms> (initial, default ${DEFAULT_SETTLE_MS}) ·
  --out <name> · --frames [offsetMs] (per-step full-res PNGs, default offset ${DEFAULT_FRAMES_OFFSET_MS})

${SESSION_FLAG_HELP}
                          A --session recording opens its OWN new context on the shared browser (Playwright
                          can only enable video capture at context-creation time), never the session's live
                          page/tab.

  --help | -h               print this and exit 0

Exit: 0 recorded · 1 step failure / page error · EXIT.misuse on a bad CLI.`;
