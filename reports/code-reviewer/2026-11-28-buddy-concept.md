# The buddy: a companion that builds plugins for you

A concept sketch from a brainstorm. None of this is built. Section 2 lists what the owner decided. The rest is the design those decisions point to.

## 1. The idea

Three people this is for:
- A user wants a plugin that does something specific, nobody makes it, and they can't write one.
- A new model provider launches, and Orbweaver hasn't added it yet.
- A user wants to contribute, but the codebase is far beyond them.

Today all three either wait or leave.

The buddy is a small companion character that each user hatches and keeps. It lives in a pane off the nav rail: an animated avatar beside a workspace and a terminal-style log. It is the interface and the builder at once. You tell it what you want, and it:
- writes a plugin (including a provider plugin for a new model service);
- checks and test-runs the plugin;
- brings it to you for approval;
- proposes settings changes or automation rules when you ask;
- knows which plugins you have, and is aware of time passing ("while you were out I finished the provider").

When you approve a buddy-made plugin, it appears in your running app at once, with no reload and no restart.

The companion layer works like a virtual pet: hatching, a personality that develops, memories of what you built together, and visible growth. That layer makes it a someone, not a tool.

## 2. Decisions settled with the owner

1. **One buddy per user, locked to that user.** It is never shared, exported, cloned into another account, or commanded by anyone else.
2. **The buddy may use plugin grants and automation.** What it builds can do anything a plugin can do, including automation rules, subject to the approval rules below.
3. **The agent loop runs on the server.** A build keeps running when the user's tab goes idle or closes.
4. **It builds on the plugin system that already exists.** The buddy produces ordinary sandboxed plugins. It never edits Orbweaver itself.

## 3. Why the existing platform carries most of it

- **Providers are already a plugin shape.** A plugin manifest can declare `providers` (`ProviderDef`), claimed per owner (D265), with egress declared up front. A new provider is a manifest plus a wire adapter, not core code.
- **Plugins already run sandboxed.** Server plugin code runs in QuickJS-ng inside Workers inside a separately watched broker process (`packages/server/src/infra/plugin-host/README.md`). The app re-authorizes every host call against the plugin's grants, and performs all network egress itself.
- **The plugin-sized checks already exist.** `orb-plugin check` (`packages/plugin-toolchain/`) compiles strict TypeScript against the SDK, and refuses forbidden globals and imports before emit. It validates the manifest, requires every host call to have its capability declared, and links UI calls to registered surfaces.
- **Live install is mostly in place.** Install and enable invalidate `plugin.list`. The server wakes guests from content-addressed storage on their next call, and client surfaces mount from the list. The full path from approval to a live plugin still needs to be traced end to end.
- **The character side exists.** Characters, avatars, personas, the memory subsystem (recall and strike), activity timestamps, and `now` in the expression environment cover most of "a character that remembers and knows the time".

The repository's own heavy rigor (whole-tree typecheck, ESLint, dependency rules) is not needed for buddy output. A buddy plugin is small, it is checked against a small SDK, and its runtime boundary does not trust it. ESLint adds nothing behind that boundary.

## 4. How a build works

1. The user asks for something in the buddy pane.
2. The server starts a build. A build is a durable job in the existing workloads domain, so it survives an idle tab and resumes or fails clearly after a restart.
3. The buddy works in its workspace, a per-user virtual file system (section 5). It reads the SDK and plugin-authoring docs from read-only mounts, and writes its plugin under `/work`.
4. It runs `check` on the plugin. Compiler errors go back to the buddy automatically, with a capped number of retries. This loop is what makes smaller models usable.
5. It test-runs the plugin as an owner-scoped dev install in the broker, with only the grants the plugin declares. It reads the bounded plugin log to see what happened.
6. The build parks at "awaiting approval". Nothing installs while the user is away.
7. The user opens the approval screen and approves or rejects.
8. On approval, the plugin installs through the normal install funnel and appears live.

Every build has a spend cap and charges the existing spend ledger, because the buddy spends the user's model budget, possibly while the user sleeps.

Concurrency limits:
- **Per user:** one active build at a time.
- **Server-wide:** a cap on concurrent buddy loops.
- **Broker:** buddy test runs get a bounded share of the broker's Workers, so a build cannot starve the user's live plugins.

## 5. The workspace

The workspace is the buddy's whole world. It has no path to the host disk, so the boundary holds by construction, not by policy.

- **Storage.** A workspace-files table over the existing content-addressed store, scoped to the owner through the normal FK chain. Backups cover it.
- **Snapshots.** Each build takes a snapshot, which gives two things:
  - **one-click undo** of any buddy run;
  - **the approval diff**, computed from two snapshots.
- **Mounts.**
  - `/sdk`: the plugin SDK declarations and README, read-only.
  - `/skills`: plugin-authoring guidance, read-only.
  - `/examples`: the showcase plugins, read-only.
  - `/work`: the buddy's writable area.
- **Contract.** One `WorkspaceFiles` interface in the domain `contract/`: read, write, list, stat and remove over normalized POSIX paths.
- **Compiler access.** An overlay compiler host is injected into `plugin-toolchain`:
  - `/work` reads from the workspace;
  - the TypeScript lib directory and the SDK read from disk, read-only, from an allowlist;
  - every other path does not exist.

  Today the toolchain reads the disk directly (`ts.createCompilerHost` and `readFile` in `packages/plugin-toolchain/src/index.ts`). It gains a file-source seam, and the CLI keeps its disk adapter.
- **TypeScript version.** Use the TypeScript 6 JavaScript API, because an in-process compiler host needs it. The TypeScript 7 native compiler is a separate process.
- **Bound the checker.** Run `check` in a Worker with `resourceLimits` and a deadline. The type checker never runs plugin code, but pathological recursive types can hang it.
- **Tools.** The buddy gets direct tools: `read`, `write`, `edit`, `list`, `grep`, `check`, `build`, `run` and `logs`. A shell-style terminal can come later as a layer over the same workspace. Models know shell commands well, so a small command set over the workspace has value.
- **Library choice.** No virtual file system library is needed for the core. `node:vfs` exists in Node 26 but is experimental, and its mount mode redirects process file access, which is wrong for a multi-user server. `memfs` is already in the tree for tests.

## 6. The trust model

The buddy reads untrusted text: provider docs, web pages, chats. Treat it as a prompt-injection target that holds a build tool. A poisoned page can tell it to add a hidden network host or forward chat data. Five rules contain that.

1. **The buddy is a principal with its own grant set.**
   - The user approves the buddy's grants at hatch and can change them later.
   - The plugin host's existing capability and authority checks apply to it, so there is no second permission system.
   - A plugin the buddy builds can request at most what the user approves on that plugin's own screen.
2. **The buddy never approves.**
   - It can't install, enable, widen grants, create automation rules or change settings.
   - It proposes, and the user decides.
3. **The host renders every approval screen** from the bundle or the diff, never from the buddy's summary.
   - The screen states plainly what the plugin can read, which hosts it can reach, which providers it adds, and which automation it creates.
   - The buddy's explanation can sit beside that, never in place of it.
4. **Credentials never pass through the buddy.** A provider plugin declares that it needs a key, and the host shows its own credential form. The buddy never sees the value.
5. **Automation gets extra visibility.**
   - Buddy-made rules show their origin.
   - Egress on an automation-triggered plugin is labeled loudly.
   - One control turns off every buddy-made rule at once.
   - Existing cascade-depth limits and D188 (automation never writes a message) still apply.
   - Triggers that lack cascade depth stay unoffered (work item 4113).

An update to a buddy-made plugin that asks for more than it had stops for a fresh approval.

## 7. The companion layer

- **Hatching** creates the buddy. Its first form and temperament come from the hatch.
- **The avatar** animates by state: idle, thinking, building, proud, asleep.
- **Personality** develops from what the user and the buddy do together.
- **Memory** uses the existing memory subsystem. The buddy asks before it writes a memory about the user.
- **Time awareness** comes from last-seen stamps and recall. It greets the user with what happened while they were away.
- **Growth never gates capability.** A user who needs a provider must never be told to level up first. Growth is:
  - personality;
  - memories;
  - new forms;
  - celebrations;
  - skills.
- **Skills are proposed by the buddy after a task**, and kept only when the user approves. "Learned providers" after it ships one is flavor that records real work, not an unlock.

## 8. Staging

1. **The loop.** Buddy row and principal, workspace, server build workload with spend caps, host-rendered approval, live install, and a basic avatar. This proves that a non-technical user can get a working plugin.
2. **Providers and proposals.** Provider plugins with the host credential form, plus settings and automation proposals through the same approval screen.
3. **The companion.** Hatching, state animation, personality, memory and time awareness.
4. **Sharing.** Publish buddy-made plugins through the existing plugin distribution. This is the contribution path, and possibly the route for a provider to become official.

## 9. Open questions

- **Skill sets.** Which documents form the read-only `/skills` mount? The repository's agent skills are written for developing Orbweaver, not for plugin authors, so this probably needs a new set.
- **Starter grants.** Should buddy-built plugins start with a narrower grant set, such as UI surfaces, storage and declared egress, and earn more later?
- **Weak models.** What does a model without tool calls get? Probably chat only, with no building.
- **Sizing.** How much does a warm compiler per active build cost in memory? Measure it, then set the server-wide build cap from that number.
- **Restore.** Does a user's backup and restore carry the buddy and its memories? The working answer is yes, for the same user only.

The install-weight and docs findings from the same session are in `reports/code-reviewer/2026-11-28-install-and-docs-front-door.md`.
