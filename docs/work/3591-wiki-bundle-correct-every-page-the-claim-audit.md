---
kind: work
status: open
updated: 2026-11-20
priority: P1
area: docs
---

# Wiki bundle: correct every page the claim audit found wrong

## What

Edit the separate wiki repository, page by page. Fixes by page and line.

Connect-a-Model: `:58` sends users to OpenRouter for DeepSeek, which is a built-in provider (`packages/contracts/src/inference/builtin-providers.ts:140-141`). The provider table omits NanoGPT (`:84-85`), LiteRouter (`:116-124`) and DeepSeek (`:140-141`) that the picker shows. State the blank Max output default of `2048` tokens (`packages/contracts/src/preset/index.ts:403`) beside the `4096` capability assumption at `:137` and say which wins. `:39` denies marks and filters on an own-server model list, which the picker draws (`catalog/listing.ts:53-63`, `model-picker-row.tsx:53-58`).

Install: `:28` says one command installs Git, which only `install.cmd:29` does, and says it asks Docker or source, which it asks only when Docker is present. `:63` omits the two seating switches (`user-admin/lib/share-model.ts:108-109`) and the owner-password precondition. `:120` credits the install workflow with the plugin-host proof, which lives in `contributor.yml:56-88` and `ci.yml`. `:16-22` cites a reranker-swap probe results file that is not in the repo for the RAM figure and the timings: publish the probe or drop the claim.

FAQ: `:7` says there is no one-click installer, against `install.cmd:2` and `Features.md:163`. `:121` and `Home.md:110` state a custom gate count with no basis; the gates are replaced. `Home.md:110` also gives a test file figure that matches no measure. `FAQ.md:33,75` and `Features.md:33` describe group chats without the gate stated in `Rooms-and-Group-Chats.md:13,175`: link the page.

Troubleshooting: `:76` names Run the understanding pass; the button is Sort my characters (`use-understanding-pass.ts:82`).

Coverage gaps: add the `docker/compose.cloudflared.yaml` overlay; the installer levers `ORB_DIR`, `ORB_MODE` and `ORB_START` (`install.sh:5,11,42-45`); `IP_ALLOWLIST`, `AUTH_BREAK_GLASS`, `BIND_HOST` and the `release-assets.githubusercontent.com` egress host; the Data Bank rail section; Connections Advanced context and output overrides. `Share-with-Friends.md:131-137` must say the server stops listening on loopback before it serves HTTPS at a public address (`ip_certificate_loopback_bind`).

Under-the-Hood: rewrite around the compiler, dependency-cruiser with the retained lint, and production-root tests. `:33,108` point at a gates folder that is gone. `:52-58` ends the tier chain at Kit; the server chain is `entry`, `transport`, `domain`, `infra`, `foundation`, `primitives` (`.dependency-cruiser.ts:260-306`) and `kit` is a separate package. `:68` describes pre-push as CI; `lefthook.yml:58-109` runs static checks and the repo-integrity list only. `:13` lists file caps no rule enforces. `:103` names six places for CSS; read `client-architecture-lockdown.md:93-107`. Refresh the test, ratio and `any` figures, or drop them. Describe the CI workflows from `.github/workflows/`.

How-a-Turn-Is-Built: `:95` says a fork pin clears when you do not own the persona; `fork.ts:729-731` copies the pin and `participants-humans.ts:130-141` reads it as held.

Rooms-and-Group-Chats: quotation drift at `:47` host-error copy, `:54` the zero-percent fallback (`select-speakers.ts:96-100`) and `:112` the unread-dot rule (`rail.tsx:178-180`). RPG-Mode: `:183` quotes Maps are planned, which exists nowhere. How-Memory-Works: say that a memory can be struck (`memory-view-copy.ts:4,20`), and use the word Strike.

Characters-and-Personas: `:78` offers Everywhere or This chat, which does not exist (`use-playing-persona.ts:98-125`). The resolution order is connected, default, current (`start-chat.ts:164-168`), not connected, current, default. Add a short model of the per-chat seat, `currentPersonaId` and the default. `:58` and `Privacy-and-Security.md:129` name the trust options Untrusted and Render HTML; the labels are Plain text, Rich HTML and Interactive (`character-trust-tab.tsx:56-60`). Coming-from-SillyTavern: `:56,89` omit the regex refusal ceiling (`regex/schemas.ts:441-500`, `report.ts:95-101,220-222`); the macro count at the two places drifted from the metadata table.

Plugins: `:99` denies a topbar placement that exists (`packages/contracts/src/plugin/ui.ts:1530`, `plugin-topbar-chrome.tsx:10-22`). `:29` says Choose lore book; the select is World book (`research-familiar/ui.ts:17`). Presets: `:9` says activation confirms with a notice; it shows none (`preset-library-surface.tsx:142-149`). Automation: `:25` says Custom rule; the button is Write your own (`rule-copy.ts:207`).

Back-Up-and-Restore: `:51` and `Known-Issues.md:15` say a backup omits embedding and compaction spend history; it keeps them (same fix as the app copy item). Share-with-Friends: `:9` says the Next reply line names the host's chat connection; the chat page names none (`composer-next-turn-line.tsx:1-4,48-52`). Privacy-and-Security: `:153` claims named exceptions to `minimumReleaseAge`; none exist.

Images: `:7` says the person who pressed Generate pays for a room picture; the room host pays (`imagery/contract/service.ts:49,115`, `imagine-names.ts:47`) and `:82` already says so. `:14` quotes a label with the old separator; the label is `Imagine: modes & preview…` (`composer-menu-names.ts:14`). Themes: `:39` denies video backgrounds, which ship (`packages/contracts/src/assets/index.ts:49`). Stats-and-Insights: explain the `~` prefix on approximate day labels (`analytics-copy.ts:3-8`).

Home: `:52` advertises a tension needle that has no match in the code; drop it or find it. Credits: name the plugins and template repositories the page omits, and point at an attribution file or say none exists.

## Why

The audit graded these claims against the code. The user-facing ones tell readers to use options that are not on screen, to pay for a picture the host funds, and to send DeepSeek through OpenRouter.

## Done when

Every page and line above reads true against the code it cites, a second read of each cited file confirms it, and the wiki change is pushed by the owner.

## Evidence

Filled at landing: what ran and where its output is.
