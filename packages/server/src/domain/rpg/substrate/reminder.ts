// domain/rpg/substrate/reminder — the lite STEERING injection assembler (rpg-design/05 §4.7). PURE
// string-building (zero I/O — the gather resolves the rows and hands them in). The reminder is an EPHEMERAL
// gather candidate on `RpgGatherResult.injections` (never a `chat_injections` row — the convergence law,
// §3.3), delivered as ONE depth-0 `role:"system"` injection.
//
// Assembly order (§4.7 + the §2.7 delta insert): (1) the STATE BLOCK — the two VOCABULARY lines (trackers,
// attributes) then the readings per entity, label-as-mini-prompt throughout (each roster actor + its sheet
// flavor prose, each cast row
// + that member's standing appearance/outfit/thoughts guides, the game-subject trackers, the ambient line,
// active quests + open objectives, the recent journal beats);
// (2) the DELTA BLOCK — the prev→current snapshot diff (`delta.ts`), rendered BEFORE the license so "let the
// change land in the fiction" has its referent (always on, omitted on no-change); (3) the STEERING LICENSE (the versioned constant below — values visibly shape behaviour,
// acknowledge changes, never recite the numbers); (4) `config.lite.steeringNote` — the always-wins user slot, LAST.
//
// NO tool-update guidance here (owner ruling 2026-07-27): the character turn is ALWAYS tool-less prose — state
// is captured by a DEDICATED post-commit round (`runToolRound`), so this reminder never asks the
// character turn to call a tool. The "call every applicable tool" checklist now lives in the TOOL ROUND's own
// prompt (`toolRoundSystem`, entry/compose/rpg.ts), where the tools actually fire. This reminder injects the
// tracked state as FLAVOR the character reacts off — steering, not writing.
//
// TWO SURFACES, ONE VOCABULARY (the live-turn drop, 2026-08-01): a tracker's MEANING is taught once per turn
// (`Trackers: Corruption (how corrupted someone is)`) and every reading below — party, cast, game-subject —
// carries only `label value/max`, exactly like `attributeGloss`/`attributeReading`. The retired inline gloss
// was READING-BOUND, so a tracker nobody had moved yet reached the model NOWHERE: the owner's pinned
// `Corruption 0/100`, visible on every Status card, was absent from the whole injection. A carried tracker
// with no reading now lists its bare LABEL on its carrier's line — carriage is the datum when there is no
// value. LOCKED trackers read here in full (D113 #4: the reminder is the model's KNOWLEDGE, the tools are its
// permissions — the lock filter belongs at the write-schema assembly and nowhere in this path).
//
// The license + state-block prose are ARGUED NO-KNOB v1 (§4.11 #4): `steeringNote` IS the designed tuning slot
// (composes last, always-wins). The license is a VERSIONED constant so a copy revision is a legible bump, not a
// silent drift — the marinara-derived line the D86 §4.4 posture ships.

import type {
  RpgDateMode,
  RpgRelationship,
  RpgStatAttributeDef,
  RpgTrackerDef,
  RpgTrackerEntry,
  RpgTrackerValue,
  RpgTrackerView,
  RpgWeather,
} from "@orb/contracts/rpg";
import {
  attributeGloss,
  attributeReading,
  RPG_CAST_GUIDE_FIELDS,
  rpgWeatherText,
  sortTrackers,
  timeOfDayAtHour,
  trackerReading,
  trackerVocabulary,
} from "@orb/contracts/rpg";
import { resolveGuidedInstruction } from "@orb/kit/guided";
import { createNamesOnlyRegistry } from "@orb/kit/macro";
import type { LiteReminderInput } from "../contract/params";
import { buildDeltaBlock } from "./delta";

/** The steering LICENSE (§4.7 #2) — a VERSIONED constant (a bump = a legible copy revision, never a silent
 *  drift; the marinara-derived line): the tracked values visibly shape behaviour, dialogue, and scene;
 *  acknowledge a change when it happens; NEVER recite the raw numbers back at the player. */
export const RPG_STEERING_LICENSE =
  "These tracked values are live state for THIS story — let them visibly shape behaviour, dialogue, and the scene as you narrate. When a value changes, let the change land in the fiction. Never recite the raw numbers back at the player; weave them into the prose.";

/** The DECEPTION teaching block (P3 §3.3 feature 3) — a VERSIONED constant (a bump = a legible copy revision;
 *  the marinara-derived tag grammar the tokenizer's `HIDDEN_TAGS` `lie` registrant recognizes). Teaches the
 *  self-closing `<lie …/>` tag: it is HIDDEN from the reader but REMEMBERED by you (it rides the wire verbatim),
 *  so a lie stays consistent across the scene. The attrs (`character type truth reason`) match the reveal
 *  surface's field order. Composed ONLY when `config.features.deception` is on. */
export const RPG_DECEPTION_TEACH =
  'DECEPTION: a character may deceive the player. When a character states something they know to be false, emit — on its own, right after the spoken lie — a self-closing tag recording the truth: <lie character="who is lying" type="the kind of lie" truth="what is actually true" reason="why they lie" />. This tag is INVISIBLE to the player but you REMEMBER it, so keep the deception consistent and let it have consequences later. Never reveal the truth in your prose or narration — only in the tag.';

/** The OMNISCIENCE-FILTER teaching block (P3 §3.3 feature 4) — a VERSIONED constant (the marinara-derived
 *  `<ofilter …/>` grammar the tokenizer's `ofilter` registrant recognizes). Teaches the perception gate: when
 *  something happens the player's character could NOT perceive, record it in a hidden tag and narrate only what
 *  they CAN perceive. The attrs (`event reason`) match the reveal surface. The optional `who` attr (per-player
 *  perception, graft #V7) is tokenized but v1 hides uniformly — the teach does not mention it. Composed ONLY when
 *  `config.features.omniscience` is on. */
export const RPG_OFILTER_TEACH =
  'PERCEPTION: the player perceives only what their character can. When something happens beyond their perception (offscreen, hidden, a secret another character keeps), emit a self-closing tag recording it: <ofilter event="what happened out of their perception" reason="why they cannot perceive it" />. This tag is INVISIBLE to the player but you REMEMBER it — narrate only what the player CAN perceive, and let the unperceived event shape the world consistently.';

// The WORKED EXAMPLE appended to both card-teach variants (spike §4h, F2b — the copy layer of the tokenizer
// fix). Its measured job is GRAMMAR, not enthusiasm: it pins the opener line's exact bytes, and the opener is
// where hosted Sonnet drifts (`:::card title="…">`, the stray `>` §4h measured on 27 of 203 open lines). Arm
// G (= this teach + this example) led the set at 10/10 rendered. The example is a STILL three-line sign — no
// scripts, no animation — so it mirrors into the static variant verbatim (§4h: "minus the JS/animation
// clause" — there is none). It is never echoed as a card (0 "EAST CROSSING" cards in 40 example-arm turns).
// Copy alone is NOT the fix (10/10 → 5/10 in one of two runs); it rides ON TOP of the tokenizer leniency.
const RPG_CARD_TEACH_EXAMPLE = `

For example, a three-line sign is enough:
:::card title="Crossing sign"
<div style="font-family:monospace;text-align:center;padding:14px;border:2px solid #6b5c3e;background:#e9e1cb;color:#3a2f1c;letter-spacing:2px">
  <div>EAST CROSSING</div><div>CLINIC — 2 KM</div><div>NO ENTRY AFTER DARK</div>
</div>
:::`;

// The card TEACHING injection (parity-plus §7.5 — owner-authored copy, deliberately SHORT + permissive:
// no schema, no component vocabulary, no allowlist; the sandbox is the wall, §4.2). A versioned constant
// (the RPG_STEERING_LICENSE pattern). Emitted only when `features.immersiveHtml` is on; the M3
// `immersiveHtmlInteractive` sub-toggle picks the variant — it shapes the ASK, never the render (a card
// the model emits renders in the same sandbox either way).
const RPG_CARD_TEACH_ASK =
  'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS/JS, then `:::` on its own line. Make whatever fits the moment — animations, layouts, interactive bits are all welcome. Embed everything inline (no external scripts/fonts/images). Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.';
export const RPG_CARD_TEACH = RPG_CARD_TEACH_ASK + RPG_CARD_TEACH_EXAMPLE;

// The CYOA teaching block (P5 §5.4 feature 5) — a versioned constant (the RPG_STEERING_LICENSE pattern).
// Teaches the `:::choices` directive fence the tokenizer's `choices` registrant recognizes; the reading
// surface renders the options as clickable send-affordances (§5.2-5.3). Composed ONLY when
// `config.features.cyoa` is on; the wand's one-shot "Offer choices" covers the this-turn-only ask.
export const RPG_CYOA_TEACH =
  "CHOICES: end every response with a set of choices for the player. After your narration, add a line containing exactly :::choices then 3-5 numbered options (1. ...), each a distinct action the player could take next, then a line containing exactly ::: on its own. Keep each option one sentence, concrete, and meaningfully different from the others.";

// The M3 static-ask variant (`immersiveHtmlInteractive: false`) — the calmer table: still cards, no ask
// for scripts/animation. The render is identical (toggle-independent); only the invitation narrows.
const RPG_CARD_TEACH_STATIC_ASK =
  'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS, then `:::` on its own line. Keep it a still visual — no scripts or animations, just an in-world page for the reader. Embed everything inline (no external fonts/images). Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.';
export const RPG_CARD_TEACH_STATIC = RPG_CARD_TEACH_STATIC_ASK + RPG_CARD_TEACH_EXAMPLE;

/** The ambient line. `dateMode` (#9): `narrated` renders the FREEFORM date string as the date datum and
 *  DROPS the sequential `day N` counter (no forced day-count pressure on the model); `structured` keeps
 *  it. Time-of-day stays in BOTH modes (structured + functional — it drives the Waystone). */
function ambientLine(ambient: NonNullable<RpgTrackerView["ambient"]>, dateMode: RpgDateMode): string {
  const parts: string[] = [];
  if (ambient.location !== "") {
    parts.push(ambient.location);
  }
  if (ambient.calendarDate !== null) {
    parts.push(ambient.calendarDate);
  }
  if (ambient.clock !== null) {
    const label = timeOfDayAtHour(ambient.clock.hour);
    parts.push(dateMode === "structured" ? `day ${ambient.clock.day} · ${label}` : label);
  }
  if (ambient.weather !== null) {
    parts.push(weatherLine(ambient.weather));
  }
  return parts.join(" · ");
}

/** The weather segment — the model's own phrasing when it wrote a `label`, else the canonical type (the ONE
 *  `rpgWeatherText` home), plus the engine's `description` in parens when present. */
function weatherLine(weather: RpgWeather): string {
  const head = rpgWeatherText(weather);
  return weather.description !== undefined && weather.description !== "" ? `${head} (${weather.description})` : head;
}

/** THE ONE tracker reading path (the tracked-field unification): every tracker on every carrier — a roster
 *  actor's row, a scene cast row, the game-wide readings — renders through `trackerReading`, the one
 *  `label value/max` grammar. It replaces the three drifted per-concept builders this file carried (pool segs ·
 *  cast-field segs · widget lines), which is exactly how R4b was born: the cast-field builder silently dropped
 *  the hint its own docstring promised, so every host-defined tracked field was decoration instead of a
 *  steering lever (measured: Δ −0.12 bare vs −1.00 glossed). One builder cannot drift from itself.
 *
 *  A carrier's tracker with NO reading yet still renders — its BARE LABEL (the `gameTrackerLine` rule,
 *  now uniform across subjects). Dropping it was the live-turn bug: a `party` Corruption meter the panel
 *  showed on every Status card reached the reminder NOWHERE, so the model could neither narrate around it
 *  nor be expected to move it. The MEANING rides {@link trackerVocabularyLine} once per turn. */
function trackerSegs(defs: readonly RpgTrackerDef[], values: Readonly<Record<string, RpgTrackerValue>>): string[] {
  return defs.map((def) => trackerReading(def, values[def.key]) ?? def.label);
}

/** The tracker VOCABULARY line — every tracker the game defines, taught ONCE with its hint (the
 *  `Attributes:` line's twin, same reason: the per-carrier lines below carry the numbers under the same
 *  labels, so one meaning serves N readings at any party size). Rendered whenever the game defines a
 *  tracker at all — including one nobody has moved yet, which is precisely the case the old reading-bound
 *  gloss taught nothing about. */
function trackerVocabularyLine(defs: readonly RpgTrackerDef[]): string {
  return `Trackers: ${sortTrackers(defs).map(trackerVocabulary).join(" · ")}`;
}

/** An actor's volatile-plane segments (hp/wallet/inventory/status/conditions) — hoisted out of `actorLine`
 *  so the identity-plane additions (className/level/attributes) stay under the cognitive-complexity gate.
 *  The TRACKER segs are NOT here: an actor carries its trackers whether or not a snapshot ever wrote it a
 *  volatile row, so they render off `actor.trackers` in `actorLine` (the null-volatile actor — the user
 *  actor on a game whose beats only ever touched the NPC — otherwise lost every tracker it carries). */
function volatileSegs(v: NonNullable<RpgTrackerView["actors"][number]["volatile"]>): string[] {
  const segs: string[] = [];
  if (v.hp !== null) {
    segs.push(`HP ${v.hp.value}/${v.hp.max}`);
  }
  if (v.wallet.length > 0) {
    segs.push(v.wallet.map((w) => `${w.amount} ${w.name}`).join(", "));
  }
  if (v.inventory.length > 0) {
    segs.push(`carrying: ${v.inventory.map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(", ")}`);
  }
  if (v.status !== "") {
    segs.push(v.status);
  }
  if (v.conditions.length > 0) {
    segs.push(`conditions: ${v.conditions.map((c) => c.name).join(", ")}`);
  }
  return segs;
}

function actorLine(actor: RpgTrackerView["actors"][number], attrDefs: readonly RpgStatAttributeDef[]): string {
  const segs: string[] = [actor.name];
  if (actor.sheet.className !== "") {
    segs.push(`(${actor.sheet.className})`);
  }
  if (actor.sheet.level !== null) {
    segs.push(`Lv ${actor.sheet.level}`); // §2.6 — hand-only level; omitted when null (nullable-honesty)
  }
  const attrs = Object.entries(actor.sheet.attributes);
  if (attrs.length > 0) {
    // By LABEL, not by key (`Strength 14`, never `str 14`) — what each attribute MEANS is taught ONCE by the
    // vocabulary line, so this per-actor line stays compact at any party size.
    segs.push(attrs.map(([k, n]) => attributeReading(attrDefs, k, n)).join(", "));
  }
  // The trackers THIS actor carries — rendered off the CARRIER set, never off the volatile row's key set, so
  // a carried-but-unmoved tracker (and an actor with no volatile row at all) still reaches the model.
  segs.push(...trackerSegs(actor.trackers, actor.volatile?.trackerValues ?? {}));
  if (actor.volatile !== null) {
    segs.push(...volatileSegs(actor.volatile));
  }
  const head = `- ${segs.join(" — ")}`;
  // The sheet's host-authored FLAVOR prose — the SAME dead-write class as the cast guides (RV-11): the
  // takeover writes it through `patchSheet` and it reached the model nowhere, so the party line taught the
  // character's numbers and none of who they are. A CONTINUATION line for the same reason the guides get
  // one (prose with no length contract does not belong mid-`—`-chain); empty ⇒ omitted, and no header teach
  // is owed — unlike `thoughts`, standing character prose carries no rule the turn could break.
  const flavor = actor.sheet.flavor.trim();
  return flavor === "" ? head : `${head}\n  flavor: ${flavor}`;
}

/** The steering display of a present character's relationship (§2.1) — the bare kind, or a custom `label` glossed
 *  with the M1 hint (`vassal (sworn to serve but resentful)`). A neutral default is omitted from the line (no
 *  steering signal). */
function relationshipSeg(rel: RpgRelationship, hints: Readonly<Record<string, string>>): string | null {
  if (rel.kind === "custom") {
    const label = rel.label !== "" ? rel.label : "custom";
    const hint = hints[label];
    return hint !== undefined && hint !== "" ? `${label} (${hint})` : label;
  }
  return rel.kind === "neutral" ? null : rel.kind;
}

/** The `Present:` section header when at least one cast member carries a GUIDE — the label-as-mini-prompt
 *  that teaches the three continuation labels ONCE (the `Trackers:`/`Attributes:` vocabulary rule: meaning
 *  once, readings N times). It says the two things the character turn can get wrong: the look/dress are
 *  STANDING (re-inventing them every beat is the failure RV-11 names), and `thoughts` is inner state the
 *  player never hears (the model must not voice it as dialogue). */
const RPG_CAST_GUIDE_HEADER =
  "Present (appearance/outfit are standing — describe them consistently, not re-invented; thoughts are UNSPOKEN inner state, never said aloud):";

/** A cast member's persistent GUIDES as CONTINUATION lines under its one-liner (the {@link questLine}
 *  objective precedent), never more ` — ` segs: these are model-authored PROSE with no length contract, and a
 *  sentence wedged mid-chain buries the short steering readings behind it. Written richly by the extraction
 *  round every beat and read by NOTHING until now (RV-11) — so the character turn re-described a face it had
 *  already fixed. Empty/absent ⇒ the line is OMITTED (token-lean: a guide nobody wrote costs nothing, and the
 *  header teach only ships when one exists). */
function guideLines(cast: RpgTrackerView["cast"][number]): string[] {
  return RPG_CAST_GUIDE_FIELDS.flatMap((field) => {
    const text = cast[field]?.trim() ?? "";
    return text === "" ? [] : [`  ${field}: ${text}`];
  });
}

/** The `Present:` header — the guide TEACH only when a guide actually exists, so a game whose cast carries
 *  none gets the byte-identical bare label it always had (the no-phantom-teaching rule the feature-gated
 *  teaching blocks follow). */
function castHeader(cast: RpgTrackerView["cast"]): string {
  return cast.some((c) => guideLines(c).length > 0) ? RPG_CAST_GUIDE_HEADER : "Present:";
}

function castLine(cast: RpgTrackerView["cast"][number], trackers: readonly RpgTrackerEntry[], hints: Readonly<Record<string, string>>): string {
  const segs: string[] = [cast.emoji !== "" ? `${cast.emoji} ${cast.name}` : cast.name];
  if (cast.mood !== "") {
    segs.push(cast.mood);
  }
  const rel = relationshipSeg(cast.relationship, hints);
  if (rel !== null) {
    segs.push(rel);
  }
  // Every tracker this cast member CARRIES (the server-resolved entry list), unmoved ones included as their
  // bare label — the same rule the party lines and the game-subject block follow.
  for (const entry of trackers) {
    segs.push(trackerReading(entry.def, entry.value ?? undefined) ?? entry.def.label);
  }
  const head = `- ${segs.join(" — ")}`;
  const guides = guideLines(cast);
  return guides.length === 0 ? head : `${head}\n${guides.join("\n")}`;
}

/** A GAME-subject tracker's line — the SAME reading every other tracker surface renders. A tracker with no
 *  reading yet still lists (bare label): the model should know the game HAS an Alarm before it moves it. */
function gameTrackerLine(entry: RpgTrackerEntry): string {
  return `- ${trackerReading(entry.def, entry.value ?? undefined) ?? entry.def.label}`;
}

/** The P5 plot one-liner (`<story title> — act 2/3: <act title> — <act summary>`) — empty segments omitted,
 *  so a bare `{act:1,title:"",acts:[]}` still reads honestly (`act 1/1`). Exported: the macro feed's
 *  `rpgSceneState` Story line reuses it verbatim (one line grammar, two consumers). */
export function plotLine(plot: NonNullable<RpgTrackerView["plot"]>): string {
  const segs: string[] = [];
  if (plot.title !== "") {
    segs.push(plot.title);
  }
  const current = plot.acts[plot.act - 1];
  const total = Math.max(plot.acts.length, plot.act);
  segs.push(current !== undefined && current.title !== "" ? `act ${plot.act}/${total}: ${current.title}` : `act ${plot.act}/${total}`);
  if (current !== undefined && current.summary !== "") {
    segs.push(current.summary);
  }
  return segs.join(" — ");
}

/** One active quest — the goal line + its open objectives. The `description` rides the head line when the
 *  host wrote one (it is an EDITABLE panel field whose prose reached the model nowhere — the same
 *  filled-but-unread class as the tracker hint). */
function questLine(quest: RpgTrackerView["quests"][number]): string {
  const open = quest.objectives.filter((o) => !o.completed);
  const head = quest.description === "" ? `- ${quest.name} [${quest.status}]` : `- ${quest.name} [${quest.status}] — ${quest.description}`;
  if (open.length === 0) {
    return head;
  }
  return `${head}\n${open.map((o) => `  ○ ${o.text}`).join("\n")}`;
}

/** The config-gated teaching blocks (parity-plus §3.3) — composed AFTER the state/delta, BEFORE the license,
 *  each gated by its knob (all off ⇒ `[]`, byte-identical to a pre-feature reminder). Extracted so
 *  `buildLiteReminder` stays under the cognitive-complexity ceiling — a NEW teach is one arm here. */
function teachingBlocks(input: LiteReminderInput): string[] {
  const blocks: string[] = [];
  if (input.deception) {
    blocks.push(RPG_DECEPTION_TEACH);
  }
  if (input.omniscience) {
    blocks.push(RPG_OFILTER_TEACH);
  }
  if (input.features.immersiveHtml) {
    blocks.push(input.features.immersiveHtmlInteractive ? RPG_CARD_TEACH : RPG_CARD_TEACH_STATIC);
  }
  // P5 §5.4 — the standing CYOA mode: every turn ends with a `:::choices` set. Off ⇒ no teaching (the
  // tokenizer still renders an unprompted fence harmlessly; the wand one-shot covers this-turn-only asks).
  if (input.features.cyoa) {
    blocks.push(RPG_CYOA_TEACH);
  }
  return blocks;
}

/** Build the lite steering reminder (§4.7). Returns the assembled block; the gather wraps it as ONE depth-0
 *  `role:"system"` `ChatInjection`. Empty sections are omitted so a fresh game's reminder is just the license
 *  (+ note) — no phantom empty headers. No tool guidance: the char turn is tool-less (see the file header). */
export function buildLiteReminder(input: LiteReminderInput): string {
  const { view } = input;
  const blocks: string[] = [];

  const stateLines: string[] = [];
  if (view.ambient !== null) {
    const line = ambientLine(view.ambient, input.dateMode);
    if (line !== "") {
      stateLines.push(`Scene: ${line}`);
    }
  }
  // The P5 plot spine — where the story stands on the campaign scale, so the prose stays on-act.
  if (view.plot !== null) {
    stateLines.push(`Story: ${plotLine(view.plot)}`);
  }
  // The tracker VOCABULARY, taught ONCE (label + hint) — the attribute line's twin, and INDEPENDENT of the
  // party (a game-subject tracker on a rosterless game still has to teach itself). Every reading below —
  // party, cast, game — then carries only `label value/max` under these same labels.
  if (view.trackerDefs.length > 0) {
    stateLines.push(trackerVocabularyLine(view.trackerDefs));
  }
  if (view.actors.length > 0) {
    // The attribute VOCABULARY, taught ONCE (label + hint): the sheet's steering lever finally reaching the
    // model. Per-actor lines below carry the numbers under the same labels — one meaning, N readings, never
    // the profile's prose multiplied by the party size (the token budget the gloss has to respect).
    const attrDefs = input.statProfile.attributes;
    if (attrDefs.length > 0) {
      stateLines.push(`Attributes: ${attrDefs.map(attributeGloss).join(" · ")}`);
    }
    stateLines.push("Party:");
    stateLines.push(...view.actors.map((a) => actorLine(a, attrDefs)));
  }
  if (view.cast.length > 0) {
    stateLines.push(castHeader(view.cast));
    stateLines.push(...view.cast.map((c) => castLine(c, view.castTrackers[c.key] ?? [], input.features.relationshipHints)));
  }
  if (view.gameTrackers.length > 0) {
    // "Game trackers" (not the bare "Trackers:" it used to be) — the vocabulary line above now owns that
    // word, and this block is specifically the SUBJECT:GAME readings that belong to nobody in particular.
    stateLines.push("Game trackers:");
    stateLines.push(...view.gameTrackers.map(gameTrackerLine));
  }
  const activeQuests = view.quests.filter((q) => q.status === "active");
  if (activeQuests.length > 0) {
    stateLines.push("Active quests:");
    stateLines.push(...activeQuests.map(questLine));
  }
  if (view.recentBeats.length > 0) {
    stateLines.push("Recent beats:");
    stateLines.push(...view.recentBeats.map((b) => `- ${b}`));
  }
  if (stateLines.length > 0) {
    blocks.push(`# Game state\n${stateLines.join("\n")}`);
  }

  // The DELTA BLOCK (§2.7) — the prev→current diff, rendered BETWEEN the absolute state and the license so the
  // license's "let the change land in the fiction" has its referent (here is what changed; now let it land).
  // ALWAYS ON (§13 #10 — no knob); OMITTED on no-change (`null` — the byte-stable quiet-turn signal).
  const delta = buildDeltaBlock(input.prevSnapshot, input.curSnapshot, {
    rosterNames: input.rosterNames,
    trackerDefs: view.trackerDefs,
    relationshipHints: input.features.relationshipHints,
  });
  if (delta !== null) {
    blocks.push(delta);
  }

  // The config-gated TEACHING blocks (parity-plus §3.3) — after the state/delta, before the license. P3 teaches
  // the `<lie …/>`/`<ofilter …/>` grammar the `HIDDEN_TAGS` registry recognizes + server-strips; P4 teaches the
  // `:::card` fence (the M3 sub-toggle picks the interactive vs static ask — the ask, never the render).
  blocks.push(...teachingBlocks(input));

  blocks.push(RPG_STEERING_LICENSE);

  const note = renderSteeringNote(input.steeringNote, input.steerMacros);
  if (note !== "") {
    blocks.push(note);
  }

  return blocks.join("\n\n");
}

// The IDENTITY-ONLY registry for the steeringNote render (module-scoped — one compile, the row-macros.ts
// precedent): char/user/name macros resolve; volatile/variable/injection macros re-emit VERBATIM.
const STEER_NAMES_REGISTRY = createNamesOnlyRegistry();

/** Render the host-authored `steeringNote`'s identity macros (`{{user}}`/`{{char}}`) — the substitution fix.
 *  Routes through the SAME guided resolver the nudge/wand path uses (`resolveGuidedInstruction`) so a host who
 *  types `{{user}}/{{char}}` gets the names, NEVER literal braces. GUIDED-SAFE via {@link STEER_NAMES_REGISTRY}:
 *  ONLY identity/name macros resolve — `{{random}}/{{setvar}}/{{expr}}/…` re-emit VERBATIM (a host steer gets
 *  identity substitution, never full macro/variable/injection power, per the steer-neutralization ruling).
 *  Absent binding ⇒ the note ships verbatim (the byte-identical pre-fix path — a caller that supplies none). */
function renderSteeringNote(steeringNote: string, macros: { readonly user: string; readonly char: string } | undefined): string {
  const trimmed = steeringNote.trim();
  if (trimmed === "" || macros === undefined) {
    return trimmed;
  }
  return resolveGuidedInstruction(
    trimmed,
    "", // no user-steer text — this is the trusted template side; only identity macros substitute
    { char: macros.char, user: macros.user, persona: "", scenario: "", env: {} },
    { registry: STEER_NAMES_REGISTRY },
  ).trim();
}
