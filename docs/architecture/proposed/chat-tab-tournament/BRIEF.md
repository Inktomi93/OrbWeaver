# Chat Tab Design Tournament — shared brief

Three designer agents each produce a competing redesign proposal for the Orbweaver **Chat tab**
(the List | Content | Context tri-region experience: chat list, the room itself, and the context
panel). One adversarial reviewer then attacks all three; each designer gets ONE revision round;
the orchestrator + owner pick a winner, which becomes the FINAL candidate for a cold-read build
doc.

You are one of the three designers. Your assigned direction is in your dispatch prompt. This file
is the shared law — every contestant reads the same brief.

## 1. Required reading — IN FULL, before you design anything

House law (read fully, not skimmed — you are an amnesiac agent and these docs are your judgment):

1. `docs/architecture/core/AGENTS.md` — the constitution. Non-negotiable doctrine + domain map.
2. `docs/Mission.md` — why the product exists and who it serves.
3. `docs/architecture/core/UI-Architecture-and-Layout.md` — shell regions, surface registry, layout law.
4. `docs/architecture/core/UI-Theming-and-Content.md` — theming axes (user prefs, not your decisions), content rendering.
5. `docs/architecture/core/UI-Primitives-and-Reuse.md` — the @orb/ui primitive set you must compose from.
6. `docs/architecture/core/UI-Gates-and-Lessons.md` — enforced UI gates + hard-won lessons.

Terrain (read fully — this is the map of what EXISTS):

7. `FINAL-Chats-Landing-Room-and-Context-UX.md` (repo root) — the as-built chat lane: commit
   model, region specs, the FULL server verb inventory (including transport-dark verbs that are
   built on services but not yet exposed on the router), multi-human law, the FIX/CREATE ledger,
   and the registries (CHAT\_SURFACE\_SLOTS, CHAT\_CONTEXT\_SLOTS, TOOL\_RENDERERS).
8. `FINAL-Character-Library-and-Editor-UX.md` (repo root) — the shipped character lane your design
   must harmonize with, and the exemplar of the detail bar your pitch is aiming at.
9. `docs/architecture/proposed/README.md` — the dispatch board. Then skim the design sets in the
   wings so your design leaves seams for them (do not design them, but do not paint over them):
   `chat-crew-design/`, `automation-design/`, `tool-use-design/`, `hub-browse-design/`,
   `expressions-design/`, `databank-design/`, `rpg-design/`, `agent-principal-design/`,
   `saved-rosters-design.md`, `buddy-observer-reaction-engine.md`.

## 2. Investigate the current Chat tab — code is the doc

Read the actual implementation. Per-domain prose docs were gutted; file headers + code are the law.

- Client: `packages/client/src/features/chat/**` (surfaces, components, lib),
  `packages/client/src/features/app-shell/**` (shell + regions), `packages/client/src/state/**`
  (stores relevant to chat), routes in `packages/client/src/routes/`.
- Server verbs: `packages/server/src/domain/chat/**` and the tRPC routers under
  `packages/server/src/transport/` — but FINAL-Chats §verb-inventory already catalogs these;
  verify what you rely on rather than re-deriving everything.
- **Tooling law:** use ast-grep for code existence/usage sweeps (`sg -p '<pattern>'`, v0.44
  installed) — not text grep. Text grep is for docs/strings; if you must grep code, use
  `/usr/bin/grep -a` (the wrapped ugrep skips some .ts files as binary and false-negatives).
- Baseline caveat: this worktree is the committed baseline. A visual-polish arc on chat client
  files is in flight in another lane — treat current pixel styling as NOT final; design intent,
  not current CSS.

## 3. Reference material — inspiration mines, not specs

You can and SHOULD poke around these for interaction ideas, information architecture, and
features worth stealing or deliberately rejecting:

- SillyTavern: `/home/inktomi/inktomi-stack/SillyTavern` (also a copy at
  `/home/inktomi/inktomi-stack/development/neo-tavern/references/sillytavern`)
- marinara-engine: `/home/inktomi/inktomi-stack/development/neo-tavern/references/marinara-engine`
- neo-tavern (the predecessor app): `/home/inktomi/inktomi-stack/development/neo-tavern`

Warnings that are LAW: reference mockups are LOOK references with known IA bugs — mine visuals
and interactions only; Orbweaver docs win every conflict. If you encounter a doc named
`discord-ux-recon.md` anywhere, it is UNRELIABLE (built against the wrong reference) — do not
cite it.

## 4. Hard constraints

- **Client-first redesign, but server asks are WELCOME when they serve the product goal.** The
  server verb inventory in FINAL-Chats is your toolbox; existing verbs (including transport-dark
  ones — exposing those is a cheap, already-sanctioned FIX wave) keep you cheap. But the owner's
  stated goal is **dual-device compatibility and multi-human group-chat compatibility** — designs
  that lean into the multi-device user bus and the built multi-human room system are REWARDED,
  and new server behavior that genuinely serves those two goals is a feature of your pitch, not a
  cost. Frivolous server asks (new verbs for things existing verbs already do) are still charged
  against you. List everything in "Server asks" with a cost guess either way.
- **House law binds.** One-directional flow, @orb/ui primitives (`tv` from `#lib`), theming axes
  are user settings, the a11y bar in UI-Gates-and-Lessons, the D-ledger
  (`docs/architecture/core/Core-Laws-and-Precedents.md` + path registries) wins conflicts. If
  your design genuinely needs a law amendment, NAME the ruling and propose the amendment in a
  "Law-amendment asks" section — silent violation disqualifies the pitch.
- **Commit-model honesty.** FINAL-Chats §2 documents the commit model (immediate/autosave verbs,
  draft-config carried atomically into startChat). Your flows must state what is saved when.
- **Multi-human is first-class**, not bolted on (D16/D18 heritage): rooms, invites, host
  authority, notifications. Your design must show where multi-human lives, even if your direction
  de-emphasizes it.
- **Leave seams** for the in-the-wings sets (§1 item 9). A pitch that paints over crew/automation/
  tool-use/expressions with no place for them to land loses points.

### 4b. Owner steers (added mid-tournament — binding on the revision round)

- **Fork is a PER-MESSAGE action**, not a general steering verb — it anchors to a specific
  message. A broader *checkpoint system* is an open idea the owner is lukewarm-curious about; you
  may pitch one, but do not conflate it with the existing per-message fork.
- **Roster-size progressive disclosure.** Several controls are only valid when the roster has
  more than one member (arbitration/talkativeness, group ordering, per-member mute, etc.). The UI
  must REVEAL group controls as the roster grows and hide them for solo chats — a solo chat
  showing group machinery is a defect. Study group controls in the references: **neo-tavern's
  group controls are the more accurate reference; SillyTavern's are secondary.**
- **Dual-device + multi-human are the product goal** (see the amended constraint above). A pitch
  that treats multi-human as a compliance checkbox under-serves the brief; a pitch that makes
  same-user-on-two-devices and multiple-humans-in-one-room feel first-class over-delivers.
- **Dual-device means LIVE VIEW, not handoff.** If the same chat is open on two of the user's
  devices, BOTH render live state simultaneously (streams, sends, edits — bus-driven), full stop.
  neo-tavern did exactly this and it worked. Do NOT design "pick up where you left off" /
  "continue on this device" handoff ceremonies — the continuity IS the bus. Design work in this
  zone = making simultaneous liveness visible and conflict-free (e.g. composer state, scroll
  independence), not transfer flows.

## 5. Deliverable — your pitch document

Write to `docs/architecture/proposed/chat-tab-tournament/pitch-<yourname>.md`. Structure:

1. **Vision** — one page max: the experience thesis, who it serves, why it beats the current tab.
2. **The composed screen(s)** — region-by-region: what is in LIST, CONTENT, CONTEXT (and any
   region you add/remove/merge — justify against UI-Architecture law). Describe composition,
   density, and hierarchy in words precise enough to build from.
3. **Guided interactions** — the flagship interaction patterns (onboarding into a chat, creating,
   steering a conversation, whatever your direction makes central). Step-by-step.
4. **Flows** — first-run/empty state, create-chat, in-room messaging (send/regen/edit/branch),
   multi-human (invite→join→host actions), context-panel work. Each flow: numbered steps with
   what the user sees and what verb fires.
5. **Click economy** — table of the top \~10 tasks: clicks today (from FINAL-Chats §click-economy)
   vs clicks in your design.
6. **Kept vs replaced** — inventory of current UI you keep, restyle, or delete. Be honest about
   demolition cost.
7. **Server asks** — new verbs/fields needed beyond the existing inventory (may be empty).
8. **Law-amendment asks** — D-ledger/UI-law changes needed (may be empty).
9. **Seams** — one line each: where crew, automation, tool-use, expressions, rpg, hub, databank,
   buddy-observer would land in your design.
10. **Risks & open questions** — what you're least sure of; what an adversary will attack.

Write it as a pitch — sell the vision — but every claim about existing code/verbs must be TRUE
(cite file paths or FINAL-Chats sections). The adversarial reviewer will check.

## 6. Process reminders

- You get ONE revision round after adversarial review. Bank your best ideas now; do not sandbag.
- Do not modify ANY file outside `docs/architecture/proposed/chat-tab-tournament/`. Read
  everything, write only your pitch.
- Do not run the test/gate suites; this is a design exercise.
- Your final agent message should be a short summary (the pitch file is the deliverable).
