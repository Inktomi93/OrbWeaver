// perf-meter's operator contract, moved out of ops/parse.ts to match snap's shape (contract/help.ts is
// prose, not parser machinery — docs/design/1208-instrument-substrate.md §4.3/§10.3). Slice 1 of #1290.
import { appearanceHelpBlock } from "@orb/tooling/_shared/appearance-flags";
import { SESSION_FLAG_HELP } from "@orb/tooling/_shared/instrument-argv";
import { panelPresetHelpBlock } from "@orb/tooling/_shared/panel-flags";
import { themeHelpBlock } from "@orb/tooling/_shared/theme";

export const PERF_METER_HELP = `perf-meter — per-step interaction responsiveness

Usage:
  pnpm perf-meter [route] [flags]

Steps (ONE argv-ordered tape; each gets its own measurement window):
  --click/--jsclick/--hover <sel>   --fill "sel=value"   --pause <ms>
  --wheel "sel=dy"   --wheelburst "sel=dy:n"
  --goto <section|settings:cat|modal:slot>   --open-chat <id|title|latest|current>
  --open-character <id|name>   --context-tab <tab>
  --panel <name>=<docked|overlay|collapsed>   --focus <on|off>
  --panels <preset>                 reach a NAMED panel configuration in one flag (see Panel state below)

Run:
  --base <url> · --viewport <WxH> · --settle <ms> · --cycles <n> · --out <name> · --cpuprofile

${SESSION_FLAG_HELP}

${panelPresetHelpBlock()}

${appearanceHelpBlock()}

${themeHelpBlock()}

  --help | -h               print this and exit 0

Exit: 0 clean · 1 step failure / page error · 2 nothing was metered (absent meter / no steps) · 3 CLI misuse.`;
