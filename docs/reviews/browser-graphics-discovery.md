# Automatic browser graphics environment

## Outcome

The shared browser launcher fills missing graphics context from the current OS user’s sole active local-seat X11 session. It preserves headless mode and caller flags. Both regular and persistent browser launches use the same enriched, already-marked environment. CDP attachment does not change.

Explicit `DISPLAY`, `XAUTHORITY` or `WAYLAND_DISPLAY` keys, including empty values, prevent discovery. `XDG_SESSION_TYPE=wayland` and explicit Ozone/headless backend arguments also prevent it.

The existing platform door owns the Linux queries. `loginctl show-user` lists only the current account’s sessions; selected properties validate session ownership, activity, transport, type, seat and local display format. Selection requires exactly one candidate before checking files. Queries use argv-only subprocess calls with a timeout and output ceiling.

The authority path uses the OS account’s home, not the inherited `HOME`. Metadata must identify a private readable regular file owned by that account and a matching local X socket owned by the account or root. Discovery reads no cookies or process environments. Unavailable, ambiguous, unsupported or untrusted data leaves the inherited environment unchanged. Run markers, leases and unrelated environment values remain intact.

## Verification

All native commands explicitly remove `DISPLAY`, `XAUTHORITY` and `WAYLAND_DISPLAY`. They use an owned static page and temporary browser profiles, not an application, private clone or production container.

| Proof | Actual CDP result | Output |
| - | - | - |
| Unmodified shared launcher | SwiftShader, software posture; compositing and rasterization disabled | `reports/browser-graphics/native-before.log` |
| Regular headless launch | Intel Mesa RPL-S, hardware posture; compositing, rasterization, WebGL and WebGPU enabled | `native-regular-after.log` |
| Persistent headless launch | Same hardware result | `native-persistent-after.log` |
| Actual Snap file-only CLI | Exit 0, hardware posture and enabled rendering features | `snap-file-proof.log` |

The immutable Snap evidence is `reports/runs/snap/hardware-browser-fix-223519-2026-10-26T17-29-50-337Z/run.json`, under this worktree. The recorded acceleration remains the existing CDP classifier’s result; no flags, classification rules or measurement budgets are weakened.

- `pnpm test:tools tests/tooling/floor/browser/browser-graphics.test.ts tests/tooling/floor/browser/browser-acceleration.test.ts`: 8 passed. The cases cover explicit selectors, marker/lease retention, hostile metadata, ambiguity, ownership, permissions, symlinks, missing commands and unsupported platforms.
- `pnpm lint:eslint tooling/src/floor/browser/browser.ts tooling/src/floor/host/platform.ts tests/tooling/floor/browser/browser-graphics.test.ts`: passed.
- Scoped Biome over those source and test paths: passed, no fixes applied.
- `pnpm typecheck tooling/tsconfig.json tsconfig.json`: passed, including the router prerequisite and Node tests.
- Native regular and persistent proof commands: exit 0; all owned browsers close and temporary profiles are removed.
- `env -u DISPLAY -u XAUTHORITY -u WAYLAND_DISPLAY pnpm snap --file reports/browser-graphics/proof.html --no-shot --text --no-deadcss`: exit 0. Dead-CSS auditing is outside this static graphics proof.

The first CLI invocation used unsupported `--file=...` syntax and refused with exit 3 before launching. The corrected command uses the required separate value. Initial ESLint findings were canonical digit-regex spellings; the final checked source resolves them without suppressions.

## Scope

Snap session boot and DevTools asset materialization are the direct launch consumers. Existing explicit display selection, non-X11 desktops, unusual authority locations and machines without a usable local session retain their prior environment behavior. Discovery does not guarantee hardware; actual CDP posture remains authoritative.

The Snap-driving skill documents automatic discovery and its opt-outs. The production container, main’s audit session and stage data remain untouched. No app-driving audit or whole-application qualification is claimed.
