// motion-audit's operator contract, moved out of ops/parse.ts to match snap's shape (contract/help.ts is
// prose, not parser machinery — docs/design/1208-instrument-substrate.md §4.3/§10.3). Slice 1 of #1290.
import { appearanceHelpBlock } from "@orb/tooling/_shared/appearance-flags";
import { MOBILE_DEVICE } from "@orb/tooling/_shared/browser-environment";
import { SESSION_FLAG_HELP } from "@orb/tooling/_shared/instrument-argv";
import { panelPresetHelpBlock } from "@orb/tooling/_shared/panel-flags";
import { themeHelpBlock } from "@orb/tooling/_shared/theme";
import { DEFAULT_WINDOW_MS } from "./defaults.ts";

export const MOTION_AUDIT_HELP = `motion-audit — the smoothness ground-truth harness

Usage:
  pnpm motion-audit [route] [flags]

Reach the surface (argv-ordered, run BEFORE the trace; evidence is reset after the last one):
  --click <selector>        --goto <section|settings:cat|modal:slot>
  --open-chat <id|title|latest|current>   --open-character <id|name>   --context-tab <tab>
  --panel <name>=<docked|overlay|collapsed>   drive the shell's panel layout (also the docked↔collapsed
                            FLIP transition — one of the app's largest motion surfaces)
  --focus <on|off>          the shell's zen/focus-mode toggle
  --panels <preset>         reach a NAMED panel configuration in one flag (see Panel state below)

Measure:
  --selector <sel>          THE interaction — clicked inside the trace window
  --window <ms>             observation window (default ${DEFAULT_WINDOW_MS})

${SESSION_FLAG_HELP}

Environment:
  --base <url> · --url <full-url> · --viewport <WxH> · --vnc (headful) · --no-throttle
  --mobile                  ${MOBILE_DEVICE} full descriptor (touch · pointer:coarse · mobile UA · DPR)
  --desktop                 explicit 1280x800 desktop (pointer:fine · hover)
  --os-reduced-motion       emulate prefers-reduced-motion: reduce (independent of app Appearance)
  --os-full-motion          explicit OS full-motion media-query arm (default)
  --matrix                  derive/run the six scenario × app-motion × OS-motion × device cells;
                            the exact reduced mobile entry may report STATIC-EXPECTED only beside the
                            nonzero full-motion mobile interaction control (ordinary zero-frame law stays)
                            rated Appearance recipe: --goto settings:appearance
                            --selector '[data-slot="collapsible-trigger"]'

${panelPresetHelpBlock()}

${appearanceHelpBlock()}

${themeHelpBlock()}
  A single-run motion verdict owes BOTH app arms: bare (the account's real state — does the floor hold?)
  and --full-motion (is the nice stuff good?). The independent --os-full-motion/--os-reduced-motion
  flags change only the browser media query; --matrix derives and runs both app and OS arms.

  --help | -h               print this and exit 0

Exit: 0 pass · 1 budget breach / failed action / page error · 2 nothing was observed (no __orb bridge,
      no composited frame) · 3 CLI misuse.`;
