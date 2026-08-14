---
name: qwen-offline-investigation
description: Read-only recon over the workspace — durable orchestrator context, agent briefing, findings index
metadata:
  started: 2026-08-12
  fleet: local vLLM, 1 orchestrator + 5 concurrent agents, 131k window each
  mandate: "<FILL BEFORE FIRST DISPATCH>"
---

# Offline Investigation

## ─── RUNNING IT (human — start here) ───

### Once

```bash
mv budget ~/.local/bin/budget && chmod +x ~/.local/bin/budget
cd ~/any-repo && budget package.json      # a token count means it's wired
```

Confirm the engine is serving before spending a session on it: the `orb`
statusline reads `[up]`, and the SessionStart hook warns if it is not.

### Each session

```bash
cd <repo> && orb
```

First message to the orchestrator:

> Read `<path>/qwen-offline-investigation.md`. You are the orchestrator. The
> mandate is: *<one paragraph>*. Do not read source files yourself — everything
> goes through an agent.

Write that mandate into the frontmatter **and** the durable block before the
first dispatch. An agent without one optimises for coverage and hands back a
survey nobody asked for.

### The loop

1. **Inventory — do not read.** `tree -d --gitignore <path>` and `git ls-files`
   to choose five areas. No file contents at this stage.
2. **Budget each read set.** `budget $(git ls-files '<area>/**/*.ts*')`. Over
   ceiling → split or narrow. Record the figure on the board.
3. **Fill the dispatch board** — five rows, one per agent, each with its brief.
4. **Dispatch all five in ONE message.** Five Task calls in a single turn run
   concurrently; five turns each carrying one call run in series. This is the
   most common way to accidentally serialise the fleet, and it looks like the
   model being slow rather than like a dispatch mistake.

   **Dispatch as `scout` agents.** Every reconnaissance dispatch uses the `scout`
   agent type — it carries the structural tools (`ast-grep`, `pnpm ast`, `Grep`)
   natively and won't hallucinate shell `rg` for literal search.

   **Pre-load the doc.** First instruction in every agent brief: _"Read
   `docs/Qwen_Offline_Investigation.md` in full."_ The agent then knows the
   evidence rules, tool doctrine, and `pnpm ast` verb reference. An agent
   without it optimises for coverage and hands back a survey nobody asked for.
5. **Consolidate.** Merge returns into the findings table, dedupe, mark
   confidence [V]/[C]/[H]. Anything unresolved moves to Open Questions **with
   what would settle it** — not as a parking lot.
6. **Repeat**, or stop.

### Resuming

The orchestrator re-reads the durable block, the board, and the findings table.
A row ticked but not struck is a dispatch that never landed — re-dispatch it.
Nothing else in this file survives a compaction, by design.

### Stopping

Stop when the mandate is answered, or when a whole batch returns only [C]/[H]
rows and no new [V]. That is the signal you have hit the limit of what static
recon can settle; the next step is running something, not scanning more.

### Health check (no curl — it is denied, deliberately)

```bash
python3 -c "
import urllib.request as u
keep = ('vllm:num_preemptions_total','vllm:prefix_cache_hits_total','vllm:prefix_cache_queries_total')
print('\n'.join(l for l in u.urlopen('http://127.0.0.1:5069/metrics').read().decode().splitlines() if l.startswith(keep)))
"
```

`num_preemptions_total` climbing means the KV pool is oversubscribed — drop
`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` before touching anything else. A prefix
hit rate near zero across several dispatches means the shared prefix is being
invalidated, and the delegation economics change.

---

## ─── DURABLE ORCHESTRATOR ONBOARDING (read on resume) ───

**Situation.** Weekly usage is down; the local vLLM fleet is serving. Read-only
reconnaissance — agents scan and report, the orchestrator consolidates. No code
writes, no merges, no builds.

**Mandate.** *<one paragraph: what we are looking for and why. Fill this before
the first dispatch. Without it, agents optimise for coverage instead of for the
question, and you get a survey nobody asked for.>*

**Posture.** Findings below are CURRENT STATE, not a log. When a later agent
supersedes an earlier row, replace it — do not append a correction beneath it.
Superseded rows move to `archive/` or are deleted. (Append-only sediment is the
failure this project already ate once on the working doc.)

**Fleet.** 5 concurrent agents, 131,072-token window each, ~45k of that spendable
on source reads (see Budget). Dispatch in batches of 5; serialise only on real
dependency. The concurrency number lives in `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
— if you change it there, change it here, and check
`vllm:num_preemptions_total` in `/metrics` after the first full batch.

**Orchestrator notes.**
- Compact freely. This block restores orientation; the findings table holds the
  work product. Nothing else in this doc is load-bearing across a compaction.
- The orchestrator holds NO repo context of its own. It reads `git diff --stat`,
  test output, and agent reports. Everything else goes through an agent. If you
  catch yourself reading a source file directly, you are burning the context the
  delegation exists to protect.
- Dispatches are logged in the board below so a mid-scan resume knows what is
  outstanding.
- **Two-way comms via `SendMessage`.** An agent isn't set-and-forget. Use
  `SendMessage` to mid-run an agent — clarify scope, ask for extra verification,
  or redirect after a finding in another lane suggests a pivot. Keep it short;
  the agent picks it up on its next tool round and continues. Don't re-dispatch
  something you can fix with one message.

**On agent return — the consolidation steps.** Do these IN ORDER, every time:
1. **Record EVERY finding in the findings table** — not just the top N. Every row
   gets a `path:line` receipt (file AND line), rationale, failure scenario, and
   confidence mark ([V]/[C]/[H]). Lump nothing; if a cluster shares a pattern,
   spell each export on its own row.
2. **Classify by lens type.** `orphans` rows are [V] (verified to "no refs").
   `apisurface` rows (UNUSED, TEST-ONLY) are [C] (candidate). Heuristic rows
   (regkeys, raw-SQL) are [H].
3. **Move `@public future` items to Open Questions.** These are deliberate
   placeholders — not findings. They're already governed by the ratchet. They
   belong in Open Questions ("does D80 still exist?"), not the findings table.
   Same for tooling defaults (`drizzle.config.ts`, `vite.config.ts`) — loaded
   by the build, no import edge by design.
4. **Tick/strike the dispatch board** row for that agent.
5. **Update task status** via `TaskUpdate` (mark `in_progress` → `completed`).
6. **Check for duplicates** — if a finding overlaps with a prior agent, dedupe
   and mark the surviving row (keep the strongest confidence rung).
7. **Decide next batch** — if a batch is fully landed, move to the next; if
   partially landed, wait or dispatch dependent tasks.

---

## ─── BUDGET (measure, never estimate) ───

`budget <files>` gives an **exact** token count from the model's own tokenizer,
loaded straight off the checkpoint dir. Offline: no curl, no network, no running
engine — it works when vLLM is down and it is the same tokenization vLLM
performs. Every chars-per-token or lines-per-token rule of thumb is wrong by
enough to matter on TS.

```bash
budget $(git ls-files 'packages/server/src/domain/chat/**/*.ts')
```

Exits 1 and tells you how many agents to split into when a read set busts the
ceiling. Counts content only (`add_special_tokens=False`), so chat-template
framing is not double-counted against the baseline below.

Ceiling is 45,000 tokens of source per agent, derived:

| | tokens |
|---|---|
| window | 131,072 |
| baseline (system tools 20.3k, prompt 1.5k, agents 1.1k, memory 3.3k, skills 0.3k) | −26,500 |
| autocompact reserve (~25%) | −33,000 |
| available for messages | ≈71,500 |
| **source reads** | **45,000** |
| tool results + agent reasoning | ≈26,500 |

`tokei` is for LOC when you want to know how big a surface *is*. It reports
**lines**, not characters — do not build a token estimate on it. Use `budget`.

**One agent = one focused area.** Do not split an agent across three directories
unless each is genuinely a lane of the same question.

---

## ─── AGENT BRIEFING (paste into every dispatch) ───

You are a read-only scout. You find facts and report them. You never modify
anything, never make design judgments, and never spawn another agent — if the
task needs a different role, say so in your report and stop.

You can receive mid-run messages from the orchestrator via `SendMessage` —
clarifications, redirects, or requests for extra verification. Continue your
work and incorporate the incoming instruction on your next tool round.

### Evidence rules — these are the job, not the search

**A file existing proves nothing.** The ladder, weakest to strongest:

```
path exists → name matches → symbol declared → symbol exported
            → imported elsewhere → called on a live path → a test asserts it
```

Report the rung you actually reached, in those words. *"`X.ts` exists and exports
`foo`, nothing imports it"* is a finding. *"X is implemented"* is a guess.

**No matches is not absence.** `ast-grep run` exits 1 both for "no matches" and
for a search that never ran (wrong `-l`, wrong path, gitignored tree). Before any
negative claim, produce the count:

```bash
ast-grep run -p '<pattern>' -l tsx --inspect summary <paths>   # scannedFileCount=359
```

`scannedFileCount=0` means **"I could not search"**, never "not found."

**`-l ts` excludes `.tsx`. `-l js` excludes `.jsx`.** On this repo that silently
undercounts by roughly 10×. Run both and merge, every time.

**Read whole files before concluding.** Excerpts LOCATE (where is it, what's the
signature, what's this literal). They cannot establish whether something is
handled, how it behaves, or that something is missing — control flow and absent
code are invisible in an excerpt. Read in full when the question is "whether" or
"how", when the file is under ~400 lines, or when guards, early returns,
try/catch, or flags decide the answer.

**If a read comes back TRUNCATED, you have not read the file.** `Read` output is
capped (`CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`). A truncated read is an
excerpt wearing a disguise. Say the read was truncated, use `offset`/`limit` to
walk the regions that decide the answer, and never state "handled" / "not
handled" off a capped read.

**Read the comments around a hit before reporting it.** Structural search strips
them, and the comment above a declaration is routinely where the rationale lives
— whether an unreferenced export is rot or a deliberate reserved seam. Use
`-B 2` / `-C 3`, or `Read` the region.

**Never infer contents from a filename, a neighbouring file, or an outline.**
`outline` is syntax-only — no references, no types, no re-export chains. Use it
to decide WHAT to read, then read it.

### Tool doctrine

| question | tool |
|---|---|
| what's in this file/dir, before reading | `ast-grep outline <path>` |
| code SHAPE — calls, signatures, JSX, exports | `ast-grep run -p '<pat>' -l <lang>` |
| symbol-aware: refs, callers, importers, rot | `pnpm ast <verb>` |
| literal text — strings, config keys, tokens | `Grep` |
| layout | `tree -d --gitignore <path>` |
| size | `tokei` |
| module graph | `pnpm ast flow` / `pnpm ast reaches` |

**Invoke it as `ast-grep`, never `sg`.** `/usr/bin/sg` is `newgrp` on Debian.

**Use `Grep` or `pnpm ast`, never shell `rg`.** A `pnpm ast` lens is the
primary way to answer structural questions. Literal text goes through the
`Grep` tool — it selects by extension and avoids the `-l ts` trap. Shell `rg`
exists but its `ripgreprc` may lack `tsx` registration, silently undercounting.
If the agent brief says "read the doc first," this pitfall is already covered.

**Do not collapse everything into Bash.**
- Read files with `Read`, never `cat`/`head`/`sed -n`. `head -50 file` is a
  partial read smuggled through the shell.
- A standalone literal search goes through `Grep`, not shell `grep` — it selects
  by extension and sidesteps the `-l ts` trap. Inside a real pipeline
  (`… | grep | sort | uniq -c`) shell grep is correct, but use `/usr/bin/grep -a`;
  the bare `grep` may be a wrapper that skips files as binary.
- **Narrow with the tool's own flags, never by piping to `head`.** `outline
  --match/--type/--items/--view`; `run --globs/-C`; `--json=stream` into `jq`.
  A `| head -40` gives a silently truncated view with nothing marking the cut,
  and you will then report on the fragment as though you surveyed the whole —
  the same error class as claiming "not found" on a zero-file scan. If you bound
  output deliberately, say it was a sample and rest no claim on it.

**`tree -L <n>` misreports its own totals.** Verified: `-L 3` printed
"61 directories, 8 files" for a subtree holding 231 directories and 1,200 files.
Use `tree -d --gitignore` (dirs only, unlimited depth) and `git ls-files` for a
file inventory. Probe depth with:

```bash
git ls-files <path> | awk -F/ '{print NF}' | sort -n | uniq -c
```

Even complete, a tree is a map and not a survey. Stopping there is the most
common form of the file-exists-therefore-implemented error.

### `pnpm ast` — verb reference

Run bare for full usage. Two things every agent must internalise before using it:

**A scope matching zero files is a TOOL ERROR.** It prints what it tried plus a
suggestion and exits 2 — never a silent "no results." If you get exit 2, your
scope arg was wrong; fix it, don't report a clean scan.

**Positional scope, not `--filter`.** Most lenses accept a positional path
argument (`pnpm ast orphans packages/contracts`). The `--filter` flag may not
scope the lens — it scopes the build, and the count may read as "whole repo"
when you meant one package. Use positional args.

**Output auto-collapses past 60 hits** to per-file counts, with a note saying so.
That is not the full result set. Pass `--max <n>` for raw lines, or `--files` to
ask for counts deliberately.

**Syntactic (fast, ~10s load):**

| verb | answers |
|---|---|
| `callers <name>` | call sites, including method tails `obj.name()` |
| `importers <spec>` | who imports a module (static + dynamic `import()`) |
| `exports <path>` | exported symbols of a file or dir |
| `jsx <Component>` | JSX usages |
| `ident <name>` | raw identifier occurrences (comments/strings excluded) |
| `aliases <scope>` | rename laundering: `X as Y`, `const Y = X`, `type Y = X` |
| `regkeys [scope]` | registry ROWS whose key is dispatched nowhere |

**Type-resolved (slow — the language service loads):**

| verb | answers |
|---|---|
| `refs <name>` | every real reference, defs marked. Exact, expensive |
| `cycles <pkg>` | import cycles, alias-resolved |
| `orphans <scope>` | exports reached by NOBODY, prod or test |
| `testonly <scope>` | exports reached ONLY from tests |
| `prodonly <scope>` | FILES no production entry can reach |
| `unwired [ns.proc]` | server tRPC procs no client consumes |
| `clientgap [scope]` | `*View`/`*Summary` the server uses, the client never does |
| `swallowed [scope]` | exports alive only because `import * as` ate their module |
| `respell [domain]` | domain `contract/` shapes identical to an `@orb/contracts` shape |
| `typeonly-alive [scope]` | VALUE exports whose every reference is a TYPE position |
| `columns [table]` | drizzle columns by consumption: R+W / W-only / R-only / neither |
| `chains [scope]` | WHOLE dead chains — declarations alive only via other dead ones |
| `stringy [scope]` | type aliases resolving to bare `string` — no narrowing, no brand |
| `apisurface [scope]` | exports by package boundary: PUBLIC / INTERNAL / TEST-ONLY / UNUSED |

Bracketed scope is optional — those verbs run bare over the whole surface.

**CANDIDATE lenses require a human verdict.** `swallowed`, `clientgap`,
`respell`, `typeonly-alive`, `columns`, `chains`, `apisurface` each print a
banner saying so. `regkeys` is explicitly HEURISTIC and INFORMATIONAL — a key
arriving from the DB, a URL segment, a template literal, or an
`Object.keys(REG)` iteration is a LIVE row that looks dead there. **Report a
candidate as a candidate.** Never write "X is dead" off a candidate lens; write
"X is a `<lens>` candidate — verify at `<sites>`."

**Exit 1 from `swallowed` / `typeonly-alive` / `columns` is not a failure.** Those
lenses report STALE two-sided markers and set exit 1 so a marker cannot rot into
a permanent lie. Read the STALE block; it is a finding.

**`chains` is fixed at the HEAD.** Every chain terminates at an unconsumed head
that `orphans` already reports. One missed edge amplifies through the fixpoint
into a whole dead-looking subtree, so verify before recommending anything.

**Choosing between `refs` and `ident`:** `refs` is exact and follows aliases and
re-export hops; `ident` is fast and text-matches identifier nodes. Locate with
`ident`, conclude with `refs`.

### Web

`WebFetch`/`WebSearch` exist to verify EXTERNAL facts — a third-party API, a
config option, a version behaviour. Cite the URL when a finding rests on one.

They are **never** a substitute for reading this repo. If the question is "how
does X work *here*", the answer is in the files. Reporting a library's general
behaviour as how this codebase works is the exact failure this role prevents. If
web and source disagree, **the source wins and the disagreement is the finding.**

> These tools are currently denied in `.claude/settings.json`. If a finding
> genuinely needs one, say so in your report — do not work around it.

### Report format

Your final message is the deliverable. Under 8,000 characters (the subagent
return cap — anything longer is truncated and the tail is lost). Structure:

1. **Direct answer**, two sentences.
2. **Findings table**, at most 12 rows:

```
| # | Finding | Why it matters | Where | Failure scenario |
|---|---------|----------------|-------|------------------|
| 1 | <≤60 chars> | <rationale> | `path:line` | <wrong output / crash> |
```

3. **Coverage line** — what you did NOT cover: paths, languages, ignored dirs,
   and any `scannedFileCount` that came back zero.

Every load-bearing claim carries its `path:line` receipt. No receipt, no claim.
No file dumps. If one fact is doing all the work, say so and show the receipt
twice.

---

## ─── DISPATCH BOARD ───

Five slots. Tick when dispatched, strike when the report lands.

- [x] **Area:** packages/contracts,db,kit,client,ui,server — **Agent:** scout — **Budget:** 424+9+112+297+61+594 aliases — **Brief:** `pnpm ast orphans` — exports reached by nobody
- [x] **Area:** packages/contracts,db,kit,client,ui,server — **Agent:** scout — **Budget:** 8929 own-exports — **Brief:** `pnpm ast apisurface` — PUBLIC/INTERNAL/TESTONLY/UNUSED classification
- [x] **Area:** packages/contracts,db,kit,client,ui,server — **Agent:** scout — **Budget:** 1477 aliases total — **Brief:** `pnpm ast stringy` — bare `string` type aliases
- [x] **Area:** packages/contracts,db,kit,client,ui,server — **Agent:** scout — **Budget:** NA (tool) — **Brief:** `pnpm ast swallowed` — namespace-masked rot (0 candidates, exit 0)
- [x] **Area:** packages/contracts,db,kit,client,ui,server — **Agent:** scout — **Budget:** 48 candidates — **Brief:** `pnpm ast typeonly-alive` — value-only type refs (exit 0)
- [x] **Area:** packages/contracts,db,kit,client,ui,server — **Agent:** scout — **Budget:** 17876 decls / 65651 edges — **Brief:** `pnpm ast chains` — dead declaration chains (0 chain-dead)

Example:
`- [x] **Area:** packages/server/src/routes — **Agent:** scout — **Budget:** 31k — **Brief:** Trace every route registration to its handler; report unwired ones.`

Budget is the `budget` figure for the agent's read set, recorded so a
mid-investigation resume can tell a scoping failure from a genuine dead end.

---

## ─── FINDINGS (current state) ───

| # | Finding | Why it matters | Where | Failure scenario | Conf. |
|---|---------|----------------|-------|------------------|-------|
| 1 | `ResolveBlobRefsParams` — dead type twin | Schema ships, alias unreferenced | `packages/contracts/src/assets/index.ts:148` | Stale twin diverges if schema changes | [V] |
| 2 | `ResolveChatBlobRefsParams` — dead type twin | Mirror of #1 | `packages/contracts/src/assets/index.ts:165` | Same failure as #1 | [V] |
| 3 | `AutomationTriggerBus` — dead type twin | Const consumed, alias not | `packages/contracts/src/automation/index.ts:61` | Stale twin if enum values change | [V] |
| 4 | `AutomationBusEventType` — dead type twin | Derivative alias, const is live | `packages/contracts/src/automation/index.ts:349` | Unused if event type isn't narrowed | [V] |
| 5 | `TurnAbortedOpCode` — dead type twin | Re-exported by barrel, never named-imported | `packages/contracts/src/chat/bus.ts:132` | Dead if abort op code isn't consumed | [V] |
| 6 | `participantKindSchema` — dead z-schema | `PARTICIPANT_KINDS` const is live, not the schema | `packages/contracts/src/chat/participants.ts:24` | Schema wasted if only enum is referenced | [V] |
| 7 | `participantRoleSchema` — dead z-schema | Same pattern | `packages/contracts/src/chat/roster.ts:28` | Schema wasted if only enum is referenced | [V] |
| 8 | `inviteStatusSchema` — dead z-schema | `INVITE_STATUSES` const is live | `packages/contracts/src/chat/roster.ts:402` | Schema wasted if only enum is referenced | [V] |
| 9 | `AcceptInviteInput` — dead inferred type | Schema is entry point, alias not imported | `packages/contracts/src/chat/roster.ts:437` | Stale if schema shape changes | [V] |
| 10 | `userKindSchema` — dead z-schema | `USER_KINDS` const is live | `packages/contracts/src/identity/index.ts:21` | Schema wasted if only enum is referenced | [V] |
| 11 | `GeneratePictureRequest` — dead inferred type | `GenerateImageActionArgs` is the live type | `packages/contracts/src/imagery/index.ts:224` | Stale twin if imagery contract evolves | [V] |
| 12 | `RefineryCustomStageConfig` — dead type twin | Schema is entry point | `packages/contracts/src/refinery/index.ts:270` | Stale if refinery schema changes | [V] |
| 13 | `RefineryFieldScore` — dead inferred type | Schema ships, alias not | `packages/contracts/src/refinery/index.ts:349` | Stale twin if score shape changes | [V] |
| 14 | `RpgWeatherType` — dead enum | RPG in-progress | `packages/contracts/src/rpg/ambient.ts:48` | Dead until RPG consumes weather | [V] |
| 15 | `RpgCheckpointTrigger` — dead enum | RPG in-progress | `packages/contracts/src/rpg/enums.ts:43` | Dead until RPG consumes checkpoints | [V] |
| 16 | `RpgTrackerWrite` — dead enum | RPG in-progress | `packages/contracts/src/rpg/enums.ts:66` | Dead until tracker wires it | [V] |
| 17 | `RpgTrackerSubject` — dead enum | RPG in-progress | `packages/contracts/src/rpg/enums.ts:75` | Dead until tracker wires it | [V] |
| 18 | `RpgToolRoundToolName` — dead type | RPG in-progress | `packages/contracts/src/rpg/extraction.ts:415` | Dead until tool rounds consume it | [V] |
| 19 | `RpgActorIdentityTextField` — dead type | RPG in-progress | `packages/contracts/src/rpg/actor.ts:269` | Dead until actor identity feature | [V] |
| 20 | `RpgQuestAction` — dead type | RPG in-progress | `packages/contracts/src/rpg/tools.ts:183` | Dead until quest logic ships | [V] |
| 21 | `RollDiceArgs` — dead type | RPG in-progress | `packages/contracts/src/rpg/tools.ts:271` | Dead until dice rolls consume it | [V] |
| 22 | `RpgRelationshipKind` — dead type | RPG in-progress | `packages/contracts/src/rpg/enums.ts:91` | Dead until relationships ship | [V] |
| 23 | `RpgCyoaChoiceBehavior` — dead type | RPG in-progress | `packages/contracts/src/rpg/enums.ts:102` | Dead until CYOA choices ship | [V] |
| 24 | `RpgModeCapabilityAxis` — dead type | RPG in-progress | `packages/contracts/src/rpg/mode.ts:98` | Dead until mode capability ships | [V] |
| 25 | `RpgPopulate` — dead type | RPG in-progress | `packages/contracts/src/rpg/extraction.ts:705` | Dead until populate feature | [V] |
| 26 | `AA_LARGE_RATIO` — dead numeric constant | No downstream reference | `packages/kit/src/theme-derivation/index.ts:56` | Dead if theme derivation drops it | [V] |
| 27 | `HostVersionUnservedError` — dead error class | Never thrown by name, caught as base | `packages/server/src/domain/plugin/contract/errors.ts:25` | Dead if no handler catches it specifically | [V] |
| 28 | `AlertDialogHandle` — dead UI handle alias | Prod callers use factory, tests use type | `packages/ui/src/primitives/alert-dialog/handle.ts:6` | Dead if no component refs the type | [V] |
| 29 | `DialogHandle` — dead UI handle alias | Same pattern | `packages/ui/src/primitives/dialog/handle.ts:7` | Dead if no component refs the type | [V] |
| 30 | `DrawerHandle` — dead UI handle alias | Same pattern | `packages/ui/src/primitives/drawer/handle.ts:6` | Dead if no component refs the type | [V] |
| 31 | `MenuHandle` — dead UI handle alias | Same pattern | `packages/ui/src/primitives/menu/handle.ts:9` | Dead if no component refs the type | [V] |
| 32 | `PopoverHandle` — dead UI handle alias | Same pattern | `packages/ui/src/primitives/popover/handle.ts:7` | Dead if no component refs the type | [V] |
| 33 | `TooltipHandle` — dead UI handle alias | Same pattern | `packages/ui/src/primitives/tooltip/handle.ts:7` | Dead if no component refs the type | [V] |
| 34 | TEST-ONLY: ClipKind cluster + isChatBusEventType | Core contract shapes only used by stories | `packages/contracts/src/memory/index.ts:15-30`, `packages/contracts/src/chat/bus.ts:339` | Wrong boundary if another package needs them | [C] |
| 35 | TEST-ONLY: `TEMPLATE_DEF_BY_ID` | Preset template lookup map | `packages/contracts/src/preset/index.ts:1810` | Missed if preset consumer needs it by name | [C] |
| 36 | TEST-ONLY: `useViewer` | Fundamental viewer hook, only story-tested | `packages/client/src/data/use-viewer.ts:23` | Dead ref if a component adds it late | [C] |
| 37 | TEST-ONLY: `useDeleteRefinerySession` | Live mutation hook, story coverage only | `packages/client/src/features/refinery/hooks/use-refinery-mutations.ts:130` | Dead until refinery session delete wires it | [C] |
| 38 | TEST-ONLY: `create*Handle` factories (3) | Handle factories only tested, prod uses types | `packages/ui/src/primitives/alert-dialog/handle.ts:4`, `dialog/handle.ts:5`, `drawer/handle.ts:4` | Dead if prod callers use the type alias | [C] |
| 39 | TEST-ONLY: `createCaller` | Standard tRPC caller factory | `packages/server/src/transport/trpc/router.ts:100` | Dead if integration tests are the only callers | [C] |
| 40 | `usersRelations` — exempted, deliberate `import * as` pass-through | Drizzle relations anchor; no code names it directly | `packages/db/src/schema/relations.ts:22` | If removed, drizzle receives empty relations config | [V] |
| 41 | `CHAT_INJECTION_ORIGINS` — type-only tuple | Server-side stamp; derived type flows to callers | `packages/contracts/src/chat/assemble.ts:109` | Dead if `ChatInjectionOrigin` type were removed | [C] |
| 42 | `SHAPE_BREAKPOINT_DECISIONS` — type-only tuple | Shape assembly; never iterated at runtime | `packages/contracts/src/chat/assemble.ts:247` | Dead if breakpoint type were replaced with literal | [C] |
| 43 | `SHAPE_ROW_SOURCES` — type-only tuple | Row source types; never iterated | `packages/contracts/src/chat/assemble.ts:263` | Dead if row-source type were replaced | [C] |
| 44 | `TURN_INTENTS` — type-only tuple | Bus intent axis; never iterated | `packages/contracts/src/chat/bus.ts:118` | Dead if turn-intent type were replaced | [C] |
| 45 | `CHAT_UNAVAILABLE_CAUSES` — type-only tuple | Connection unavailability; never iterated | `packages/contracts/src/connection/index.ts:350` | Dead if cause type were replaced | [C] |
| 46 | `INGEST_OUTCOMES` — type-only tuple | Databank ingest result; never iterated | `packages/contracts/src/databank/index.ts:184` | Dead if outcome type were replaced | [C] |
| 47 | `GLOBAL_ACTIONS` — type-only tuple | Identity actions; never iterated | `packages/contracts/src/identity/index.ts:59` | Dead if action type were replaced | [C] |
| 48 | `CHAT_ACTIONS` — type-only tuple | Identity actions; never iterated | `packages/contracts/src/identity/index.ts:63` | Dead if action type were replaced | [C] |
| 49 | `PORTABLE_PARSE_FAILURES` — type-only tuple | Portability errors; never iterated | `packages/contracts/src/portability/index.ts:78` | Dead if failure type were replaced | [C] |
| 50 | `SIDE_GEN_KINDS` — type-only tuple | Preset side generation; never iterated | `packages/contracts/src/preset/index.ts:109` | Dead if kind type were replaced | [C] |
| 51 | `POST_PROCESS_LANE` — type-only tuple | Preset post-processing; never iterated | `packages/contracts/src/preset/index.ts:2109` | Dead if lane type were replaced | [C] |
| 52 | `REFINERY_ADVISORY_CODES` — type-only tuple | Refinery advisories; never iterated | `packages/contracts/src/refinery/schema-advisory.ts:45` | Dead if advisory type were replaced | [C] |
| 53 | `refinerySchemaSummarySchema` — type-only | Schema wrapper; type is consumer | `packages/contracts/src/refinery/schema-authoring.ts:240` | Dead if schema type were replaced | [C] |
| 54 | `RPG_FOLD_FALLBACK_REASONS` — type-only tuple | RPG fold reasons; never iterated | `packages/contracts/src/rpg/config.ts:127` | Dead if reason type were replaced | [C] |
| 55 | `RPG_DELIVERY_PATHS` — type-only tuple | RPG delivery; never iterated | `packages/contracts/src/rpg/config.ts:139` | Dead if path type were replaced | [C] |
| 56 | `BACKGROUND_MATERIALIZE_FAILURES` — type-only tuple | Theme materialize; never iterated | `packages/contracts/src/theme/materialize.ts:23` | Dead if failure type were replaced | [C] |
| 57 | `THEME_KEY_REACHES` — type-only tuple | Theme override; never iterated | `packages/contracts/src/theme/override.ts:77` | Dead if reach type were replaced | [C] |
| 58 | `CONSTRAINT_KINDS` — type-only tuple | DB constraint types; never iterated | `packages/db/src/kit/db-errors.ts:12` | Dead if kind type were replaced | [C] |
| 59 | `CARD_FRAME_DELIVERIES` — type-only tuple | Card frame delivery; never iterated | `packages/kit/src/card-frame/index.ts:45` | Dead if delivery type were replaced | [C] |
| 60 | `MACRO_CATEGORIES` — type-only tuple | Macro categories; never iterated | `packages/kit/src/macro/types.ts:63` | Dead if category type were replaced | [C] |
| 61 | `CHARACTER_CARD_FACET_IDS` — type-only tuple | 3 type refs, 0 runtime | `packages/client/src/features/character/lib/character-card-facets.ts:24` | Conformance anchor, not runtime value | [C] |
| 62 | `MEMBER_ROW_CONFIRMS` — type-only tuple | Component derives type; never iterates | `packages/client/src/features/chat/lib/member-rows.ts:52` | Dead if type alias is sole consumer | [C] |
| 63 | `REGEX_SKIP_REASONS` — type-only tuple | Regex pipeline; never iterated | `packages/client/src/features/regex/lib/regex-pipeline.ts:34` | Dead if reason type were replaced | [C] |
| 64 | `WORKLOAD_PARAM_SHAPES` — type-only tuple | Workload params; never iterated | `packages/client/src/features/workloads/lib/workloads-model.ts:170` | Dead if shape type were replaced | [C] |
| 65 | `CHAT_SURFACE_ANCHORS` — type-only tuple | Contribution anchors; never iterated | `packages/client/src/lib/contribution-contracts.ts:27` | Dead if consumer only checks type union | [C] |
| 66 | `CHARACTER_DETAIL_ANCHORS` — type-only tuple | Single-element tuple; could be literal | `packages/client/src/lib/contribution-contracts.ts:65` | Overhead where a literal suffices | [C] |
| 67 | `CHAT_CONTEXT_TAB_IDS` — type-only tuple | Tab registry; never iterated | `packages/client/src/lib/registry-contracts.ts:323` | Dead if tab-ID type were replaced | [C] |
| 68 | `TAG_FILTER_STATES` — type-only tuple | Tag filter; never iterated | `packages/client/src/lib/tag-filter-state.ts:14` | Dead if state type were replaced | [C] |
| 69 | `INGEST_PHASES` — type-only tuple | Databank filter phases; never iterated | `packages/client/src/state/databank-filter-store.ts:31` | Dead if phase type were replaced | [C] |
| 70 | `HOME_TILE_SPANS` — type-only tuple | Tile layout; never iterated | `packages/client/src/state/home-tile-contracts.ts:18` | Dead if span type were replaced | [C] |
| 71 | `MODAL_TRIGGER_PLACEMENTS` — type-only tuple | Modal placement; never iterated | `packages/client/src/state/modal-registry.ts:16` | Dead if placement type were replaced | [C] |
| 72 | `SAVE_LIFECYCLE_STATES` — type-only tuple | Save lifecycle; never iterated | `packages/client/src/state/settings-save-status-store.ts:29` | Dead if state type were replaced | [C] |
| 73 | `WEAVE_STATES` — type-only tuple | Art geometry; never iterated | `packages/ui/src/art/web-weave/web-weave-geometry.ts:23` | Dead if state type were replaced | [C] |
| 74 | `GAP_TOKENS` — type-only tuple | Gap sizing; `gapPxFor` uses type | `packages/ui/src/lib/virtual-gap.ts:11` | Correctly typeonly — function typed via alias | [C] |
| 75 | `CHAT_AUTHORITIES` — type-only tuple | Auth matrix axis; never iterated | `packages/server/src/domain/chat/substrate/auth/matrix.ts:31` | Conformance seam, not runtime collection | [C] |
| 76 | `CHAT_NONVERB_SURFACES` — type-only tuple | Auth surfaces; never iterated | `packages/server/src/domain/chat/substrate/auth/matrix.ts:159` | Dead if surface type were replaced | [C] |
| 77 | `MODEL_FAMILIES` — type-only tuple | Model capability; never iterated | `packages/server/src/domain/connection/catalog/model-family.ts:14` | Dead if family type were replaced | [C] |
| 78 | `VECTOR_TABLES` — type-only tuple | Embedding tables; never iterated | `packages/server/src/domain/embeddings/contract/params.ts:19` | Dead if table type were replaced | [C] |
| 79 | `EFFECTIVE_PROVENANCES` — type-only tuple | Preset provenance; never iterated | `packages/server/src/domain/preset/contract/views.ts:38` | Dead if provenance type were replaced | [C] |
| 80 | `TOOL_SOURCES` — type-only tuple | Tool sources; never iterated | `packages/server/src/domain/tool-use/contract/params.ts:21` | Dead if source type were replaced | [C] |
| 81 | `DIAGNOSTICS_EXPOSURES` — type-only tuple | Env diagnostics; never iterated | `packages/server/src/foundation/env/diagnostics.ts:49` | Dead if exposure type were replaced | [C] |
| 82 | `IMAGE_FORMATS` — type-only tuple | Image format types; never iterated | `packages/server/src/infra/image/index.ts:25` | Dead if format type were replaced | [C] |
| 83 | `PROVIDER_LOG_LEVELS` — type-only tuple | Provider logging; never iterated | `packages/server/src/infra/providers/backends/kit/provider-log.ts:9` | Dead if level type were replaced | [C] |
| 84 | `AGENT_DIALOG_KINDS` — type-only tuple | Agent dialog; never iterated | `packages/server/src/infra/providers/contract/agent.ts:12` | Dead if kind type were replaced | [C] |
| 85 | `BACKEND_KEYS` — type-only tuple | Backend keys; never iterated | `packages/server/src/infra/providers/contract/backend.ts:43` | Dead if key type were replaced | [C] |
| 86 | `PROVIDER_ROLES` — type-only tuple | Backend roles; never iterated | `packages/server/src/infra/providers/contract/backend.ts:50` | Dead if role type were replaced | [C] |
| 87 | `ENGINE_LIFECYCLE_STATUSES` — type-only tuple | vLLM engine; never iterated | `packages/server/src/infra/providers/vllm/engine/engine-status.ts:9` | Dead if status type were replaced | [C] |
| 88 | `CHAT_BUCKETS` — type-only tuple | Chat serialization; never iterated | `packages/server/src/kit/serde/chat/index.ts:38` | Dead if bucket type were replaced | [C] |
| 89 | `swallowed` — 0 candidates across 6 packages | No namespace-masked rot; `import * as` resolves to explicit imports | All packages | Zero means no exports alive only due to namespace consumption | [C] |
| 90 | `typeonly-alive` — 48 candidates (17 contracts, 14 server, 12 client, 2 each db/kit/ui) | `as const` tuples whose only consumer is a derived type alias | 6 packages | All exit 0 (no stale markers) | [C] |
| 91 | `chains` — 0 chain-dead declarations | Orphans table captures full dead surface; fixpoint is clean | Workspace graph (17876 decls / 65651 edges) | Confirms no dead sub-declarations hang below orphan heads | [C] |
| 92 | `GlobalVariableView` — clientgap | Server uses View; client has no import edge | `packages/contracts/src/automation/index.ts:97` | Dead if client accesses automation via Trpc proxy only | [C] |
| 93 | `BudgetView` — clientgap | Server uses View; client has no import edge | `packages/contracts/src/automation/index.ts:120` | Dead if client accesses automation via Trpc proxy only | [C] |
| 94 | `PluginMessageView` — clientgap | Plugin host view; client unused | `packages/contracts/src/plugin/host-v1.ts:31` | Dead if PluginHostV1 is server-only | [C] |
| 95 | `RefinerySessionSummary` — clientgap | Server view; client unused | `packages/contracts/src/refinery/index.ts:633` | Dead if client never reads session summary | [C] |
| 96 | `RefinerySchemaSummary` — clientgap | Server view; client unused | `packages/contracts/src/refinery/schema-authoring.ts:250` | Dead if client never reads schema summary | [C] |
| 97 | `RpgTurnToolCallsView` — clientgap | Server view; client unused | `packages/contracts/src/rpg/views.ts:199` | Dead if client reads turn tools via Trpc | [C] |
| 98 | `AppSettingsView` — clientgap | Server view; client unused | `packages/contracts/src/settings/index.ts:1170` | Dead if client reads settings via Trpc proxy | [C] |
| 99 | `BookView` — clientgap | Server view; client unused | `packages/contracts/src/world-info/index.ts:121` | Dead if client reads books via Trpc | [C] |
| 100 | `BookAttachmentView` — clientgap | Server view; client unused | `packages/contracts/src/world-info/index.ts:167` | Dead if client reads attachments via Trpc | [C] |
| 101 | `resolveBlobRefs` — unwired tRPC proc | Server-only proc; client has no static import (consumed via `api.assets.resolveBlobRefs.*()`) | `packages/server/src/transport/trpc/routers/assets.ts:34` | Dead if no client code calls this proc | [C] |
| 102 | `listRules` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:40` | Dead if no client code calls this proc | [C] |
| 103 | `reorderRules` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:44` | Dead if no client code calls this proc | [C] |
| 104 | `createRule` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:51` | Dead if no client code calls this proc | [C] |
| 105 | `updateRule` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:66` | Dead if no client code calls this proc | [C] |
| 106 | `setRuleEnabled` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:81` | Dead if no client code calls this proc | [C] |
| 107 | `deleteRule` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:85` | Dead if no client code calls this proc | [C] |
| 108 | `testRule` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:91` | Dead if no client code calls this proc | [C] |
| 109 | `listFires` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:96` | Dead if no client code calls this proc | [C] |
| 110 | `setBudgets` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:107` | Dead if no client code calls this proc | [C] |
| 111 | `getBudgets` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/automation.ts:124` | Dead if no client code calls this proc | [C] |
| 112 | `getCatalog` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/connection.ts:13` | Dead if no client code calls this proc | [C] |
| 113 | `getAgentSdkCatalog` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/connection.ts:36` | Dead if no client code calls this proc | [C] |
| 114 | `attachToCharacter` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/databank.ts:101` | Dead if no client code calls this proc | [C] |
| 115 | `detachFromCharacter` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/databank.ts:107` | Dead if no client code calls this proc | [C] |
| 116 | `swipeHotspots` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/discovery.ts:117` | Dead if no client code calls this proc | [C] |
| 117 | `similarChats` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/discovery.ts:186` | Dead if no client code calls this proc | [C] |
| 118 | `editImage` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/imagery.ts:34` | Dead if no client code calls this proc | [C] |
| 119 | `extractPrompt` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/imagery.ts:57` | Dead if no client code calls this proc | [C] |
| 120 | `readProvenance` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/imagery.ts:77` | Dead if no client code calls this proc | [C] |
| 121 | `install` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/plugin.ts:37` | Dead if no client code calls this proc | [C] |
| 122 | `upgrade` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/plugin.ts:41` | Dead if no client code calls this proc | [C] |
| 123 | `setEnabled` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/plugin.ts:45` | Dead if no client code calls this proc | [C] |
| 124 | `uninstall` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/plugin.ts:49` | Dead if no client code calls this proc | [C] |
| 125 | `list` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/plugin.ts:53` | Dead if no client code calls this proc | [C] |
| 126 | `getLog` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/plugin.ts:55` | Dead if no client code calls this proc | [C] |
| 127 | `runSnippet` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/plugin.ts:63` | Dead if no client code calls this proc | [C] |
| 128 | `getScript` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/regex.ts:48` | Dead if no client code calls this proc | [C] |
| 129 | `rollDice` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/rpg.ts:89` | Dead if no client code calls this proc | [C] |
| 130 | `bulkAttachTag` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/tag.ts:92` | Dead if no client code calls this proc | [C] |
| 131 | `attachToChat` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/world-info.ts:177` | Dead if no client code calls this proc | [C] |
| 132 | `detachFromChat` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/world-info.ts:185` | Dead if no client code calls this proc | [C] |
| 133 | `listForChat` — unwired tRPC proc | Server-only proc; client has no static import | `packages/server/src/transport/trpc/routers/world-info.ts:193` | Dead if no client code calls this proc | [C] |
| 134 | `drizzle.config.ts` — prodonly unreachable | Config loaded by Drizzle CLI, not production entry | `packages/db/drizzle.config.ts:11` | Dead if migrations don't require it at runtime | [V] |
| 135 | `vite.config.ts` — prodonly unreachable | Config loaded by Vite, not production entry | `packages/client/vite.config.ts:1` | Dead if dev-only config | [V] |
| 136 | `tokens.build.ts` — prodonly unreachable | Build script for design tokens | `packages/ui/src/tokens.build.ts:17` | Dead if build-only tooling | [V] |
| 137 | `tokens.near-duplicate.ts` — prodonly unreachable | Token analysis utility | `packages/ui/src/tokens.near-duplicate.ts:26` | Dead if build-only tooling | [V] |
| 138 | `cycles` — 0 intra-package cycles | No circular deps across 6 packages | `scripts/codemods/ast.ts:1322` | Clean graph; no barrel-splitting needed | [C] |
| 139 | `automationFireOutcomeSchema` — testonly | Zod schema tested; prod uses inferred type | `packages/contracts/src/automation/index.ts:77` | Dead if automation consumers use the union directly | [C] |
| 140 | `globalVariableKeySchema` — testonly | String constraint tested; prod uses inline | `packages/contracts/src/automation/index.ts:93` | Dead if prod uses inline validation | [C] |
| 141 | `isChatBusEventType` — testonly | Type guard needed only in tests | `packages/contracts/src/chat/bus.ts:339` | Dead if prod uses the union directly | [C] |
| 142 | `CONTENT_CLASS_POLICY` — testonly | Policy consumed via intermediate function | `packages/contracts/src/chat/content-classes.ts:44` | Dead if prod routes through a wrapper | [C] |
| 143 | `MessageSlot` — testonly | Inferred type shadowed by schema in prod | `packages/contracts/src/chat/messages.ts:55` | Dead if schema is the sole consumer | [C] |
| 144 | `NotificationSchema` — testonly | Wide re-export in prod; leaf in tests | `packages/contracts/src/notification/index.ts:30` | Dead if barrel is the only consumer | [C] |
| 145 | `PersonatraitsSchema` — testonly | Plural typo used only in tests | `packages/contracts/src/persona/traits.ts:82` | Dead if prod imports via barrel | [C] |
| 146 | `CLIP_SOURCE_KINDS` — testonly | Enum consumed indirectly via inference | `packages/contracts/src/memory/index.ts:20` | Dead if prod uses the literal values | [C] |
| 147 | `ClipSourceKind` — testonly | Inferred from the const above | `packages/contracts/src/memory/index.ts:22` | Dead if source is imported directly | [C] |
| 148 | `clipSourceKindSchema` — testonly | Zod schema tested in contracts | `packages/contracts/src/memory/index.ts:24` | Dead if prod uses the inferred type | [C] |
| 149 | `CLIP_SCOPES` — testonly | Enum consumed indirectly | `packages/contracts/src/memory/index.ts:26` | Dead if prod uses the literal values | [C] |
| 150 | `ClipScope` — testonly | Inferred from the const above | `packages/contracts/src/memory/index.ts:28` | Dead if scope is imported directly | [C] |
| 151 | `clipScopeSchema` — testonly | Zod schema tested in contracts | `packages/contracts/src/memory/index.ts:30` | Dead if prod uses the inferred type | [C] |
| 152 | `TEMPLATE_DEF_BY_ID` — testonly | Large lookup map tested; prod via helper | `packages/contracts/src/preset/index.ts:1810` | Dead if prod accesses via `byId()` | [C] |
| 153 | `PRESET_GUIDED_SLOT_IDS` — testonly | Slot-ID map consumed by assembler | `packages/contracts/src/preset/prose.ts:448` | Dead if assembler is the sole consumer | [C] |
| 154 | `rpgGameStatusSchema` — testonly | Zod schema validated in unit tests | `packages/contracts/src/rpg/enums.ts:21` | Dead if prod uses the inferred type | [C] |
| 155 | `rpgCheckpointTriggerSchema` — testonly | Zod schema validated in unit tests | `packages/contracts/src/rpg/enums.ts:44` | Dead if prod uses the inferred type | [C] |
| 156 | `rpgTrackerShapeSchema` — testonly | Zod schema validated in unit tests | `packages/contracts/src/rpg/enums.ts:56` | Dead if prod uses the inferred type | [C] |
| 157 | `rpgTrackerWriteSchema` — testonly | Zod schema validated in unit tests | `packages/contracts/src/rpg/enums.ts:67` | Dead if prod uses the inferred type | [C] |
| 158 | `rpgTrackerSubjectSchema` — testonly | Zod schema validated in unit tests | `packages/contracts/src/rpg/enums.ts:76` | Dead if prod uses the inferred type | [C] |
| 159 | `rpgTrackerCarrierClassSchema` — testonly | Zod schema validated in unit tests | `packages/contracts/src/rpg/enums.ts:83` | Dead if prod uses the inferred type | [C] |
| 160 | `MODE_POLICY` — testonly | Policy record routed through lookup | `packages/contracts/src/rpg/mode.ts:51` | Dead if prod routes through a function | [C] |
| 161 | `RpgPlotAct` — testonly | Inferred type shadowed by schema | `packages/contracts/src/rpg/snapshot.ts:33` | Dead if schema is the sole consumer | [C] |
| 162 | `resolveTrackerCarriers` — testonly | Resolver called by a wrapper | `packages/contracts/src/rpg/tracker.ts:177` | Dead if engine wraps it directly | [C] |
| 163 | `memoryRetrievalModeSchema` — testonly | Zod schema; prod uses the enum | `packages/contracts/src/search/index.ts:14` | Dead if prod uses inferred values | [C] |
| 164 | `STREAM_CHANNELS` — testonly | Const tuple via wider streaming module | `packages/contracts/src/stream/index.ts:58` | Dead if streaming module is sole consumer | [C] |
| 165 | `TagAttachmentView` — testonly | Interface referenced via underlying row | `packages/contracts/src/tag/index.ts:93` | Dead if row type is the sole consumer | [C] |
| 166 | `VIEWER_SACRED_THEME_KEYS` — testonly | Filtered key array consumed by merger | `packages/contracts/src/theme/override.ts:112` | Dead if theme merger is sole consumer | [C] |
| 169 | `resolveViewerActivePersonaId` — testonly | Resolver consumed by orchestrator | `packages/client/src/features/chat/lib/roster.ts:35` | Dead if wrapper is the sole caller | [C] |
| 170 | `sectionKind` — testonly | Dispatcher called internally | `packages/client/src/features/preset/lib/assembly-model.ts:21` | Dead if assembly is sole caller | [C] |
| 171 | `guidedFooterState` — testonly | Computed state helper | `packages/client/src/features/preset/lib/assembly-model.ts:198` | Dead if UI binds to the result | [C] |
| 173 | `__resetTagFilter` — testonly | Test-only reset (underscore convention) | `packages/client/src/state/character-library-store.ts:141` | Dead if no prod path calls it | [C] |
| 174 | `__setFrameSchedulerForTest` — testonly | Test injection; prod uses default | `packages/client/src/state/chat-stream.ts:114` | Dead if only tests set the scheduler | [C] |
| 175 | `subscribeTurnSlot` — testonly | Subscription API consumed internally | `packages/client/src/state/chat-stream.ts:345` | Dead if stream is sole consumer | [C] |
| 176 | `__readComposerDraftsForTest` — testonly | Test peek into composer drafts | `packages/client/src/state/composer-draft-store.ts:88` | Dead if store is read directly | [C] |
| 177 | `__resetComposerDrafts` — testonly | Test reset | `packages/client/src/state/composer-draft-store.ts:93` | Dead if only tests reset drafts | [C] |
| 178 | `__resetCollectionGroupOpen` — testonly | Test reset | `packages/client/src/state/config-group-open-store.ts:66` | Dead if only tests reset groups | [C] |
| 179 | `createEntityDraftStore` — testonly | Factory consumed by a wrapper | `packages/client/src/state/create-entity-draft-store.ts:98` | Dead if wrapper instantiates directly | [C] |
| 180 | `__readHomeTileBoxForTest` — testonly | Test peek | `packages/client/src/state/home-tile-box-store.ts:83` | Dead if store is read directly | [C] |
| 181 | `__resetHomeTileBoxes` — testonly | Test reset | `packages/client/src/state/home-tile-box-store.ts:88` | Dead if only tests reset | [C] |
| 182 | `__readMessageEditDraftForTest` — testonly | Test peek | `packages/client/src/state/message-edit-draft.ts:52` | Dead if store is read directly | [C] |
| 183 | `__resetSelection` — testonly | Test reset | `packages/client/src/state/message-selection-store.ts:46` | Dead if only tests reset | [C] |
| 184 | `__resetPresetSelection` — testonly | Delegated clear; tests trigger directly | `packages/client/src/state/preset-selection-store.ts:18` | Dead if only tests clear | [C] |
| 185 | `__resetPresetSection` — testonly | Delegated clear | `packages/client/src/state/preset-selection-store.ts:22` | Dead if only tests clear | [C] |
| 186 | `__dismissPresetSectionForTest` — testonly | Test dismissal | `packages/client/src/state/preset-selection-store.ts:24` | Dead if only tests dismiss | [C] |
| 187 | `__resetPresetTemplate` — testonly | Delegated clear | `packages/client/src/state/preset-template-selection-store.ts:24` | Dead if only tests clear | [C] |
| 188 | `__readRecentModelsForTest` — testonly | Test peek | `packages/client/src/state/recent-models-store.ts:71` | Dead if store is read directly | [C] |
| 189 | `__resetAllRecentModels` — testonly | Test reset | `packages/client/src/state/recent-models-store.ts:76` | Dead if only tests reset | [C] |
| 190 | `__peekRefineryViewForTest` — testonly | Test peek | `packages/client/src/state/refinery-view-store.ts:33` | Dead if store is read directly | [C] |
| 191 | `__readRegexBulkForTest` — testonly | Test peek | `packages/client/src/state/regex-bulk-store.ts:71` | Dead if store is read directly | [C] |
| 192 | `useListDocked` — testonly | Docked-state hook via composition wrapper | `packages/client/src/state/section-list-projection.ts:48` | Dead if composition is sole consumer | [C] |
| 193 | `__readRecentSteersForTest` — testonly | Test peek | `packages/client/src/state/steer-recovery-store.ts:42` | Dead if store is read directly | [C] |
| 194 | `__resetRecentSteers` — testonly | Test reset | `packages/client/src/state/steer-recovery-store.ts:47` | Dead if only tests reset | [C] |
| 195 | `WEB_GLYPH_COMPACT` — testonly | Geometry constant via factory call | `packages/ui/src/art/web-weave/web-glyph.ts:98` | Dead if factory is sole consumer | [C] |
| 196 | `WAYSTONE_WEATHERS` — testonly | Aliased constant for weather types | `packages/ui/src/charts/meter/waystone-treatment.ts:38` | Dead if prod uses `WEATHER_TYPES` | [C] |
| 197 | `WAYSTONE_SKY_STOPS` — testonly | Aliased constant for sky stops | `packages/ui/src/charts/meter/waystone-treatment.ts:219` | Dead if prod uses `SKY_STOPS` | [C] |
| 198 | `CodeEditor` — testonly | Component consumed by wrapper | `packages/ui/src/code-editor/code-editor.tsx:171` | Dead if composition wraps it | [C] |
| 199 | `ToolbarButton` — testonly | Toolbar item used in page compositions | `packages/ui/src/layout/toolbar.tsx:27` | Dead if pages import via barrel | [C] |
| 200 | `ToolbarSeparator` — testonly | Toolbar separator used in compositions | `packages/ui/src/layout/toolbar.tsx:36` | Dead if pages import via barrel | [C] |
| 201 | `ToolbarGroup` — testonly | Toolbar group used in compositions | `packages/ui/src/layout/toolbar.tsx:49` | Dead if pages import via barrel | [C] |
| 202 | `ToolbarLink` — testonly | Toolbar link used in compositions | `packages/ui/src/layout/toolbar.tsx:62` | Dead if pages import via barrel | [C] |
| 203 | `ToolbarInput` — testonly | Toolbar input used in compositions | `packages/ui/src/layout/toolbar.tsx:76` | Dead if pages import via barrel | [C] |
| 204 | `AccordionHeader` — testonly | Primitive consumed via composition | `packages/ui/src/primitives/accordion/accordion.tsx:36` | Dead if accordion is sole consumer | [C] |
| 205 | `createAlertDialogHandle` — testonly | Handle factory; prod uses ref prop | `packages/ui/src/primitives/alert-dialog/handle.ts:4` | Dead if consumers use the ref | [C] |
| 206 | `ColorSwatch` — testonly | Sub-component mounted standalone in tests | `packages/ui/src/primitives/color-field/color-field.tsx:26` | Dead if `ColorField` composes it | [C] |
| 207 | `createDialogHandle` — testonly | Handle factory; consumers use ref | `packages/ui/src/primitives/dialog/handle.ts:5` | Dead if consumers use the ref | [C] |
| 208 | `DrawerTrigger` — testonly | Composition primitive; tests import parts | `packages/ui/src/primitives/drawer/drawer.tsx:44` | Dead if drawer composes it | [C] |
| 209 | `DrawerDescription` — testonly | Composition primitive | `packages/ui/src/primitives/drawer/drawer.tsx:97` | Dead if drawer composes it | [C] |
| 210 | `DrawerSwipeArea` — testonly | Composition primitive | `packages/ui/src/primitives/drawer/drawer.tsx:115` | Dead if drawer composes it | [C] |
| 211 | `DrawerProvider` — testonly | Composition primitive | `packages/ui/src/primitives/drawer/drawer.tsx:125` | Dead if drawer composes it | [C] |
| 212 | `DrawerIndent` — testonly | Composition primitive | `packages/ui/src/primitives/drawer/drawer.tsx:138` | Dead if drawer composes it | [C] |
| 213 | `DrawerIndentBackground` — testonly | Composition primitive | `packages/ui/src/primitives/drawer/drawer.tsx:151` | Dead if drawer composes it | [C] |
| 214 | `DrawerVirtualKeyboardProvider` — testonly | Composition primitive | `packages/ui/src/primitives/drawer/drawer.tsx:161` | Dead if drawer composes it | [C] |
| 215 | `createDrawerHandle` — testonly | Handle factory | `packages/ui/src/primitives/drawer/handle.ts:4` | Dead if consumers use the ref | [C] |
| 216 | `FieldValidity` — testonly | Validation indicator composed within Field | `packages/ui/src/primitives/field/field.tsx:167` | Dead if Field composes it | [C] |
| 217 | `HighlightedText` — testonly | Text highlighter consumed by wrapper | `packages/ui/src/primitives/highlighted-text/highlighted-text.tsx:75` | Dead if wrapper is sole consumer | [C] |
| 218 | `createMenuHandle` — testonly | Handle factory | `packages/ui/src/primitives/menu/handle.ts:7` | Dead if consumers use the ref | [C] |
| 219 | `MenuViewport` — testonly | Positioned primitive within Menu | `packages/ui/src/primitives/menu/menu.tsx:85` | Dead if Menu composes it | [C] |
| 220 | `MenuArrow` — testonly | Positioned primitive | `packages/ui/src/primitives/menu/menu.tsx:95` | Dead if Menu composes it | [C] |
| 221 | `MenuCheckboxItem` — testonly | Item variant tested standalone | `packages/ui/src/primitives/menu/menu.tsx:149` | Dead if Menu composes it | [C] |
| 222 | `MenuRadioGroup` — testonly | Group variant | `packages/ui/src/primitives/menu/menu.tsx:162` | Dead if Menu composes it | [C] |
| 223 | `MenuRadioItem` — testonly | Item variant | `packages/ui/src/primitives/menu/menu.tsx:174` | Dead if Menu composes it | [C] |
| 224 | `MenuBackdrop` — testonly | Overlay primitive | `packages/ui/src/primitives/menu/menu.tsx:236` | Dead if Menu composes it | [C] |
| 225 | `createPopoverHandle` — testonly | Handle factory | `packages/ui/src/primitives/popover/handle.ts:5` | Dead if consumers use the ref | [C] |
| 226 | `PopoverViewport` — testonly | Positioned primitive | `packages/ui/src/primitives/popover/popover.tsx:78` | Dead if Popover composes it | [C] |
| 227 | `PopoverArrow` — testonly | Positioned primitive | `packages/ui/src/primitives/popover/popover.tsx:87` | Dead if Popover composes it | [C] |
| 228 | `PopoverClose` — testonly | Action primitive | `packages/ui/src/primitives/popover/popover.tsx:92` | Dead if Popover composes it | [C] |
| 229 | `PopoverTitle` — testonly | Title primitive | `packages/ui/src/primitives/popover/popover.tsx:100` | Dead if Popover composes it | [C] |
| 230 | `PopoverDescription` — testonly | Description primitive | `packages/ui/src/primitives/popover/popover.tsx:109` | Dead if Popover composes it | [C] |
| 231 | `RadioGroupItem` — testonly | Item consumed via composition | `packages/ui/src/primitives/radio-group/radio-group.tsx:28` | Dead if RadioGroup composes it | [C] |
| 232 | `RevealGate` — testonly | Gate component via page wrappers | `packages/ui/src/primitives/reveal-gate/reveal-gate.tsx:27` | Dead if pages wrap it | [C] |
| 233 | `StatusChip` — testonly | Chip within status-complex compositions | `packages/ui/src/primitives/status-chip/status-chip.tsx:50` | Dead if composition wraps it | [C] |
| 234 | `Table` — testonly | Table via styled composition | `packages/ui/src/primitives/table/table.tsx:185` | Dead if data-grid wraps it | [C] |
| 235 | `createTooltipHandle` — testonly | Handle factory | `packages/ui/src/primitives/tooltip/handle.ts:5` | Dead if consumers use the ref | [C] |
| 236 | `TooltipViewport` — testonly | Positioned primitive | `packages/ui/src/primitives/tooltip/tooltip.tsx:82` | Dead if Tooltip composes it | [C] |
| 237 | `TooltipArrow` — testonly | Positioned primitive | `packages/ui/src/primitives/tooltip/tooltip.tsx:91` | Dead if Tooltip composes it | [C] |
| 238 | `StreamText` — testonly | Streaming text via composition | `packages/ui/src/stream/stream-text.tsx:32` | Dead if composition wraps it | [C] |
| 239 | `DERIVED_ASSET_COLUMNS` — testonly | Column list asserted in tests; prod joins inline | `packages/server/src/domain/assets/persistence/asset-refs.ts:40` | Dead if join is inline | [C] |
| 240 | `getToolRecurseLimit` — testonly | Extractor for metadata validation in tests | `packages/server/src/domain/chat/contract/metadata.ts:71` | Dead if prod doesn't call it | [C] |
| 241 | `__spanToWirePartForTest` — testonly | Internal alias; prod calls bare function | `packages/server/src/domain/chat/engine/pipeline.ts:952` | Dead if pipeline calls bare function | [C] |
| 242 | `loadPendingTurns` — testonly | Loader consumed by higher-level handler | `packages/server/src/domain/chat/persistence/invites.ts:192` | Dead if invite handler is sole caller | [C] |
| 243 | `parseParticipant` — testonly | Parser consumed by row builders | `packages/server/src/domain/chat/persistence/participant.ts:31` | Dead if row builders are sole callers | [C] |
| 244 | `isPresent` — testonly | Guard used inside participant module | `packages/server/src/domain/chat/persistence/participant.ts:64` | Dead if module is sole caller | [C] |
| 245 | `isBackingUserEnabled` — testonly | Predicate consumed by permission check | `packages/server/src/domain/chat/persistence/participant.ts:79` | Dead if permission is sole caller | [C] |
| 246 | `loadTurnForClassify` — testonly | Query consumed by classifier engine | `packages/server/src/domain/chat/persistence/queries.ts:586` | Dead if classifier is sole caller | [C] |
| 247 | `DEMO_CHAT_NARRATOR_NAME` — testonly | Seeder constant asserted in tests | `packages/server/src/domain/chat/seeder/demo-chats.ts:718` | Dead if seeder uses it inline | [C] |
| 248 | `CHAT_VERB_AUTHORITY` — testonly | Matrix consumed by auth dispatcher | `packages/server/src/domain/chat/substrate/auth/matrix.ts:43` | Dead if dispatcher is sole consumer | [C] |
| 249 | `authorityForSurface` — testonly | Lookup consumed by auth middleware | `packages/server/src/domain/chat/substrate/auth/matrix.ts:186` | Dead if middleware is sole consumer | [C] |
| 250 | `__resetAgentSdkModelCache` — testonly | Test reset | `packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts:40` | Dead if only tests reset | [C] |
| 251 | `__resetOrModelCache` — testonly | Test reset | `packages/server/src/domain/connection/substrate/or-model-cache.ts:42` | Dead if only tests reset | [C] |
| 252 | `seedVllmGenWindow` — testonly | Seeding helper; prod fetches automatically | `packages/server/src/domain/connection/substrate/vllm-gen-window-cache.ts:38` | Dead if cache self-seeds | [C] |
| 253 | `__resetVllmGenWindowCache` — testonly | Test reset | `packages/server/src/domain/connection/substrate/vllm-gen-window-cache.ts:46` | Dead if only tests reset | [C] |
| 254 | `SourceKind` — testonly | Inferred type shadowed by schema | `packages/server/src/domain/embeddings/contract/params.ts:10` | Dead if schema is the sole consumer | [C] |
| 255 | `SOURCE_LENSES` — testonly | Lens array consumed by pipeline builder | `packages/server/src/domain/embeddings/contract/params.ts:13` | Dead if pipeline is sole consumer | [C] |
| 256 | `SourceLens` — testonly | Inferred type | `packages/server/src/domain/embeddings/contract/params.ts:14` | Dead if pipeline is sole consumer | [C] |
| 257 | `PROMPT_TEMPLATES` — testonly | Alias to defaults | `packages/server/src/domain/imagery/substrate/templates.ts:19` | Dead if defaults compose differently | [C] |
| 258 | `CAPTION_INSTRUCTIONS` — testonly | Alias to defaults | `packages/server/src/domain/imagery/substrate/templates.ts:20` | Dead if defaults compose differently | [C] |
| 259 | `findGameById` — testonly | Finder consumed by game orchestration | `packages/server/src/domain/rpg/persistence/games.ts:53` | Dead if orchestrator is sole caller | [C] |
| 260 | `listJournalByVariant` — testonly | List consumed by journal processing | `packages/server/src/domain/rpg/persistence/journal.ts:84` | Dead if processor is sole caller | [C] |
| 261 | `findTurnToolCallsByVariant` — testonly | Finder consumed by tool-call handlers | `packages/server/src/domain/rpg/persistence/turn-tool-calls.ts:55` | Dead if handlers are sole callers | [C] |
| 262 | `RPG_DELTA_HEADING` — testonly | Prose slot consumed by delta renderer | `packages/server/src/domain/rpg/substrate/delta.ts:34` | Dead if renderer is sole consumer | [C] |
| 263 | `RPG_SCENE_OPENS_HEADING` — testonly | Prose slot value | `packages/server/src/domain/rpg/substrate/delta.ts:38` | Dead if renderer is sole consumer | [C] |
| 264 | `RPG_STEERING_LICENSE` — testonly | Reminder prose consumed by builder | `packages/server/src/domain/rpg/substrate/reminder.ts:80` | Dead if builder is sole consumer | [C] |
| 265 | `RPG_DECEPTION_TEACH` — testonly | Reminder prose | `packages/server/src/domain/rpg/substrate/reminder.ts:87` | Dead if builder is sole consumer | [C] |
| 266 | `RPG_OFILTER_TEACH` — testonly | Reminder prose | `packages/server/src/domain/rpg/substrate/reminder.ts:95` | Dead if builder is sole consumer | [C] |
| 267 | `RPG_CYOA_TEACH` — testonly | Reminder prose | `packages/server/src/domain/rpg/substrate/reminder.ts:118` | Dead if builder is sole consumer | [C] |
| 268 | `RPG_CARD_TEACH_STATIC` — testonly | Composed prose string | `packages/server/src/domain/rpg/substrate/reminder.ts:123` | Dead if builder is sole consumer | [C] |
| 269 | `__resetEffectiveConfigCache` — testonly | Test reset | `packages/server/src/domain/settings/effective-config/cache.ts:33` | Dead if only tests reset | [C] |
| 270 | `resetAuditFailureCount` — testonly | Reset for fresh audit cycles in tests | `packages/server/src/foundation/observability/audit.ts:38` | Dead if only tests reset | [C] |
| 271 | `resetWireCaptures` — testonly | Reset for clean capture state | `packages/server/src/foundation/observability/debug/wire-capture.ts:136` | Dead if only tests reset | [C] |
| 272 | `jwksCacheSize` — testonly | Cache inspector; prod monitors via health | `packages/server/src/infra/auth/jwks.ts:206` | Dead if health endpoint reads directly | [C] |
| 273 | `resetJwksCache` — testonly | Cache reset for test isolation | `packages/server/src/infra/auth/jwks.ts:211` | Dead if only tests reset | [C] |
| 274 | `__pinnedAgentForTest` — testonly | Test constructor for pinned agent | `packages/server/src/infra/network/egress.ts:284` | Dead if only tests construct pinned agents | [C] |
| 275 | `boundHostFn` — testonly | Bounding helper for binding correctness | `packages/server/src/infra/plugin-host/sandbox.ts:351` | Dead if sandbox is sole caller | [C] |
| 276 | `buildClaudeAnthEnv` — testonly | Env builder for provider initialization | `packages/server/src/infra/providers/backends/agent-sdk/env.ts:239` | Dead if provider wraps it | [C] |
| 277 | `fetchGenMaxModelLen` — testonly | Fetch consumed by window-calculator | `packages/server/src/infra/providers/vllm/engine/gen-window.ts:47` | Dead if calculator is sole caller | [C] |
| 278 | `__resetWakeGateCache` — testonly | Test reset | `packages/server/src/infra/providers/vllm/engine/wake-gate.ts:171` | Dead if only tests reset | [C] |
| 279 | `applyReplace` — testonly | Regex replacer consumed by service layer | `packages/server/src/kit/regex/index.ts:41` | Dead if service is sole caller | [C] |
| 280 | `createCaller` — testonly | tRPC caller factory for tests | `packages/server/src/transport/trpc/router.ts:100` | Dead if router is sole caller | [C] |
| 281 | `columns` — 16 W-only columns (all timestamps) | `createdAt`/`updatedAt` never read back by any surface | `packages/db/src/schema/` | Safe to kill if no downstream dashboard consumes them | [C] |

Confidence marks: **[V]** verified to the "called on a live path" rung or better ·
**[C]** candidate-lens output, human verdict pending · **[H]** heuristic
(`regkeys`, raw-SQL `raw?` annotations) — read the call sites before acting.

---

## ─── OPEN QUESTIONS ───

Things an agent could not settle, with what would settle them. Not a parking lot
for findings — if it has a receipt it belongs in the table above.

| # | Question | What would answer it | Blocked on |
|---|----------|---------------------|------------|
| 1 | `talkativenessSchema` `@public future` — does D80 still exist? | Check D80 backlog / sprint | Backlog |
| 2 | `PluginInvocation` `@public future` — is PluginHostV1 membrane being built? | Check plugin roadmap | Roadmap |
| 3 | `OwnerStatId` `@public future` — is the owner_stat feature live yet? | Check stats/conversion work | Feature status |
| 4 | `useDeleteRefinerySchema` `@public future` — is R3 schema-delete wiring underway? | Check refinery backlog | R3 scope |
| 5 | `AgentDialogKind` `@public future` — is D60 agent dialog still planned? | Check D60 ticket | D60 status |

---

## ─── KNOWN BLIND SPOTS ───

Stated up front so a clean scan is legible as clean rather than as blindness.

1. **String-keyed dispatch.** A registry is one live symbol however many rows are
   dead. `regkeys` is the only lens that looks, and it is heuristic.
2. **The tRPC proxy.** The client consumes procedures through the typed proxy,
   never an import edge. `unwired` is the only lens that sees it.
3. **Namespace imports err ALIVE.** `import * as ns` marks a module's entire
   export surface consumed. Deliberate — a namespace can be indexed at runtime —
   but it hides rot. `swallowed` is the narrower question.
4. **Mapped types have no declarations.** Drizzle's `$inferSelect`/`$inferInsert`
   synthesise properties with zero declaration nodes, so reference resolution
   cannot see a write. `columns` goes structural for exactly this reason.
5. **Raw SQL is not table-attributable.** A `raw?` annotation means the column's
   SQL name appears in *some* raw template. Read those before calling it rot.
6. **Truncated reads.** See the briefing. This one is ours, not the tooling's.
