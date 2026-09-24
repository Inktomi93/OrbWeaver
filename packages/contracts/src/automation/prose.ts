// @orb/contracts/automation — the automation prose slot table (PROSE-1 §4.1, census row 91 + the S5
// analysis clauses, C1). Two slot families:
//   • `automation.autobg.*` — the `set_chat_background` (BG-F) quiet pick: a SYSTEM contract + a lead
//     INSTRUCTION + a trailing REPLY CONTRACT around three interpolated blocks (the capped scene, the
//     candidate names, the rendered guidance). The interpolations are the prompt's grammar + data — the
//     authored clauses are its voice, each a first-class `text` slot with no §4.5 template machinery.
//   • `automation.analysis.*` — the `run_analysis` (S5) system contract, ONE CLAUSE PER OUTPUT ROUTE:
//     the executor composes exactly the clauses whose routes the arm authored (the enforced response
//     schema omits the other fields, and these slots omit the other asks — schema and prompt move
//     together). The defaults are authored FRESH from the legacy crew director's proven semantics
//     (narrator-not-players · optional-scaffolding/soft-tensions · retire-on-payoff ·
//     empty-is-the-common-case · when-in-doubt-do-less), never string-ported. `requiredTokens` name the
//     WIRE FIELDS a clause teaches (`guidance`, `arcStatus`, `score`) — an override that drops one stops
//     matching the enforced schema the model must fill, so the editor warns.
//
// HOME = per-USER, resolved against the ROOM HOST (owner ruling on PROSE-1 owner-decision 8, option (a)) —
// both arms fire on a room's turn, so they read the same host prose the room's other side generations do.
// The one exception is `automation.guidance.frame`: it wraps the guidance on the chat turn itself, where the
// turn preset's prose is in scope, so it is per-PRESET like the other turn-wire frames.
// MACRO MODE = "none": both run over transcript excerpts, not a character context.
//
// The slot SHAPE comes from `#prose-slot`, never `#prose` (a `#prose` import here closes a `no-circular`
// cycle — `#prose` imports this table to compose `PROSE_SLOTS`).

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

export const AUTOMATION_PROSE_SLOTS = {
  "automation.autobg.task": {
    id: "automation.autobg.task",
    home: "user",
    version: 1,
    text: "Choose the single background that best fits the current scene.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Background pick — task",
    fires: "Heads the `/autobg` quiet pick, above the scene excerpt and the candidate names.",
  },
  "automation.autobg.reply": {
    id: "automation.autobg.reply",
    home: "user",
    version: 1,
    // The reply contract is what makes the returned text MATCHABLE against a candidate name. A host who
    // loosens it gets a chattier reply the name-match may miss — the arm then no-ops, never guesses.
    text: "Reply with ONLY the exact name of the chosen background, nothing else.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Background pick — reply contract",
    fires: "Closes the `/autobg` quiet pick — the contract the name-match depends on.",
  },
  "automation.autobg.system": {
    id: "automation.autobg.system",
    home: "user",
    version: 1,
    // The SYSTEM half of the same contract the reply slot closes — loosening it invites prose the
    // name-match cannot use (the arm then no-ops, never guesses).
    text: "You choose the single best-matching background for a scene. Reply with ONLY the exact background name from the provided list, nothing else.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Background pick — system",
    fires: "The `/autobg` quiet pick's system slot.",
  },
  "automation.analysis.lead": {
    id: "automation.analysis.lead",
    home: "user",
    version: 1,
    text:
      "You are a quiet story analyst for a roleplay room. You never speak in the story and never post messages — " +
      "your only output is one JSON object of private pacing state. You maintain a private story ARC (the ongoing " +
      "tension the scene is bending toward) and a small TWIST BANK (planned beats: a revelation, a clue, a false " +
      "explanation, a reveal trigger, a fallout). Twists stay unfired until the story earns them. This is OPTIONAL " +
      "pacing scaffolding: if the story is meant to stay chill, domestic, or low-pressure, keep soft ongoing " +
      "tensions instead of a rushing plotline. Retire a twist once it has paid off on-screen; add one when new " +
      "pressure appears; never resurrect a retired twist.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Story analysis — the analyst",
    fires: "Heads every `run_analysis` pass — who the analyst is and what the arc/twist scaffolding means.",
  },
  "automation.analysis.arc": {
    id: "automation.analysis.arc",
    home: "user",
    version: 1,
    text:
      'Set arcStatus to "completed" and provide successorArc ONLY when the current arc has fully resolved ' +
      'on-screen and a new one should begin; otherwise keep "active" and either refresh the arc via updatedArc or ' +
      "leave it null to carry the current arc forward.",
    macros: "none",
    requiredMacros: [],
    // The wire fields this clause teaches — the enforced response schema requires them, so an override
    // that drops one teaches a contract the model cannot follow.
    requiredTokens: ["arcStatus", "successorArc", "updatedArc"],
    title: "Story analysis — arc turnover",
    fires: "Every `run_analysis` pass — when the arc completes vs refreshes vs carries.",
  },
  "automation.analysis.steer": {
    id: "automation.analysis.steer",
    home: "user",
    version: 1,
    text:
      "Write guidance: ONE concrete instruction the narrator can act on next turn — plant, foreshadow, or " +
      "complicate. Guidance steers the NARRATOR's choices, never the players': never script what any human " +
      "character says or does next. When nothing needs steering, return an empty string — that is the common case.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: ["guidance"],
    title: "Story analysis — the guidance ask",
    fires: "A `run_analysis` pass whose arm enables the steer route.",
  },
  "automation.analysis.lore": {
    id: "automation.analysis.lore",
    home: "user",
    version: 1,
    text:
      "Distill the SETTLED section of the transcript into at most a few durable, keyed lore entries — established " +
      "on-screen facts only, never secrets that have not appeared, never speculation. Give each a short stable key. " +
      "Return an empty list when nothing settled is worth keeping — that is the common case.",
    macros: "none",
    requiredMacros: [],
    // "SETTLED" is the user prompt's section label — the clause and the transcript label must keep naming
    // the same thing.
    requiredTokens: ["SETTLED"],
    title: "Story analysis — the lore ask",
    fires: "A `run_analysis` pass whose arm enables the lore route and whose settled span is non-empty.",
  },
  "automation.analysis.suggest": {
    id: "automation.analysis.suggest",
    home: "user",
    version: 1,
    text: "You may offer at most ONE optional suggestion for a turn the host could ask for, phrased as a narrator instruction. Most passes should offer none.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Story analysis — the suggestion ask",
    fires: "A `run_analysis` pass whose arm enables the suggest route.",
  },
  "automation.analysis.rewrite": {
    id: "automation.analysis.rewrite",
    home: "user",
    version: 1,
    // The legacy prose-audit's proven posture, authored fresh: CLEAN is the common verdict, the rewrite is
    // CONSERVATIVE (fix the flaw, keep the voice and every story fact), and "when in doubt, clean" — a pass
    // that invents a complaint costs the host a card and teaches them to stop reading the cards.
    text:
      "Audit the AUDITED REPLY below for prose flaws only — contradictions with what the transcript established, " +
      "speaking or acting for a human's character, broken point-of-view or tense, or a line that repeats itself. " +
      'Set rewrite.verdict to "clean" and leave rewrite.text empty unless a real flaw is present; clean is the ' +
      'common verdict. When it is "flawed", name the flaw in one short phrase as rewrite.issue and put the FULL ' +
      "corrected reply in rewrite.text — a conservative repair that keeps the original voice, length and every " +
      "story fact, changing only what the flaw requires. Never continue the scene and never add new events.",
    macros: "none",
    requiredMacros: [],
    // The wire fields this clause teaches + the user-prompt section label it points at — an override that
    // drops one teaches a contract the enforced schema cannot be filled against.
    requiredTokens: ["rewrite.verdict", "rewrite.text", "AUDITED REPLY"],
    title: "Story analysis — the prose audit",
    fires: "A `run_analysis` pass whose arm enables the rewrite route and whose chat has an auditable reply.",
  },
  "automation.analysis.vars": {
    id: "automation.analysis.vars",
    home: "user",
    version: 1,
    // The 0..10 range is `ANALYSIS_SCORE_MAX`'s (contracts/automation) — the applier CLAMPS to that bound
    // regardless of what an override teaches, so a drifted override degrades the model's aim, never the wall.
    text: "Score the current narrative tension as score, an integer from 0 (fully at rest) to 10 (peak crisis).",
    macros: "none",
    requiredMacros: [],
    requiredTokens: ["score"],
    title: "Story analysis — the tension score",
    fires: "A `run_analysis` pass whose arm enables the vars route (the needle's host-opt-in publication).",
  },
  "automation.analysis.close": {
    id: "automation.analysis.close",
    home: "user",
    version: 1,
    text: "Obey the host's standing direction when one is given. When in doubt, do less.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Story analysis — the closing posture",
    fires: "Closes every `run_analysis` system contract — the when-in-doubt-do-less law.",
  },
  "automation.analysis.firstArc": {
    id: "automation.analysis.firstArc",
    home: "user",
    version: 1,
    text: "No arc yet — invent the first private arc from the play below.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Story analysis — the cold start",
    fires: "A `run_analysis` pass over a rule whose state row has no arc yet (the first pass).",
  },
  "automation.guidance.frame": {
    id: "automation.guidance.frame",
    home: "preset",
    version: 1,
    // The one delimiter around the model-authored standing guidance. On a model that folds a system note into
    // user text the guidance lands in a player's message, so it must never read as their words (owner ruling).
    // The token is spliced, never macro-rendered: the guidance bytes ride inside verbatim.
    text: "[Story direction for your reply — not part of anyone's message:\n\n{{guidance}}\n]",
    macros: "none",
    requiredMacros: ["{{guidance}}"],
    requiredTokens: [],
    title: "Story-direction frame",
    fires: "Every turn a story-analysis rule has standing guidance — wraps that guidance.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;
