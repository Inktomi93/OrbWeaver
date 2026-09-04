// design-audit's operator contract, moved out of ops/parse.ts to match snap's shape (contract/help.ts is
// prose, not parser machinery — docs/design/1208-instrument-substrate.md §4.3/§10.3). Slice 1 of #1290.
import { appearanceHelpBlock } from "@orb/tooling/_shared/appearance-flags";
import { DEFAULT_BASE } from "@orb/tooling/_shared/browser";
import { SESSION_FLAG_HELP } from "@orb/tooling/_shared/instrument-argv";
import { panelPresetHelpBlock } from "@orb/tooling/_shared/panel-flags";
import { themeHelpBlock } from "@orb/tooling/_shared/theme";
import { DEFAULT_FAIL_ON, DEFAULT_SETTLE_MS } from "./defaults.ts";

export const DESIGN_AUDIT_HELP = `design-audit — the deterministic UI defect scan

Usage:
  pnpm design-audit [route] [flags]

The positional is a URL PATH on the audited origin, never a section lookup: \`design-audit characters\`
loads \`/characters\`. Every rail section happens to BE a path — \`/<section>\` is a real deep-link alias
(routes/router.tsx #181): it selects the section and lands on \`/\`. Anything that is not a section, a
settings category or a modal slot has no route, so it renders the app's not-found boundary — which this
tool refuses to audit (an error boundary is not a surface: exit 2, no findings, no populations). To reach
a surface WITHOUT a page load — including every settings/modal target — audit \`/\` and drive \`--goto\`.

Surface (ONE argv-ordered queue — write the chain the way it should happen):
  --click <selector>        --goto <section|settings:cat|modal:slot>
  --open-chat <id|title|latest|current>   --open-character <id|name>
  --upload <selector>=<path[,path...]>    choose file(s) through a direct/descendant input or a trigger's
                            filechooser; one directory is legal only for webkitdirectory. Paths stay
                            inside the repo/tmp fixture boundary. Same engine/receipt as snap --upload.
  --context-tab <tab>       --panel <name>=<docked|overlay|collapsed>   drive the shell's panel layout
  --focus <on|off>          the shell's zen/focus-mode toggle
  --panels <preset>         reach a NAMED panel configuration in one flag (see Panel state below)
  --settle <ms>             settle after the last action (default ${DEFAULT_SETTLE_MS}) — was --wait until
                            #1290 F1 (snap's --wait names a SELECTOR; this one always meant milliseconds,
                            perf-meter's/record's spelling); --wait is now refused BY NAME, never silently
                            accepted as a positional or an unknown flag

Environment:
  --viewport <WxH>          default 1280x800
  --wide                    1920x1080 desktop viewport
  --mobile                  iPhone 14 Pro Max — touch + pointer:coarse (the 44px tap floor)
  --desktop                 explicit 1280x800
  --dark | --light          emulate the browser colour-scheme media query
  --reduced-motion          emulate prefers-reduced-motion: reduce
  --matrix                  derive and run the 13-cell Appearance/theme/device representative matrix

Where it audits (default: ${DEFAULT_BASE} — the dev stack, which serves MAIN, never a worktree):
  --base <url>              audit an already-running origin (a stage, a file:// dir) — conflicts with the
                            stage flags below; two answers to "where" is refused, never defaulted
  --isolated                boot/reuse snap's ISOLATED STAGE (a second dev stack on offset ports, serving a
                            DETACHED worktree at a commit) and audit THAT — how a lane audits its own branch
  --ref <sha|branch|tag>    the commit the stage serves (implies --isolated; default HEAD). A ref this
                            checkout cannot resolve is CLI misuse — it never falls back to the dev stack
  --dirty                   stage the WORKING TREE instead of a commit (implies --isolated)
  --fresh                   rebuild the stage instead of reusing the warm one (implies --isolated)

  STAGE DB: the stage serves its OWN db — a FRESH stage sha copies the dev db at boot; a stage dir that
  already exists KEEPS the db it had (possibly older/thinner than dev). A corpus-dependent finding, or its
  absence, is a claim about THAT db. A run that BOOTS the stage REFUSES (exit 2) rather than judging a
  cold surface — vite's dep-optimizer is still churning and the walk would census a fraction of the page and
  call it clean — so the first invocation warms the stage and the second one measures it. Stage admin is
  snap's: pnpm snap --stage-status|--stage-down|--stage-sweep.

${SESSION_FLAG_HELP}

${panelPresetHelpBlock()}

${appearanceHelpBlock()}

${themeHelpBlock()}

Verdict:
  --fail-on <P0|P1|P2|P3>   exit 1 at this severity or worse (default ${DEFAULT_FAIL_ON})
  --out <name|path>         reports/design-audit/<name>.json — or, path-shaped (absolute / ./ ../),
                            that exact file
  --json                    explicitly request the JSON report (design-audit always writes one)

  --help | -h               print this and exit 0

Exit: 0 clean · 1 findings · 2 NOT A VERDICT (empty walk, nav error, an action that did not land, or a
      declared failure surface) · 3 CLI misuse.`;
