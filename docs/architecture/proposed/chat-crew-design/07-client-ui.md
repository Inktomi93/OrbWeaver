---
kind: spec
status: active
updated: 2026-07-03
---

# 07 — Client / UI: How the Crew Surfaces to Users

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** Grounded in a fresh dissection of the marinara CLIENT (its `packages/client/src`;
> cites `(m-client: <path>)` are relative to that root) — the rule for using it: **mine the WHAT
> (which surfaces users actually needed), take almost none of the HOW** (its client is the
> anti-pattern: one ~900-line SSE switch in `hooks/use-generate.ts` fanning events by string,
> `window` CustomEvents as component wiring, console-as-debug-surface, dead unmounted components
> (`AgentThoughtBubbles`/`AgentDebugPanel` defined, never imported), and presentation HTML written
> into canon messages). Quality bar and vocabulary: rpg-design/11.

---

## 0. What the marinara client proves users need (the mined WHAT)

The verified surface inventory, one line each, with the orbweaver verdict:

1. **A single per-chat agent activity/status/retry hub** — the "Agents menu" popover
   (m-client: `components/chat/RoleplayHUDActionsMenu.tsx`): activity feed of per-agent one-line
   summaries, an "agents thinking" pulse, a persistent amber **failed-agents list with a
   one-click "Retry Failed Agents (n)"**. → KEEP the need (one place to see crew state + retry);
   our hub is the crew panel (§3), not a popover feed.
2. **Per-type bespoke result homes** — cyoa cards under the message, trackers in a docked
   sidebar, images as attachments, music in players, card diffs in a modal. The
   destination-per-type principle is RIGHT (no generic "agent output console"). → KEEP the
   principle; our per-member homes are §4.
3. **Write-approval surfaces work** — `CharacterCardUpdateModal` (m-client:
   `components/modals/CharacterCardUpdateModal.tsx`) is a genuine per-field diff review: Before
   (red) → After (editable, green), a **"stale" badge when the field changed since the audit**,
   a `reason` line, Approve/Reject/Regenerate. `AgentWriteApprovalModal` does the same for
   lorebook/summary writes with an editable textarea + a "(n more queued)" queue. → STEAL the
   SHAPE wholesale for card evolution (§4.2) — it independently invented our stale-hash guard.
4. **In-place rewrite needs an escape hatch** — prose-guardian **visibly replaced the message
   text** and users needed the `Shield` "Restore original before rewrite" button (m-client:
   `ChatMessage.tsx:2286`, off persisted `extra.proseGuardianOriginalText`). → Our propose-first
   flow makes the silent-replace problem structural-impossible, and we keep the lesson: accept
   stamps the original so ONE revert exists (§4.3).
5. **The director's secret state wants a spoiler-gated inspect surface** —
   `SecretPlotPanel` in the chat settings drawer: content hidden behind a "Reveal spoilers"
   toggle, editable, with Regenerate (m-client: `components/agents/SecretPlotPanel.tsx`). → STEAL
   the reveal-gate + regenerate; ours is host-only by server projection first (§4.4).
6. **Failure wants classification + retry, not raw errors** — `lib/agent-failures.ts` maps error
   strings to reason labels ("Context limit", "Rate limit", …) and every failure path lands on a
   toast + the retry hub. → KEEP (ours rides the workload-failure vocabulary, §6).
7. **Persisted artifacts must re-hydrate** — cyoa choices, rewrite originals, context injections
   persist on `message.extra` and re-render on reload; thought bubbles/debug were store-only and
   vanish. → KEEP the rule, made total: EVERY crew artifact is a DB row; nothing user-facing is
   store-only (§7).
8. **What users did NOT get and we must not rebuild:** a mid-turn modal that PAUSES generation
   for injection review (m-client: `AgentInjectionReviewModal` in `ChatArea.tsx` — the main reply
   literally waits for the user to approve pre-gen injections; the D53-spirit violation in UI
   form); per-agent phase/connection/capability mega-editors (`AgentEditor.tsx`, 3,726 lines) —
   needed only because agents were user-authored freeform; ours are fixed members + guide
   templates.

## 1. Feature-slice home — `features/crew/`, composed through chat's registries

**DECISION:** `packages/client/src/features/crew/` as a standard flat slice, mounted through the
SAME registry-slot discipline rpg established (rpg-design/11 §1 — registries wired at `main.tsx`;
`features/crew` never imports `features/chat`, gate `client-features-no-cross`):

```
packages/client/src/features/crew/
  surfaces/     crew-panel.tsx (CONTEXT section: members + guides + status) · director-drawer.tsx ·
                card-evolution-review.tsx (character-page section) · guides-panel.tsx (a crew-panel tab)
  components/   member-toggle-row.tsx · proposal-diff.tsx (shared Before/After renderer) ·
                edit-proposal-chip.tsx · guide-row.tsx · run-status-chip.tsx
  hooks/        use-crew-config.ts (the gate) · use-crew-stream.ts (SSE→invalidate) · use-crew-mutations.ts
  index.ts
```

> **[BUILT-TRUTH 2026-07-16 — the chat seams EXIST (lockdown M8); do NOT rebuild them.]** The real
> names: the context-tab seam is the `chat-context` `ContributorRegistry<ContextTabDef<ChatContextState>>`
> and the surface seam is `CHAT_SURFACE_ANCHORS` (`thread-flank` · `above-composer` · `message-footer`)
> with `ChatSurfaceContribution` (discriminated by anchor; `message-footer` carries
> `ChatMessageSurfaceState { message: MessageView }`) — both assembled empty at the door with
> fake-contributor CTs. U5's "registry addition" therefore SHRINKS to the chip itself; verify at CW5
> that `MessageView` covers the `{chatId, messageId, variantId}` need and extend the state ADDITIVELY
> if not. The `character` detail-page section seam does NOT exist yet — tracked in
> `../derive-modernization-audit.md` §Seam-coverage (build M8-style, empty + CT, at the north-star §6
> characters stop or crew CW3, whichever lands first).

| Registry (chat-owned, populated at `main.tsx`) | crew contribution |
|---|---|
| the `chat-context` contributor registry (M8-built, empty) | the crew panel (tabs: **Members** · **Guides** · **Director** [host]) |
| the `chat-surface` contributor registry, anchor `message-footer` (M8-built, empty) | the edit-proposal chip + the on-demand "audit this reply" action; the anchor is the ONE client-side chat touch (mirrors the server's one-injected-op discipline; rpg's chips rode `TOOL_RENDERERS` because its events ARE tool calls — crew proposals are not, so they need a message-anchored slot) |
| `character` feature's detail-page section slot (same registry pattern, owned by the character feature — **UNBUILT, see note above**) | the card-evolution review section |

Gating: every slot component gates on `useGatedQuery(trpc.crew.getConfig, chatId)` — server
returns the clamped view; no row / all-off ⇒ render nothing, `use-crew-stream` never subscribes
(the rpg `use-rpg-game` gate pattern; the truth source is the same query the panel needs anyway).
A crew-less chat mounts ZERO crew UI except the host's "Enable crew…" line in the CONTEXT panel's
default state.

## 2. Run-time visibility — deliberately QUIET during turns

**DECISION: the crew adds NO mid-turn indicators.** Nothing crew-ish runs inside a turn (the
director's injection is a column read; everything else is post-turn) — so marinara's
"Running agents…" phase pill and thinking-pulse have no referent here and are NOT ported.
Crew activity surfaces exactly two ways:

- **Per-member status chips in the crew panel** (Members tab): last run (relative time), outcome
  (`succeeded` summary counts from `ResultByKind` — "keeper: +3 entries" — via `workloads.get` +
  the crew bus), `running` spinner while a workload row is active, `failed` state (§6). This is
  marinara's activity feed + failed list, merged into the config surface instead of a popover.
  *(Rejected: a thought-bubble feed — per-run emoji one-liners are chrome that trains ignoring;
  the status chip + the artifact itself (entry/proposal) carry the same information durably.)*
- **The artifact arriving** — a proposal chip appearing under a message, the card-review badge,
  the guides panel content updating — driven by `use-crew-stream` invalidations. Toasts are
  reserved for FAILURES and for `runNow` completions the user explicitly asked for.

## 3. The crew panel (CONTEXT tab) — config + status, one surface

Normative sketch (04 §8, now full): **Members tab** — one row per member: toggle (host;
members see read-only state), the member's 1–2 knobs inline (keeper: book picker + span; director:
cadence + the `steer` textarea; audit: mode radio **with the plain-text cost sentence** on
`every-turn`; card-evolution: span), a `runNow` button (host), and the status chip (§2).
**Guides tab** — doc 06's management UX: guide rows (name · auto toggle · depth/role in an
expandable "advanced" line · refresh button with inline spinner that reveals the fresh content ·
content preview collapsible · edit template/content · flush), "Add guide" (packaged template
picker + custom). **Director tab** (renders iff `getPlotState` resolves — server-projected,
D22 discipline): §4.4. *(Rejected: a global agents library page à la marinara's `AgentsPanel` —
marinara needed one because agents were user-authored/draggable/folder-organized config objects;
crew members are five fixed capabilities and guide templates are per-chat rows. A library page
would be empty ceremony. Revisit only if user-authored members ever exist — that is the D46
plugin era's question.)*

## 4. Result + review surfaces, per member

### 4.1 Keeper — the artifact IS the lorebook

No modal, no review flow (03 §1 argues direct-write). Visibility: the status chip
("+3 entries · 1 updated") + a "view book" link opening the NORMAL world-info editor on the
keeper book — curation happens where lore already lives. *(Rejected: marinara's
`AgentWriteApprovalModal` flow for lorebook writes — its approval-before-write existed because
entries were uncapped, unlabeled, and unattributed; ours are capped, span-stamped, hand-edit-safe,
and one click from deletion in an editor that already exists.)*

### 4.2 Card evolution — the review section (STEAL the CharacterCardUpdateModal shape)

On the character detail page (+ the notification deep-link): pending proposals as cards — per
change: field name, **Before** (current card text, danger-tinted) → **After** (proposed,
success-tinted), the `rationale` line, a per-change checkbox (03 §2 per-change accept); footer:
"A snapshot is taken before applying" + **Accept selected / Dismiss / Re-audit** (re-audit =
`runNow('crew-card-evolution')` — marinara's Regenerate). The STALE state renders as a badge with
accept disabled (the server refuses anyway; the badge explains). Intent tokens, never raw color.

### 4.3 Prose audit — the diff chip (propose-first replaces silent-rewrite + restore)

The `message-footer` slot renders: the on-demand **"Audit this reply"** action (when
`proseAudit.enabled`, mode any — enqueues, chip shows pending spinner, `auditClean` renders a
transient "clean ✓"), and for a pending proposal the **"✎ proposed edit" chip** → expanding to a
Before/After diff (the shared `proposal-diff.tsx`) + the `notes` chips (`prose`/`continuity`
kinds as labeled pills) + **Apply / Dismiss** (Apply = `acceptEditProposal`; authority follows
chat's edit rule — the chip renders read-only for participants who can't). **After apply, ONE
revert affordance** appears on the chip ("restore original") for the session of record — backed
by `crew_edit_proposals.originalContent`, stamped at accept (the marinara restore-original lesson,
02 §4 schema). *(Rejected: marinara's auto-apply + typewriter re-type of the rewritten message —
the exact dispose-without-propose the design forbids; rejected: a modal review queue — proposals
belong ON the message they amend.)*

### 4.4 Director — the drawer (STEAL the spoiler gate)

Host-only tab (server-projected): the arc + twist bank + retired list rendered **behind a
"Reveal" click** even for the host (marinara's `SecretPlotPanel` reveal toggle — the host opening
the panel on a shared screen shouldn't flash the twist bank), the `steer` textarea (it lives in
config but renders here too — it is the director's conversation with the host), `lastPassSeq`
freshness line, and **Re-run director now** (`runNow`) + `resetPlot` (confirm-guarded).
*(Rejected: editable arc text à la marinara — hand-editing the model's hidden state invites
incoherent successor passes; the `steer` field IS the sanctioned influence channel. Criterion to
revisit: hosts repeatedly resetting just to rephrase the arc.)*

### 4.5 Guides — §3's Guides tab (doc 06 §4 is normative for the verbs it drives)

The refresh button is the interactive path (verb awaits, content reveals inline — seconds, the
buddy-ask feel). Members see the tab read-only (guides are room-visible, doc 06 §5).

## 5. Config UX summary

Per-chat only, in the crew panel — there is no global settings page for the crew (02 §6's
no-App/UserSettings decision, mirrored). The panel is the single place a user learns the crew
exists: default state (host, nothing enabled) renders the five capabilities as an explanatory
list with toggles, not an empty pane.

## 6. Failure display — the standard workload vocabulary + panel chips

Member run failures = the **standard workload-failure toast + retry** (the rpg-design/11 §11
affordance — same toast every workload already has) AND the member's status chip flips to
`failed` with an inline **Retry** (persistent — marinara's failed-agents list, relocated into the
panel so it survives popover dismissal). `runNow` failures toast immediately (the user is
watching). Guide refresh failures: inline error state on the refresh button (manual) / the
stale-timestamp hint (auto — doc 06 §3). Error copy comes from the workload error row, not a
client-side string classifier *(rejected: marinara's `agent-failures.ts` string-matching
classifier — orbweaver's workload errors are already typed at the source)*.

## 7. Persistence rule + state ownership

**Every user-facing crew artifact is a DB row** (proposals, plots, guides, workload rows,
notifications) — reload re-hydrates everything via Query; `use-crew-stream` only invalidates.
The ONLY Zustand state is view-local (panel tab, reveal toggle, expanded chips). *(Rejected:
marinara's split-brain store — capped ephemeral `thoughtBubbles`/`failedAgentTypes` arrays that
vanish on reload while the artifacts they announced persist.)*

## 8. Build chunks (feeds 08 §CW7) + component tests

- **U1 (S):** crew panel Members tab + status chips + gating (needs CW1).
- **U2 (S):** keeper affordances (view-book link, chip counts) (CW2).
- **U3 (M):** card-evolution review section + notification deep-link (CW3).
- **U4 (S):** director drawer + reveal gate (CW4).
- **U5 (M):** message-footer slot region (the chat-side registry addition) + proposal chip +
  diff + apply/revert (CW5).
- **U6 (M):** guides tab (rows, refresh-inline, template editor, packaged picker) (CW6).

Component tests (Playwright CT, the rpg-design/11 §13 pattern): the panel renders nothing for a
crew-less chat; host vs member projections (toggle disabled, director tab absent, guides
read-only); proposal chip states (pending/stale/superseded/applied+revert); card review per-change
selection; reveal-gate default-hidden; failure chip retry wiring.
