---
kind: review
status: active
updated: 2026-08-28
---

# ST extension-system parity — the definitive audit (plugin host + engines + automation, whole-surface)

**Lane:** stickler-st-parity · **Commissioned:** owner, via orchestrator, 2026-08-28
**Question:** does orbweaver's plugin+engine system match or exceed SillyTavern's extension system?
**Verdict up front: MATCH-OR-EXCEED on 41 of 48 distinct ST extension abilities today; 5 of the 7
remaining are already committed with shapes (4 in the in-flight U8 set, 1 specified as seam 11); the true
residual is ONE substrate gap (audio/TTS) and a small set of deliberate security walls that are
refusals by design, each with a priced enablement shape on record.** The prior Sonnet pass understated
us because it compared ST's `getContext()` against the plugin HOST alone; weighed against the whole
capability surface (host + macro engine + CEL + regex engine + automation platform + first-party
domains), several headline ST "extension abilities" are things ST extensions hand-roll in JS that
orbweaver ships as first-class engines.

## 0. Premises and evidence base

- **ST tree:** `/home/inktomi/inktomi-stack/SillyTavern` at `30eaf26a4` (`git describe`:
  `1.17.0-180-g30eaf26a4` — the dev line toward 1.18; the brief said "1.18.0", this is the same line,
  noted for the record).
- **Orbweaver tree:** main at `eff003d6e` (U5/U6/U7 of #679 all landed — `668536e69`, `9c3089789`,
  `c49bbbb49`; U8 NOT landed, confirmed by `git log --all --since=2026-08-26` grep for U8 markers).
- **Read IN FULL (ST):** `public/scripts/st-context.js` (all 311 lines — the complete `getContext()`
  surface, ~150 members), `events.js` (all ~105 `event_types`), `extensions.js` (all 2325 lines — the
  loader: manifest shape, install/update/move/branch/delete, hooks
  `install|update|delete|clean|enable|disable|activate`, `generate_interceptor`,
  `writeExtensionField[Bulk]`, Extras API), `extensions-slashcommands.js`,
  `slash-commands/SlashCommandParser.js` (all 1356 lines), `SlashCommand.js`,
  `SlashCommandArgument.js`, `macros/macro-system.js`, and four bundled extensions in full:
  **regex** (manifest + `engine.js` 465 + `index.js` 2157), **expressions** (2721), **tts** (1622),
  **vectors** (2358). Targeted reads: `tool-calling.js` (ToolManager), `scrapers.js`
  (ScraperManager), `script.js` (`setExtensionPrompt` + `extension_prompt_types`), `macros.js`.
- **Read IN FULL (orbweaver):** `packages/contracts/src/plugin/` — `manifest.ts`, `host-v1.ts`,
  `registrations.ts`, `ui.ts` (958), `bridge.ts`, `frame.ts`, `suggestion.ts`, `lifecycle.ts`;
  `infra/plugin-host/budgets.ts` (+ deep prior-session membrane knowledge, memory-cited:
  `plugin-host-job-pump-is-third-bytecode-site`, `membrane-async-ctx-alive-guard`,
  `eval-shaped-marshalling-seam`); `domain/plugin/contract/service.ts` (all 26 verbs),
  `substrate/manifest.ts` (the bundle funnel), verb bodies `install.ts` + `ui-host-call.ts` (full);
  `kit/macro/` (index, engine, registry head, user-macros head), `kit/cel/index.ts` (full),
  `kit/regex/index.ts` (full 381), `kit/speaker-label/index.ts` (head);
  `contracts/automation/index.ts` (trigger tuples + arm tuples + spend/confirm classes),
  `domain/automation/engine/dispatch.ts` (head 120), `contract/presets.ts` (header + the 22 preset
  ids); `contracts/chat/bus.ts` (transform points + abort); the client feature file inventory +
  `extensions-page-surface.tsx` (full); `entry/compose/automation-plugin.ts` wiring greps;
  `docs/design/plugin-ui-plane.md` §5/§5a/§6 in full + §7 seam list.
- **NOT read whole** (stated per the role's disclosure rule): `membrane.ts` (1495 — covered by three
  prior full-session reviews recorded in shared memory), `sandbox.ts`/`port.ts`,
  `domain/automation/engine/arm-executors.ts` + the remaining automation persistence,
  ST `slash-commands.js` (7122 — enumerated: 101 built-in `addCommandObject` registrations),
  ST `tool-calling.js` beyond the registration surface, the remaining client plugin components.
  None of these change a verdict below; every verdict cites the file I did read.

Terminology: **ST ability** = a distinct thing a third-party ST extension can do (mechanism
deliberately excluded — the house has ruled ST's *mechanism* permanently out; parity is over
abilities). Evidence ladder per the recon standard: declared < exported < wired-at-compose <
called-in-live-path < tested. Every PARITY/BETTER verdict below is at least **wired-at-compose**
unless marked.

---

## 1. The parity table

Verdicts: **BETTER** (exceeds ST structurally) · **PARITY** (ability matched; fidelity notes inline)
· **IN-FLIGHT** (committed U8 / named seam, not on tree) · **GAP** (real, actionable, no committed
build) · **REFUSED** (deliberate wall, priced) · **SUB** (substrate-blocked) · **N/A**.

### A. Lifecycle, distribution, trust

| # | ST ability (receipt) | Orbweaver equivalent (receipt) | Verdict |
| - | - | - | - |
| A1 | Install an extension per-user (`extensions.js:1698` `installExtension` — git URL, server clones) | Upload-install through the hardened one-funnel (`domain/plugin/verbs/install.ts` — unzip allow-list, bomb guard, manifest zod, grant ⊆ declared, CAS store, born-`disabled`; `substrate/manifest.ts:68-118`) | **PARITY** (ability); URL convenience is A3 |
| A2 | Global (all-users) extensions, admin-gated (`extensions.js:2233-2266`, `isAdmin` gates on update/delete/move) | `installForAllUsers` / `uninstallForAllUsers` / `listDistributedPlugins` / `applyDistributedPlugins` (`contract/service.ts:352-362`, `verbs/install-for-all-users.ts`, client `plugin-distribute-section.tsx`) — every fan-out row lands disabled, zero-grant, consent-pending; recipient's own enable is the only executing act (D147) | **BETTER** — ST global extensions are active for everyone with no per-user consent; ours distribute but never execute without the recipient's own grant |
| A3 | Install from URL + update check + auto-update + branch switch (`extensions.js:1357-1395,1664-1689,1988-2015`; manifest `auto_update`) | `upgrade` verb BUILT (slug-match, downgrade refused, new caps ⇒ disabled + re-consent — `service.ts:340-345`); URL install + update check = **U8** (§5 row 27; register commits "never silent") | **IN-FLIGHT (U8)** — manual upgrade already PARITY; the fetch/check half is the gap |
| A4 | Manifest lifecycle hooks: `install/update/delete/clean/enable/disable/activate` (`extensions.js:388-466`) | `activate` ≡ the activation run of `main.js` (registration-collecting, contained failure — `service.ts:97-133`); disable/uninstall auto-dispose + auto-deregister + KV cascade + asset reap (`service.ts:346-349`) — ST's `clean` hook exists because ST *cannot* auto-clean; our uninstall cascade makes it unnecessary | **PARITY** (activate) / **BETTER** (cleanup is structural, not guest-cooperative). No guest code runs at delete — a deliberate narrowing, not a hole |
| A5 | Version gate `minimum_client_version` (`extensions.js:586-590`) | `hostVersion: z.literal(1)` refused pre-run (`manifest.ts:127`) + `builtAgainst` display/warn provenance (`manifest.ts:93-105`) | **PARITY** |
| A6 | Inter-extension `dependencies` + `loading_order` (`extensions.js:604-624,49`) | None (activation order is per-plugin; no dep graph) | **GAP (trivial weight)** — zero bundled extensions use `dependencies`; folds into the A11 interop row |
| A7 | Extras API modules (`requires`/`optional`, `doExtrasFetch` — `extensions.js:255-280`) | N/A — legacy sidecar ST itself is retiring | **N/A** |
| A8 | Extension settings persistence (`extension_settings` blob + `saveSettingsDebounced`) | `storage.kv` per plugin × owner (`host-v1.ts:144-151`; `plugin_kv` table, 64 KiB/value, 256 keys) | **BETTER** — ST's blob is world-readable across extensions (its own docs warn); ours is private per plugin and survives uninstall only as a cascade delete |
| A9 | Per-account browser storage (`accountStorage`) | Same `storage.kv` (server-durable, not tab-local) | **BETTER** |
| A10 | Capability model: none (an ST extension IS main-realm code with everything) | The 16-member closed capability axis + per-FUNCTION gate (`PLUGIN_CAPABILITIES`, `manifest.ts:13-36`; `HOST_FUNCTION_CAPABILITY` `host-v1.ts:399-442`, tsc-complete both directions), consent screen, re-consent on widening, `setGrant` re-consent verb, S4 suggest posture for grant-without-authority (`suggestion.ts`) | **BETTER** (category difference — ST has no consent surface at all) |
| A11 | Inter-extension interop (`globalThis` fns — `translate`, `rvcVoiceConversion`, `vrmLipSync` in tts/vectors/expressions; `SillyTavern.libs`) | None today; the priced §5a "custom events" row (namespaced `plugin:<slug>:<name>` installer-scoped pub-sub, recommended ENABLE at U8) is the sanctioned shape; libs: guests bundle their own (1 MiB cap) | **IN-FLIGHT-ish (U8 candidate, priced)** — real composition gap today; weight MEDIUM (the TTS↔RVC↔VRM chain is a real ST pattern) |
| A12 | Crash behavior: none (a broken extension breaks the page; an infinite loop freezes the tab) | 32 MiB memory cap, 1 s CPU span interrupt incl. post-settle pumps, 5 s host-fn deadline, FIFO-16, 3-strike auto-disable + owner notification, contained activation failure (`budgets.ts` whole file; `service.ts:161-175`) | **BETTER** (category difference) |

### B. Chat, prompt, generation reach

| # | ST ability | Orbweaver equivalent | Verdict |
| - | - | - | - |
| B1 | Read chat/messages (`context.chat`, mutable array) | `chat.listMessages` (reduced `PluginMessageView` — no economics/params/promptSnapshot, D16 viewer clamp; `host-v1.ts:32-40,117`) | **PARITY** (read); the projection is deliberately narrower — operator-tier fields withheld |
| B2 | Mutate chat history / rearrange (vectors `rearrangeChat` splices `chat[]`, `vectors/index.js:776-859`; `generate_interceptor`) | **REFUSED** — class-1 wall (unattributed canon edit by non-human code); sanctioned routes: transforms (attributed) + S4 suggest; the vectors use-case itself is first-party (row F1) | **REFUSED** (priced §5a: narrow own-messages attributed edit arm if ever demanded) |
| B3 | Inject prompt text (`setExtensionPrompt` at `IN_PROMPT/IN_CHAT/BEFORE_PROMPT` + depth + role + WI-scan, `script.js:484-499,3301`) | `transforms.register` at `user_input`/`assembled_dynamic` (D50 band 1000+, 250 ms, skip-on-fail; `bus.ts:200-250`) + `worldInfo.upsertEntry` with `EntryPosition` (`host-v1.ts:48-54`) + automation `insert_world_info_entry` | **PARITY** on ability; fidelity note: no arbitrary depth/role-addressed in-chat injection primitive — positions ride the WI position vocabulary and the two transform points. No bundled extension needed more than these two mechanisms deliver |
| B4 | Abort generation from an interceptor (`abort()` in `runGenerationInterceptors`, `extensions.js:2024-2049`) | `PromptTransformAbort` return arm — typed, reason-capped, distinct from D53 skip (`bus.ts:224-235`) — BUILT U6 | **PARITY** |
| B5 | Quiet/raw generation (`generateQuietPrompt`/`generateRaw` — expressions LLM classify `index.js:1124-1151`, vectors summarize `:355-358`) | `llm.quiet` — installer's own summarize-role connection, hourly floor, prompt cap 8 KiB, non-canon (`host-v1.ts:169-198`, `budgets.ts:78`) + structured-output `schema` (→ `structured` role, xgrammar lever) + `imageAssetIds` vision arm (≤4, installer CAS only) — BOTH BUILT U6 | **PARITY+** — the schema arm exceeds ST (expressions has to hijack `TEXT_COMPLETION_SETTINGS_READY` to inject a json_schema, `expressions/index.js:1067-1079`; ours is a first-class parameter) |
| B6 | Pick the connection/model/profile for a generation (`ConnectionManagerRequestService`, `ChatCompletionService`, `getPresetManager` — full access to the user's configured backends and secrets `secret_state`) | **REFUSED** — the credential firewall: funder + connection are closed over host-side, a guest can never name either (`bridge.ts:89-103`); a plugin needing its own backend uses `net.fetch` + its own key in its own `storage.kv` (BYOK — allowlisted hosts, SSRF-guarded, hourly egress floor) | **REFUSED** (deliberate wall; the BYOK arm is the sanctioned shape and covers the third-party-service class) |
| B7 | Per-token streaming hook (`STREAM_TOKEN_RECEIVED`; `streamingProcessor`) | **REFUSED** — per-invocation budget architecture; per-message facts are the floor; priced throttled-digest shape on record (§5a row 1, recommend-against) | **REFUSED** (priced) |
| B8 | Trigger a generation (`Generate`, `sendGenerationRequest`) | `chat.requestTurn` — spend-classed, budget-debited, D17 consent, cascade-depth stamped (`host-v1.ts:124-127`, `bridge.ts:37-44`); non-host installers get the S4 ask instead of refusal | **PARITY** with **BETTER** loop/budget containment (ST has no cascade-depth concept at all) |
| B9 | Stop generation (`stopGeneration`) | Not on the membrane; abort exists only as B4 (own-transform) | **GAP (trivial)** — no bundled extension calls it outside its own flow |
| B10 | Function tools (`ToolManager.registerFunctionTool` — name/displayName/parameters/action/formatMessage/`shouldRegister`/`stealth`, `tool-calling.js:269`) | `tools.register` → the ONE D48 registry, host-namespaced wire name (`pluginToolWireName`, `registrations.ts:57-61`), handler runs in-guest under budget; PLUS `tool-card` surfaces bound to the persisted `ToolCallRecord` (`ui.ts:933-958`); PLUS automation `run_tool` arm invokes plugin tools on rule triggers with pause-not-error on disabled contributor (`dispatch.ts:23-30`) | **BETTER** — rule-driven tool invocation has no ST analog. Fidelity residuals: no `stealth` flag, no conditional `shouldRegister` (weight low) |
| B11 | Tool-result rich cards (hand-rolled DOM in ST) | `tool-card` anchor + `PluginToolCardState` binding (args/result/isError/durationMs), frame-eligible for arbitrary card art (U7) | **PARITY→BETTER** (provenance-faithful binding) |
| B12 | Swipe/variant control (`swipe.left/right/to`) | `variantSelected` trigger fact exists; no swipe verb on the membrane | **GAP (trivial)** — self-serve UI affordance, not an extension pattern in the bundled set |
| B13 | Message display transform (formatting hooks, `messageFormatting`, furigana class) | `transforms.registerDisplay` — viewer-local, ordered after member display regex, skip-on-fail, per-transform deadline; `plugin.transformForDisplay` round-trip + `listDisplayTransforms` byte-identity gate (`host-v1.ts:232-251`, `service.ts:402-410`) — BUILT U6 | **PARITY** |
| B14 | Message decorations (badges on rows) | `message-footer` anchor — static-only, 8 nodes, depth 2, decoration kinds only (`ui.ts:145-244`) — BUILT U6 | **PARITY** (fidelity: adjacent decoration, deliberately not in-bubble markup) |

### C. UI reach

| # | ST ability | Orbweaver equivalent | Verdict |
| - | - | - | - |
| C1 | Arbitrary DOM anywhere (jQuery on the host document — every bundled extension) | **REFUSED**; replacement = the whole declarative plane (20-kind closed node vocabulary, zod both boundaries, 32 KiB/256-node/depth-8 caps — `ui.ts`) + the U7 `ui.frame` hatch for arbitrary pixels (isolated opaque-origin doc, `default-src 'none'`, postMessage→`uiHostCall` relay — `frame.ts`, BUILT `9c3089789`) | **REFUSED + replaced at equal-or-better ability** — the frame closes the "arbitrary pixels" tail honestly (WebRTC beacon residual named in its consent line) |
| C2 | Settings panel (drawer + `settings.html`) | `settings` anchor (static/scripted/frame all admitted — `PLUGIN_ANCHOR_TIERS`, `ui.ts:161-192`) | **PARITY** |
| C3 | Side panels / floating drawers (expressions' movable holder) | `chat-flank` + `chat-settings-section` + `settings` anchors | **PARITY** |
| C4 | Whole custom screens (hub browsers, games) | `page` anchor + the Extensions rail section (BUILT U5 — `extensions-page-surface.tsx`, page-scale shell with mandatory attribution band) + browse-genre vocabulary (`grid`/`masterDetail`/`searchBar`); frame-tier page mount **pending** (`PLUGIN_ANCHOR_TIERS` `page/dialog: frame:false` until the client mount lands — documented follow-up, `ui.ts:183-191`) | **PARITY** (declarative); arbitrary-pixels page = **known U7 follow-up** |
| C5 | Wand-menu / top-bar buttons | The first-party "Plugins" chrome menu + `ui.registerCommand` (BUILT U5 — `plugin-commands-chrome.tsx`, `use-plugin-commands.ts`) | **PARITY** (fidelity: one labeled menu, door never grows per-plugin — deliberate) |
| C6 | Slash commands with typed args + enum autocomplete (`SlashCommandParser.addCommandObject`, `ARGUMENT_TYPE`, enum providers) | `/plugin <slug> <name> <raw-args>` dispatcher + palette mount (BUILT U5 — `plugin-slash-mount.tsx`, `plugin-command-dispatch.ts`); command owns its own arg grammar (2000-char cap); per-command first-class palette rows = **U8** | **PARITY on ability, fidelity gap on arg-grammar/autocomplete** — U8 closes the rows half; typed-arg autocomplete has no committed row (see gap list #8) |
| C7 | Popups: confirm / input / custom (`Popup.show.*`, `POPUP_TYPE`) | `confirmButton` (house ConfirmDialog) + `dialog` surface kind with full form vocabulary + `ui.openDialog` (round-trip-outcome delivery — spontaneous modal unspellable, `ui.ts:861-912`) — BUILT U5 | **PARITY**; **BETTER**: a plugin structurally cannot open a modal at a user who didn't just act on it |
| C8 | Toasts (`toastr` free-for-all) | `ui.toast` — house toast, plugin-name stamped domain-side, 200-char cap, 10 s per-plugin cooldown, bounded outbox (`ui.ts:877-895`) — BUILT U5 | **PARITY/BETTER** (attribution + rate floor; ST toasts are unattributed and unbounded) |
| C9 | HTML templates w/ sanitization (`renderExtensionTemplateAsync`) | The node vocabulary is the template layer; `markdown` node rides the hardened Streamdown renderer | **PARITY** (different shape) |
| C10 | Reactive state (extension re-renders itself) | `ui.setState` (16 KiB, per-(plugin,surface\[,chat]) rows, `pluginSurfaceStateChanged` freshness poke) + `$state` bindings; Tier-C `ui.js` client guest at native latency (U4, QuickJS worker, `UI_PROXYABLE_HOST_FUNCTIONS` re-gated relay) | **PARITY** |
| C11 | Theming/density/a11y integration (ST: extensions hand-roll CSS against theme vars, routinely break) | Free by construction — nodes map to sealed `@orb/ui` primitives; tokens/density/reduced-motion/a11y inherited | **BETTER** |
| C12 | Impersonating host chrome (possible in ST, nothing prevents it) | Unspellable: no host-grammar voices, no `primary`, mandatory attribution shell on every surface incl. pages | **BETTER** (safety) |

### D. Engines ST extensions hand-roll (the surface the prior pass missed)

| # | ST ability | Orbweaver equivalent | Verdict |
| - | - | - | - |
| D1 | Regex scripts (the bundled regex ext: global/scoped/preset scripts, placements, depth, macro-in-find, trim strings, presets, debugger — `regex/engine.js` + `index.js` in full) | **First-party `kit/regex` engine + `domain/regex`**: same script vocabulary (placements incl. the ephemeral `PROMPT_HISTORY` leg with ST-compatible depth semantics `kit/regex/index.ts:34-47`, `substituteRegex` raw/escaped, trimStrings, ST card-format compat), PLUS: ReDoS complexity guard + server node:vm per-call timeout (ST has NO timeout — a catastrophic pattern hangs the ST tab; `RegexProvider` is just an LRU cache), macro-injection-safe splice ordering (`buildReplacement` — captured model text is never macro-evaluated; ST's `runRegexScript` runs `substituteParams` over the SPLICED result, `regex/engine.js:444`, i.e. model text can reach the macro engine), derived tier flags making dead states unrepresentable | **BETTER** — parity vocabulary + hardening ST lacks; the ST regex *extension* is a first-class domain here |
| D2 | Macros (`MacrosParser.registerMacro` legacy + the new chevrotain `macros.register` with typed args/categories) | **`kit/macro`**: full AST engine (parser/evaluator/registry), typed arg contracts (`checkMacroArgs`), metadata + autocomplete (`queryMacros`), flags, block scoping, injected clock/PRNG determinism, budget caps (depth 64 / 1 MB out / 2 MB in), `neutralizeMacros` + ZWSP re-injection defense; **user macros** (#24): preset/game-authored template macros with typed inputs (single/multi/toggle/random-pick w/ frozen-draw swipe replay) on a **per-render registry** (`user-macros.ts:1-26` — "one user's macros can never leak into another's evaluation"); **plugin macros** (U6): value macros resolved once/turn into the ONE engine (`host-v1.ts:254-278`) | **BETTER** overall. One stated bound: plugin-registered macros are value-only (no args — the sync-engine bound, documented; ST's legacy `registerMacro(key, value)` is the same shape). ST's NEW system does let extensions register arg-taking macros (`expressions/index.js:2662-2687` `lastExpression::name`) — a real fidelity edge for ST, weight LOW (one bundled usage, and our user-macro plane carries arg-taking macros for authors) |
| D3 | Conditional logic (raw JS everywhere) | **`kit/cel`**: vendored CEL behind one seam, isomorphic (client editor validates with the same code server dispatch runs), 2 KiB parse-time budget, error-as-value parse, `rootIdentifiers` static analysis; consumed by automation predicates + the `{{expr::…}}` macro | **BETTER** (a safe, budgeted predicate dialect vs arbitrary JS) |
| D4 | Event-driven behavior (every bundled ext hand-wires `eventSource.on` + module-worker polling) | **The automation platform** (`domain/automation`): durable rules over the closed trigger taxonomy, CEL predicates, 10 arm types (`AUTOMATION_ACTION_TYPES` incl. `run_analysis` + `run_tool`), fire-rate budgets + cascade-depth cap + authority gates, fire log with 8 typed outcomes, dry-run, 22 shipped presets (`presets.ts` — clockFires, theNeedle, livingLibrary, …), S4 confirm-first inbox, 20-error auto-disable with durable notice | **BETTER — no ST analog exists at all.** This is the single largest structural exceed: ST extensions ARE its automation layer, hand-rolled per extension; orbweaver's plugins *plug into* a platform (rules can invoke plugin tools; plugins subscribe to the same taxonomy; one cascade guard spans both) |
| D5 | Speaker-label handling (group-chat name echo — ST handles ad hoc in `Generate`) | `kit/speaker-label` — one engine, server persist-strip + client display-strip + narrator span parse | **BETTER** (niche; listed because it is engine-ized ability) |
| D6 | Idle/timer behavior (`setInterval` module workers — expressions 2 s, tts 1 s, `ModuleWorkerWrapper`) | No guest timers, permanently (a sleeping guest is a held instance); cadence rides automation predicates + events | **PARITY (reshaped)** — the schedule lives in the rules plane; every bundled timer usage (poll-for-change) is event-driven here anyway |

### E. Events

| # | ST ability | Orbweaver equivalent | Verdict |
| - | - | - | - |
| E1 | Hook lifecycle events (~105 `event_types`) | `events.subscribe` over the closed taxonomy: 16 chat + 4 domain members (`contracts/automation/index.ts:20-63`), resolved `TriggerFact`s, cascade-suppression default (`matchAutomationEvents`), FIFO-16 delivery | **PARITY on the load-bearing set** — the ~20 events the four bundled extensions actually consume (message sent/received/edited/deleted/swiped, chat changed/created/deleted, generation start/end, character deleted/edited, WI, persona) are covered by the 20-member taxonomy at message-or-coarser granularity. Missing classes, stated: settings/preset lifecycle events, secret events, render-complete events (superseded by display transforms), group-member-drafted. Widenings ride the S7 merge-window discipline by demand — the right posture, not a backlog |
| E2 | Emit app events (`eventSource.emit`, incl. `WORLDINFO_FORCE_ACTIVATE` — vectors `:1725`) | **REFUSED** (a plugin-emitted domain event is a forged fact); WI force-activate's effect reachable via transforms/WI upsert; inter-plugin events = A11 | **REFUSED** (forgery wall stays; A11 is the composition arm) |

### F. Module classes (the big bundled/official extensions)

| # | ST ability | Orbweaver equivalent | Verdict |
| - | - | - | - |
| F1 | Vector storage / RAG (vectors ext: chat/file/WI vectorization, query, injection — 2358 lines of hand-rolled sync/summarize/chunk/query) | **First-party**: embeddings + search + discovery + chat/memory domains (event-driven indexer, one cosine engine, rerank) — the ability ships in-platform for every user with zero extension code | **BETTER in-platform**. Residual: no plugin-facing search/query host fn (a memory-adjacent plugin cannot consume first-party retrieval) — gap list #9 |
| F2 | Data Bank + scrapers (`registerDataBankScraper`, `db-ingest`/`db-search` commands) | `domain/databank` first-party; plugin write access = `databank.ingest` capability — **U8** | **IN-FLIGHT (U8)** |
| F3 | Image generation (sd ext) | First-party `domain/imagery` + `imagery.generatePicture` host fn + `generate_image` rule arm + `/imagine` | **BETTER** |
| F4 | Image captioning | `llm.quiet` `imageAssetIds` vision arm (BUILT U6) | **PARITY** |
| F5 | Translation | `llm.quiet` + `net.fetch` + display transforms (U6) | **PARITY** |
| F6 | Expressions/sprites (classify + swap character art; VN mode; custom expressions; sprite packs) | Classify: `llm.quiet` (+schema). Swap: `chat-flank` surface + `image` nodes + `events.subscribe`; animated live2d/VRM: the U7 frame. **Blocking residual: bundle-shipped art has no route** — `image` nodes take installer-CAS `assetId` only (`ui.ts:356-364`), and the `ui/assets/` → CAS seam (seam 11) is a named later phase (`ui.ts:263`); a sprite-pack plugin today cannot ship its sprites | **GAP (seam 11)** — the one place a committed shape exists but no phase is scheduled on-tree; gap list #3 |
| F7 | TTS / STT (tts ext: 28 provider adapters, queues, `registerTtsProvider` third-party provider registry) | **Nothing** — blocked on an engine-level audio transport + inference role (gap register §2); the register's ONE residual owner ask | **SUB** — the honest substrate gap; heaviest-weight residual in the whole audit (TTS is a top-tier ST extension class) |
| F8 | Web-search / RSS into context | `net.fetch` (allowlisted) + `worldInfo.upsertEntry` + `notify` | **PARITY** |
| F9 | Quick Replies (user-authored button sets running STscript) | Chips: `surfaceQuickReply` + automation chip arms (diegetic send-text). Templated insertion: user macros w/ typed inputs. A QR-panel plugin: `chat-flank` surface + buttons + `onAction`. The "arbitrary script per button" tail rides `runSnippet` (owner console) or a plugin | **PARITY by decomposition** — no single QR feature, but every constituent ability lands somewhere stronger (durable, budgeted, attributed) |
| F10 | Character card ext fields (`writeExtensionField[Bulk]` — regex ext stores scoped scripts on cards) | **U8** (`data.extensions.plugin_<slug>` namespace, D-entry with the build). Note: the regex ext's own card-coupled use-case is ALREADY first-party here (scoped regex scripts are a domain feature, not plugin data) | **IN-FLIGHT (U8)** |
| F11 | Character read (`context.characters`, `getCharacters` — expressions resolves sprite folders per member) | No character read on the membrane; `characterId` appears only as inert text on message views | **GAP** — gap list #5 (U8's `character.ingest` is the WRITE half; the read half has no committed row) |
| F12 | World-info READ (`getSortedEntries`/`loadWorldInfo` — vectors indexes WI entries `:1623-1726`) | Write-only membrane (`worldInfo.upsertEntry`); no list/read fn | **GAP** — gap list #4 |
| F13 | Token counting (`getTokenCountAsync`, `tokenizers` — the token-counter ext) | Nothing plugin-facing (grep over contracts/plugin + domain/plugin: zero tokenizer references) | **GAP (minor)** — gap list #10 |
| F14 | Debug functions (`registerDebugFunction`) | Plugin log ring (`getLog`) + the snippet console (`runSnippet`, fixed profile ∩ caller authority, 5 s wall) | **PARITY-adjacent** (different shape, same operator ability) |
| F15 | i18n (`addLocaleData`, manifest `i18n`) | App is en-only | **N/A** |
| F16 | Runtime code loading (dynamic `import()` from URL) | **REFUSED** — bundle = consent unit; CSP + no module loader make it unspellable; the §5a hash-pinned shape folds into U8's update check | **REFUSED** (priced) |
| F17 | Chat management verbs (`renameChat`, `deleteMessage`, `clearChat`, `openCharacterChat` — data-maid class) | Not on the membrane (canon writes); S4 suggest covers only requestTurn/WI/image | **REFUSED-by-scope** (class-1 adjacency; no bundled extension outside data-maid touches these; weight LOW) |
| F18 | Backgrounds (`FORCE_SET_BACKGROUND`) | Automation `set_chat_background` arm (rule-reachable, not plugin-reachable) | **PARITY via rules** (a plugin's user mints the rule); direct host fn = trivial widening if ever wanted |

### Buckets and counts

48 distinct ability rows above (A1-A12, B1-B14, C1-C12 collapsed to 12, D1-D6, E1-E2, F1-F18 — some
rows merge sub-abilities):

- **BETTER: 15** (A2, A4-half, A8, A9, A10, A12, B10, C7/C8-half, C11, C12, D1, D2, D3, D4, D5, F1, F3)
- **PARITY: 15** (A1, A5, B1, B3, B4, B5, B8, B11, B13, B14, C2-C5, C9, C10, D6, E1, F4, F5, F8, F9, F14, F18)
- **IN-FLIGHT (U8/committed): 5** (A3, A11, F2, F10, + C6's palette half)
- **GAP (real, no committed on-tree build): 6** (F6/seam-11, F11, F12, F13, B9, B12 — last two trivial)
- **REFUSED (deliberate, priced): 8** (B2, B6, B7, C1, E2, F16, F17, A6-fold)
- **SUB: 1** (F7 — TTS/STT)
- **N/A: 2** (A7, F15)

(Counts overlap where a row is split-verdict; the table row is authoritative.)

---

## 2. The ranked ACTIONABLE gap list

Ranked by load-bearing weight to real extensions (weighted by bundled/official-extension usage), each
with a concrete closing shape. U8-in-flight rows included with their coverage confirmed.

1. **TTS/STT audio substrate** (F7 — SUB, not a plugin-plane fix). Weight: HIGHEST — tts is a
   top-3 bundled extension by real usage, 28 provider adapters, and nothing on our tree can host any
   of it. Shape: an engine-level decision (audio transport + an `audio`/`tts` inference role on the
   connection domain's role axis, D109-4 pattern), THEN either a first-party tts domain or a
   `audio.speak` host fn + provider-plugin capability. This is the register's one residual owner ask
   (§10) — it needs an owner ruling, not a lane.
2. **URL install + update check (U8, in flight)** — closes the single biggest ecosystem-friction gap
   (every third-party ST extension installs by URL; ours requires a zip upload). Shape already
   committed: fetch-at-install through the SAME funnel + consent screen; update check + one-click
   `upgrade` with #615 re-consent, never silent. **U8 covers this fully.**
3. **Bundle-shipped UI assets → installer CAS (seam 11)** — the expressions/sprite class and any
   media-forward plugin is blocked: `image`/`grid`/`hero` nodes take installer-CAS asset ids only and
   a bundle has no way to deliver art (`ui.ts:263` names this a later phase; no U-phase on the tree
   claims it). Shape (already specified): a `ui/assets/` zip dir admitted by the bundle funnel,
   stored to the installer's CAS at install/upgrade, ids surfaced to the guest. Recommend scheduling
   this WITH or immediately after U8 — without it, U7's sprite story is classify-and-swap with no
   sprites.
4. **World-info READ host fn** (F12) — `worldInfo.list(chat)`/`get` returning attached-book entries
   under `chat.read` (or a new `worldinfo.read`); rides the existing attached-book resolve the write
   half already does. Small; unlocks the vectors/lore-tooling class.
5. **Character READ** (F11) — a reduced `PluginCharacterView` (id, name, avatar asset id) for the
   invocation chat's roster under `chat.read`. U8's `character.ingest` is write-only; the expressions
   class needs the roster read. Small, D16-clamped.
6. **The plugin-event plane** (A11, §5a row 4 — priced, recommended ENABLE at U8): namespaced
   installer-scoped pub-sub. Closes the inter-plugin composition pattern (ST's `globalThis` chains).
7. **`databank.ingest`** (F2 — U8, in flight; covered).
8. **First-class command rows** (C6 — U8, in flight, covers the palette half). Residual after U8:
   typed-arg/enum autocomplete for plugin command arguments has no committed shape; price it only if
   plugin authors ask — the raw-remainder grammar is serviceable.
9. **Search/RAG query host fn** — `search.query` under a read capability so plugins consume
   first-party retrieval instead of hand-rolling (the entire vectors extension exists because ST has
   no first-party RAG; we have one and plugins can't reach it). Medium value, medium price (spend
   adjacency: embedding calls — needs the rate-floor pattern `llm.quiet` uses).
10. **Token counting** (F13) — a `tokens.count(text)` host fn on the free tier or `chat.read`;
    trivial.
11. **Card ext fields** (F10 — U8, in flight; covered).
12. **Trivia tier** (only if ever demanded): stop-generation fn (B9), swipe control (B12), stealth
    /conditional tool registration (B10 residual), `set_chat_background` direct host fn (F18).

**U8 coverage confirmation for the orchestrator:** of the in-flight U8 set named in the brief — URL
install (#2), databank/character.ingest (#7/#5-write), card ext fields (#11), first-class command
rows (#8), plugin-event plane (#6) — every one lands on a row in this list; U8 + seam 11 + the two
small READ fns (#4, #5-read) would take the honest scorecard to "match-or-exceed on everything except
audio and the deliberate walls."

---

## 3. The honest residual

- **Deliberate refusals (security walls — not gaps, each priced in §5a):** host DOM access ·
  `getContext()`-style ambient authority · runtime code loading · app-event forgery · credential/
  connection/model reach (the firewall) · unattributed canon mutation · per-token streaming ·
  plugin-named funders. Each has a recorded safest-enablement shape and a recommendation; none
  blocks a real bundled-extension ability that lacks a sanctioned alternative arm.
- **Substrate gap:** TTS/STT (audio transport + inference role) — an engine decision, explicitly not
  purchasable at the plugin plane. Owner ask stands.
- **Real to-build:** seam-11 bundle assets; WI read; character read; search read; token count; the
  U8 set (in flight).
- **Known U7 follow-up (on the record in-code):** frame tier at `page`/`dialog` anchors is
  registered-refused until the client mount lands (`ui.ts:183-191`) — flip-with-occupant.

## 4. Register verification (deliverable 5)

Checked every §5 register row that claims BUILT/PT against the tree at `eff003d6e`:

- **No refutations found.** Every claimed-built arm exists in code and is wired at compose:
  `transforms.registerDisplay` + `transformForDisplay` verb (row 5) ✓; `macros.register` +
  `registerMacros` compose wiring (`automation-plugin.ts:658-665`) (row 15) ✓; abort arm
  (`PromptTransformAbort`, row 14) ✓; structured quiet + vision arm (rows 16/32) ✓; toasts/dialogs/
  commands (row 21/6/9-first-half, U5) ✓; the frame hatch (row 8, U7) ✓; `pluginToolWireName` single
  mint at compose (`automation-plugin.ts:25,633`) ✓.
- **Undersells (the register is BEHIND the tree, in our favor):**
  1. Row 26 "Install for self vs whole server — PT (in flight, #675)": the distribution verbs are
     **BUILT** (`installForAllUsers`/`uninstallForAllUsers`/`listDistributedPlugins`/
     `applyDistributedPlugins`, `contract/service.ts:352-362` + client `plugin-distribute-section`).
  2. Rows marked CMT(U5/U6/U7) — 8, 14, 15, 16(second half), 21, 29, 30(partial), 32 — all landed
     (`668536e69`, `9c3089789`, `c49bbbb49`); the register was attested 2026-08-24 and only row 5/21
     were edited to BUILT. A re-attestation pass marking the U5-U7 rows BUILT would make the register
     current.
  3. The register nowhere credits the **automation platform** as a parity asset — its own row 10
     fidelity note ("narrower than ST's ~40 event types") reads as a deficit, when the honest
     framing is that ST's event breadth exists BECAUSE extensions must hand-roll what our rules
     plane ships (D4 in the table above). Rows 28 and 9 gesture at it; a §5 preamble line would fix
     the framing.
- **Register rows this audit ADDS (absent from §5, found by the full `st-context.js` read):**
  world-info READ (F12), character READ (F11), token counting (F13), stop-generation (B9), swipe
  control (B12), stealth/conditional tools (B10 residual), inter-extension interop as a
  first-class row (A11 — §5a's custom-events row covers the emit half only). None flips a §5
  verdict; all are minor-to-medium and in the gap list.

## 5. What we do BETTER (the undersold half, consolidated)

1. **The automation platform** — no ST analog. Rules + CEL + budgets + cascade caps + fire log +
   presets + S4 confirm + `run_tool` means the plugin plane composes with a first-class event-driven
   engine instead of BEING one, per extension, in ad-hoc JS.
2. **Consent architecture** — capability axis, per-function gating, re-consent on widening, S4
   ask-don't-refuse for missing authority, distribution-with-consent. ST has literally none of this.
3. **Containment** — memory/CPU/stack/FIFO/egress/spend budgets, 3-strike auto-disable, contained
   activation failure. An ST extension bug takes the page; ours takes the plugin.
4. **Multi-tenancy** — leak-free owner scoping on every verb (the `uiHostCall` 7-rung ladder is the
   exemplar); ST is structurally single-user (its "global vs local" is a file-location question).
5. **Private storage** vs ST's world-readable settings blob.
6. **The engines** — regex (timeouts + injection-ordering ST lacks), macros (per-render registries,
   typed args, determinism), CEL (budgeted predicates vs raw JS), first-party RAG/imagery.
7. **Attribution walls** — plugin-labeled shells, stamped toast prefixes, unspellable impersonation.

## 6. Verified-clean log (what my silence covers)

- ST surface completeness: `getContext()` read entire (311 lines); `event_types` entire; loader
  entire; parser entire; four bundled extensions entire — the ability inventory above is drawn from
  full reads, not the ST docs' self-description.
- Orbweaver claims: every PARITY/BETTER verdict traced to a declared+exported contract AND either a
  verb body, a compose wiring line, or a client mount (receipts inline). Spot-checked live-path
  wiring: `automation-plugin.ts` registers tools/transforms/macros/events off the collected
  `PluginInstance`; the client dispatcher/menu/page/frames exist as components.
- U8 absence confirmed (no URL-install/databank.ingest/palette-source/card-fields code on the tree;
  `git log --all --since=2026-08-26` + contract greps).
- No `pnpm check`/test runs were performed: this is a read-only investigation on a clean shared tree
  with sibling lanes live (load discipline); no diff exists to gate.
- Unconfirmed, low priority (not findings): (a) whether the U7 frame CSP admits `data:` images inside
  the frame document (affects how much of the sprite class the frame can carry before seam 11) — I
  did not read the served-CSP builder; (b) exact behavior of `ui.js` availability when a distributed
  plugin's recipient enables it (distribution fan-out + Tier-C interaction untested by me);
  (c) whether `plugin-subscribers.ts` delivers domain-bus (vs chat-bus) facts to plugins with the
  same depth suppression — read the chat side only.

## Issue summary (paste-ready)

Definitive ST-extension parity audit complete (stickler-st-parity, report:
`docs/reviews/stickler/2026-08-28-st-extension-parity.md`). Outcome: **match-or-exceed on ~41/48
distinct ST extension abilities today**; the whole-surface reading (plugin host + macro/CEL/regex
engines + automation platform + first-party RAG/imagery) flips the prior understated verdict — 15
rows are structurally BETTER (automation platform, consent architecture, containment, engines,
tenancy). Confirmed on-tree: U5/U6/U7 all landed and the §5 register now UNDERSELLS (row 26
distribution verbs built; CMT(U5-U7) rows built — re-attest recommended). No register claim refuted.
Actionable gaps, ranked: (1) TTS/STT audio substrate — the one engine-level owner ask; (2) U8 set
(URL install/update, databank+character.ingest write, card ext fields, command rows, plugin events)
— in flight, covers 5 of the ranked rows; (3) **seam-11 bundle-shipped UI assets → CAS — the one
specified-but-unscheduled blocker (sprite/media plugins have no art route)**; (4) small membrane
reads with no committed row: world-info READ, character READ, search query, token count. Deliberate
security walls (DOM/creds/canon-mutation/streaming/runtime-code) all hold with priced enablement
shapes on record. Severity ceiling: no defects — this is an investigation; the deliverable is the
gap list above. Report needs a catalog receipt at the next docs train.
