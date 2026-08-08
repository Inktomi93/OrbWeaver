// @orb/contracts/rpg/prose — the rpg prose slot table (PROSE-1 §4.1, census rows 1-10 — the steering
// REMINDER seam). The ONE home for the BYTES of every steering-reminder teach and delta heading the lite
// substrate injects: `domain/rpg/substrate/reminder.ts` + `delta.ts` DERIVE their exported constants from
// these rows (`RPG_STEERING_LICENSE = PROSE_SLOTS["rpg.reminder.steeringLicense"].text`), so a default is
// authored exactly once and the reminder can never disagree with what the registry ships.
//
// The slot SHAPE comes from `#prose-slot`, never `#prose`: `#prose` imports this table at runtime to compose
// `PROSE_SLOTS`, so importing it here — even for a type — would close a `no-circular` cycle (the split's whole
// reason; see `#prose-slot`'s header).
//
// STORAGE: the PRESET's `promptConfig.prose` (owner ruling 2026-08-08, "we are putting everything in presets" —
// the standing per-PRESET home already recorded at `domain/chat/assembly/injections.ts`). These slots homed on
// `rpg_games.config.prose` for exactly one merge (`fa8f944a0`); that spine — the config field, the
// `updateConfig.patch.prose` write arm, the fork strip arm — is DELETED, and `home:"preset"` is what routes each
// row into `PRESET_PROSE_SLOT_IDS`, its Templates-tab row, and `composeProse`'s preset source. The host edits
// them in the preset Templates tab; a GAME turn assembles the game's `gmPresetId` (the preset REDIRECT in
// `chat/verbs/turn.ts`), so "this table's own teach copy" is authored on that table's GM preset.
//
// The reminder still resolves each slot against `LiteReminderInput.prose` and the delta against
// `DeltaContext.prose` — the builders' signatures never knew where the overrides came from; only chat's gather
// args changed. An ABSENT override is byte-identical to the pre-PROSE-1 constant, which is the whole safety
// story for this migration (asserted per-slot in `tests/contracts/prose/`).
//
// MACRO MODE (§6.1): the TEACHES are `names-only` — the reminder resolves a host override's `{{user}}`/`{{char}}`
// through the same identity-only registry `renderSteeringNote` uses (a default carries no macro, so it resolves
// byte-identically). The two DELTA HEADINGS are `none`: a diff heading has no character context to substitute,
// so its bytes ship verbatim (owner decision 5 ruled them prose/voice, in scope — the STRUCTURAL labels of
// §2.11 stay out and below the gate's word threshold).

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

/** The game-turn steering-reminder prose (census 1-10). Keys ARE the slot ids; `satisfies Partial<Record<…>>`
 *  so an unlisted id fails `tsc`, and `#prose` annotates the composed `PROSE_SLOTS` so a missing row fails too. */
export const RPG_PROSE_SLOTS = {
  "rpg.reminder.steeringLicense": {
    id: "rpg.reminder.steeringLicense",
    home: "preset",
    version: 1,
    text: "These tracked values are live state for THIS story — let them visibly shape behaviour, dialogue, and the scene as you narrate. When a value changes, let the change land in the fiction. Never recite the raw numbers back at the player; weave them into the prose.",
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [],
    title: "Steering license",
    fires: "Every game turn — the reminder tail that licenses the tracked values to shape the fiction.",
  },
  "rpg.reminder.deceptionTeach": {
    id: "rpg.reminder.deceptionTeach",
    home: "preset",
    version: 1,
    text: 'DECEPTION: a character may deceive the player. When a character states something they know to be false, emit — on its own, right after the spoken lie — a self-closing tag recording the truth: <lie character="who is lying" type="the kind of lie" truth="what is actually true" reason="why they lie" />. This tag is INVISIBLE to the player but you REMEMBER it, so keep the deception consistent and let it have consequences later. Never reveal the truth in your prose or narration — only in the tag.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: ["<lie"],
    title: "Deception teach",
    fires: "Every game turn, only when `features.deception` is on — teaches the hidden `<lie …/>` tag grammar.",
  },
  "rpg.reminder.omniscienceTeach": {
    id: "rpg.reminder.omniscienceTeach",
    home: "preset",
    version: 1,
    text: 'PERCEPTION: the player perceives only what their character can. When something happens beyond their perception (offscreen, hidden, a secret another character keeps), emit a self-closing tag recording it: <ofilter event="what happened out of their perception" reason="why they cannot perceive it" />. This tag is INVISIBLE to the player but you REMEMBER it — narrate only what the player CAN perceive, and let the unperceived event shape the world consistently.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: ["<ofilter"],
    title: "Perception-filter teach",
    fires: "Every game turn, only when `features.omniscience` is on — teaches the hidden `<ofilter …/>` tag.",
  },
  "rpg.card.askInteractive": {
    id: "rpg.card.askInteractive",
    home: "preset",
    version: 1,
    text: 'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS/JS, then `:::` on its own line. Make whatever fits the moment — animations, layouts, interactive bits are all welcome. Everything must be self-contained markup and CSS — no images at all (external URLs and inline data: URIs are BOTH blocked by the platform security policy; a card with an <img> renders with a hole in it). Paint textures, shapes and iconography with CSS instead. Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::card"],
    title: "Card teach — interactive ask",
    fires: "Every game turn, when `features.immersiveHtml` + `immersiveHtmlInteractive` are on (the M3 variant).",
  },
  "rpg.card.askStatic": {
    id: "rpg.card.askStatic",
    home: "preset",
    version: 1,
    text: 'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS, then `:::` on its own line. Keep it a still visual — no scripts or animations, just an in-world page for the reader. Everything must be self-contained markup and CSS — no images at all (external URLs and inline data: URIs are BOTH blocked by the platform security policy; a card with an <img> renders with a hole in it). Paint textures, shapes and iconography with CSS instead. Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::card"],
    title: "Card teach — static ask",
    fires: "Every game turn, when `features.immersiveHtml` is on and `immersiveHtmlInteractive` is off.",
  },
  "rpg.card.example": {
    id: "rpg.card.example",
    home: "preset",
    version: 1,
    text: `

For example, a three-line sign is enough:
:::card title="Crossing sign"
<div style="font-family:monospace;text-align:center;padding:14px;border:2px solid #6b5c3e;background:#e9e1cb;color:#3a2f1c;letter-spacing:2px">
  <div>EAST CROSSING</div><div>CLINIC — 2 KM</div><div>NO ENTRY AFTER DARK</div>
</div>
:::`,
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::card"],
    title: "Card teach — worked example",
    fires: "Appended to BOTH card teaches (the opener-bytes example the tokenizer-leniency fix rides on).",
  },
  "rpg.reminder.cyoaTeach": {
    id: "rpg.reminder.cyoaTeach",
    home: "preset",
    version: 1,
    text: "CHOICES: end every response with a set of choices for the player. After your narration, add a line containing exactly :::choices then 3-5 numbered options (1. ...), each a distinct action the player could take next, then a line containing exactly ::: on its own. Keep each option one sentence, concrete, and meaningfully different from the others.",
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::choices"],
    title: "CYOA teach",
    fires: "Every game turn, only when `features.cyoa` is on — teaches the standing `:::choices` fence.",
  },
  "rpg.reminder.castHeader": {
    id: "rpg.reminder.castHeader",
    home: "preset",
    version: 1,
    text: "Present (appearance/outfit are standing — describe them consistently, not re-invented; thoughts are UNSPOKEN inner state, never said aloud):",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Present-cast header",
    fires: "The `Present:` header, only when a scene cast member carries a standing guide.",
  },
  "rpg.reminder.offstageHeader": {
    id: "rpg.reminder.offstageHeader",
    home: "preset",
    version: 1,
    text: "Known, offstage (established characters not in this scene — bring them back consistently, never re-introduce them):",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Offstage-cast header",
    fires: "The `Known, offstage:` header, only when an established cast member is off stage.",
  },
  "rpg.delta.changesHeading": {
    id: "rpg.delta.changesHeading",
    home: "preset",
    version: 1,
    text: "CHANGES SINCE LAST BEAT",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Delta heading",
    fires: "The prev→current diff block heading, every game turn a change landed.",
  },
  "rpg.delta.sceneOpensHeading": {
    id: "rpg.delta.sceneOpensHeading",
    home: "preset",
    version: 1,
    text: "SCENE OPENS",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Scene-opens heading",
    fires: "The first-snapshot heading (turn 1 born state — labelled as an opening, not a delta).",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;
