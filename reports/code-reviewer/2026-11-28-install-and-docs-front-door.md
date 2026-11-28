# Install weight and the docs front door

The README and these wiki pages were read in full: Home, Install, Connect a Model, Your First Chat, Coming from SillyTavern, FAQ, Known Issues and the sidebar. The other wiki pages were not read. `install.sh` and `install.cmd` were read in full.

## Install weight (measured)

The install scripts are not the problem.
- `install.cmd` is a double-click. It installs Git and pnpm through winget, then clones, installs, starts and opens the browser.
- `install.sh` is one `curl` line. It needs only Git, and offers to install pnpm.

The weight is in the bytes.

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
- Both installers default to the source path, even when Docker is present. The Docker path pulls the published image and builds nothing.
- Both installers clone the full history of `release`.

Fixes, cheapest first:
1. **Default to Docker in both installers when `docker compose` is present.**
2. **Clone with `--depth 1` in both installers.**
3. **Make the source path lean.** Ship the prebuilt client bundle with each release, run `pnpm install --prod`, and confirm that `pnpm start` runs without devDependencies when a bundle exists. Measure what `--prod` removes. This report did not measure it.
4. **Make the model download lazy by default.** `LOCAL_LIGHT_PREFETCH=off` makes the download wait for the first search.

## README and wiki

The docs are good, and the voice works. The gaps are positioning and consistency.

- **Pitch order.** The headline is multiplayer, but most SillyTavern roleplay is solo and private. Lead with the solo features:
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
