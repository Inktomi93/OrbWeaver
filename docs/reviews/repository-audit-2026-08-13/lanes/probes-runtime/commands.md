# probes-runtime command receipts

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` against the lane snapshot content (all 53 assignment hashes matched when the receipt was made).

| Command | Result | Scope / notes |
| - | - | - |
| `pnpm ast` | exit 0 | Repository-native AST tool usage recorded: symbol-aware `refs`, `callers`, `importers`, plus rot and graph lenses. |
| `pnpm ast importers scripts/probes/st-goldens/generate-goldens.ts` | exit 0, 0 hits | Static-import lens; shell invocations are intentionally outside this lens. |
| `pnpm ast importers scripts/probes/_kit/flags.ts` | exit 0, 1 hit | `tests/tooling/snap-flags.test.ts:6` imports two flag helpers. |
| `pnpm ast importers scripts/probes/_kit/browser.ts` | exit 0, 0 hits | Static-import lens; direct executable scripts remain an exclusion. |
| `pnpm tsx scripts/probes/find-react-element-casts.ts` | exit 0 | Safe read-only positive control: 0 suspicious React casts. |
| `pnpm tsx scripts/probes/find-shitty-casts.ts` | exit 0 | Safe read-only heuristic; candidates only, not findings. |
| `pnpm tsx scripts/probes/useless-fragments.ts` | exit 0 | Safe read-only heuristic: 135 fragments, 25 candidates; not treated as defects. |
| `pnpm tsx -e '…parseViewport…'` | exit 0 | Positive behavioral control: `1920x1080` and zero/missing dimensions behaved as expected; `-1x100` and `100x-1` returned non-null negative viewports. |

Not run: browser, Playwright, ffmpeg, local-server, SillyTavern runtime, provider/SDK, recording, and golden-capture probes. They can launch services, mutate gitignored corpora/artifacts, require unavailable local data or credentials, or make external calls. Their absence is an environment-backed operability gap, not a clean runtime result.

No official repository verification command exited non-zero in this lane, so no canonical failure artifact was applicable.
