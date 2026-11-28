# Buddy brainstorm, landscape, and the front door

This report covers the session work after `2026-11-28-catalog-sandboxing-notes.md`. Measured facts are marked as such. Everything else is analysis or a decision from the owner.

## 1. Front door: install weight (measured)

The install scripts are not the problem. `install.cmd` is a double-click that installs Git and pnpm through winget, then clones, installs, starts and opens the browser. `install.sh` is one `curl` line that needs only Git and offers to install pnpm. Both are simpler than SillyTavern's own install. The weight is in the bytes.

| What | Size |
| - | - |
| `node_modules` after `pnpm install --frozen-lockfile` (measured in a main checkout) | 2.6 GB |
| First-run search and rerank model download (from the wiki Install page) | about 1 GB |
| First `pnpm start` | also builds the client bundle |

- The root `package.json` declares 89 devDependencies and no dependencies, so every user install pulls the full dev toolchain.
- Large dev-only packages in that install:
  - the `codemod` CLI, 148 MB;
  - Biome, 80 MB;
  - jscpd, 46 MB;
  - Stryker, Lighthouse, puppeteer, ESLint and both TypeScript lines.
- Real runtime weight in the same install:
  - onnxruntime-node, 287 MB;
  - the agent-sdk native binary, 277 MB;
  - node-av and its platform binary, about 340 MB.
- Both installers default to the source path, even when Docker is present. The Docker path is the light one: it pulls the published image and builds nothing.
- Both installers clone the full history of `release`.

Fixes, cheapest first:
1. **Default to Docker in both installers when `docker compose` is present.**
2. **Clone with `--depth 1` in both installers.**
3. **Make the source path lean.** Ship the prebuilt client bundle with each release, run `pnpm install --prod`, and confirm that `pnpm start` runs without devDependencies when a bundle exists. Measure what `--prod` removes. This report did not measure it.
4. **Make the model download lazy by default.** `LOCAL_LIGHT_PREFETCH=off` makes the download wait for the first search.

## 2. Front door: README and wiki (read in full)

These pages were read in full: the README and the wiki's Home, Install, Connect a Model, Your First Chat, Coming from SillyTavern, FAQ, Known Issues and sidebar. The other wiki pages were not read.

The docs are good, and the voice works. The gaps are in positioning and in consistency.

- **Pitch order.** The headline is multiplayer ("Roleplay with your friends in the same scene, live"), but most SillyTavern roleplay is solo and private. Lead with the solo features:
  - game state that changes with each swipe;
  - memory that holds a hundred messages back;
  - the Refinery;
  - one-step SillyTavern import.

  Put "and your friends can join" after them. `.github/readme/rpg-swipe.gif` is the strongest asset to lead with.
- **Dealbreakers in the fine print.** Many local-model SillyTavern users rely on things that do not carry over:
  - text completion;
  - ST extensions, STscript and Quick Replies;
  - advanced lorebook activation (sticky, cooldown, recursion), which is stored but inert.

  Say this early so it is not a surprise.
- **The headline feature takes five steps.** Sharing needs password sign-in, an owner password, **Allow multiple humans**, **Discreet login**, then **Start sharing**. Docker also needs three env lines. One button should do the whole setup.
- **Contradiction: the Docker path.** The README says `docker compose up -d` pulls the release image with no build. The wiki Install page, Option 1, builds from the checkout with `-f docker/compose.build.yaml up -d --build`, and its troubleshooting says the image "is never downloaded". Make the prebuilt image the one documented path.
- **Contradiction: providers.** The FAQ's "Which models can I use?" puts KoboldCpp and llama.cpp under Custom OpenAI-compatible and leaves out NanoGPT, LiteRouter and DeepSeek. Connect a Model lists all of these as named entries.
- **The README is half contributor docs.** Move everything from "Work on the code" onward into `CONTRIBUTING.md`: core bets, the package layering, worktrees, release-please, the identity block and the GHCR steps.

## 3. Landscape: Chrysalis Engine and Molfar.Vertep

Both projects are AGPL-3.0. Take ideas from them, never code: copying code into a network-served app brings AGPL obligations with it.

- **Chrysalis Engine** (`ProjectChrysalis/Chrysalis-Engine`) is "the AI frontend you can reshape just by asking".
  - The install is a folder of plain files under git.
  - Its agent, built on the pi agent libraries, edits apps while you watch.
  - App plugins run in QuickJS-ng. Config changes show a diff and wait for approval.
  - Stack: Bun, Hono, React, isomorphic-git. It runs on desktop OSes, Docker and Android.
  - About 33 stars when read.
- **Molfar.Vertep** (`MolfarWav/Molfar.Vertep`) is a fork of Chrysalis with a named agent persona, Molfar, "an old Carpathian sorcerer", drawn as a pixel sprite.
  - Memory notes are written only after the user approves each one.
  - Skills are proposed after a task and saved on approval.
  - Each agent run is a git checkpoint with one-click undo.
  - App permissions are shown before install, and an update that asks for more stops for re-review.
  - The Roleplay app has a relationship dashboard, per-character Soul, chapter memory and a per-part token cost board.
  - About 47 stars when read. The README says AI agents wrote the code.
  - It does not say whether small agent edits need approval, and the agent edits app source directly.

Where Orbweaver differs:
- The buddy only produces sandboxed plugins and never edits core.
- Orbweaver is multi-user, with per-owner scoping, quotas and spend caps.
- Every approval screen is rendered by the host.
- The pet is a hatched companion that each user grows. Molfar is one fixed character.

Ideas worth taking:
1. A checkpoint per buddy run, with one-click undo.
2. Ask before writing a memory.
3. Skills proposed after a task and kept on approval, as the buddy's growth mechanic.
4. Re-review when an update widens permissions.
5. Per-part token costs on the prompt board.

## 4. The buddy: owner decisions and design so far

Owner decisions:
- One buddy per user, locked to that user.
- The buddy may use plugin grants and automation.
- The agent loop runs on the server, so a build keeps going while the tab is idle.

Design positions from the brainstorm (not built):
- **A grant-holding principal.**
  - The buddy is a principal with its own grant set, which the user approves at hatch.
  - The plugin host's existing capability and authority checks apply to it.
  - Anything the buddy builds can request at most what the user approves on that plugin's approval screen.
- **The buddy never approves.**
  - Installs, grant widening, automation rules and settings changes are all proposals.
  - The host renders each one from the bundle or the diff, never from the buddy's own summary.
  - API keys go through the host's credential form, and the buddy never sees them.
- **A build is a workload in the existing workloads domain.**
  - Each build has steps and a spend cap per build.
  - One active build per user, and a server-wide cap on concurrent buddy loops.
  - Buddy test runs get a bounded share of the broker's Workers.
  - Nothing installs while the user is away: the build parks at "awaiting approval".
- **Growth never gates capability.** Growth is personality, memories, hatch forms and the skills the user chose to keep.
- **The prompt-injection threat model governs the design.** Buddy-made rules show their origin, carry loud egress labels, and have a one-click kill-all.

## 5. The buddy workspace: VFS recommendation

- **The store is rows plus CAS.** A workspace-files table over the existing CAS, scoped through the FK chain. Backups cover it, a snapshot per build comes free, and the approval diff comes from two snapshots.
- **One `WorkspaceFiles` contract** in the domain `contract/`: read, write, list, stat and remove over normalized POSIX paths.
- **An overlay compiler host, injected into `plugin-toolchain`.**
  - `/work` reads from the workspace.
  - The TypeScript lib directory and the SDK read from disk, read-only, from an allowlist of roots.
  - Every other path does not exist.
  - Today `compileSource` uses `ts.createCompilerHost` and `readFile` directly (`packages/plugin-toolchain/src/index.ts`), so it needs a file-source seam. The CLI keeps its disk adapter.
- **Use the TS6 JavaScript API, not TS 7 native.** An in-process compiler host needs the JavaScript API.
- **Bound `check` itself.** Run it in a Worker with `resourceLimits` and a deadline. Recursive types are a denial-of-service surface even though no plugin code runs.
- **The existing gate is enough.** `orb-plugin check` already covers strict types, forbidden globals, the manifest, declared capabilities and surface links. ESLint adds nothing behind a runtime boundary.

Libraries:

| Option | Verdict |
| - | - |
| `node:vfs` | Added in Node 26.4.0 behind `--experimental-vfs`. Do not run production on an experimental flag. Its mount mode redirects process `fs`, which is wrong for a multi-tenant server. Revisit when it is stable. Not tested here, because this container runs Node 22. |
| `@platformatic/vfs` | The userland version of the same API. Same concern, and a dependency for about 30 lines of code. |
| `@typescript/vfs` | Its value is fetching lib files from a CDN in the browser. The server has them on disk, so skip it. |
| `memfs` | Already in the tree. Use it in tests of the disk adapter. |
| `@zenfs/core` | Only worth it for a browser-side workspace, which is ruled out. |
| `just-bash` (Vercel Labs) | A TypeScript bash interpreter over a virtual file system, labelled beta. It is the candidate for the terminal pane later, through an adapter onto `WorkspaceFiles`. |

## Sources

- <https://github.com/ProjectChrysalis/Chrysalis-Engine>
- <https://github.com/MolfarWav/Molfar.Vertep>
- <https://github.com/MolfarWav/Molfar.Vertep/releases/tag/v1.18.0>
- <https://nodejs.org/api/vfs.html>
- <https://www.infoq.com/news/2026/05/node-js-file-system/>
- <https://www.typescriptlang.org/dev/typescript-vfs>
- <https://cdn.jsdelivr.net/npm/just-bash@2.14.0/README.md>
- <https://www.npmjs.com/package/@zenfs/core>
