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
// NO tool-update guidance here (owner ruling): the character turn is ALWAYS tool-less prose — state
// is captured by a DEDICATED post-commit round (`runToolRound`), so this reminder never asks the
// character turn to call a tool. The "call every applicable tool" checklist now lives in the TOOL ROUND's own
// prompt (`toolRoundSystem`, entry/compose/rpg.ts), where the tools actually fire. This reminder injects the
// tracked state as FLAVOR the character reacts off — steering, not writing.
//
// TWO SURFACES, ONE VOCABULARY (the live-turn drop): a tracker's MEANING is taught once per turn
// (`Trackers: Corruption (how corrupted someone is)`) and every reading below — party, cast, game-subject —
// carries only `label value/max`, exactly like `attributeGloss`/`attributeReading`. The retired inline gloss
// was READING-BOUND, so a tracker nobody had moved yet reached the model NOWHERE: the owner's pinned
// `Corruption 0/100`, visible on every Status card, was absent from the whole injection. A carried tracker
// with no reading now lists its bare LABEL on its carrier's line — carriage is the datum when there is no
// value. LOCKED trackers read here in full (D113 #4: the reminder is the model's KNOWLEDGE, the tools are its
// permissions — the lock filter belongs at the write-schema assembly and nowhere in this path).
//
// THIS FILE IS THE ONE HOME OF THE STATE-LINE GRAMMAR (the third-surface parity fix). The macro /
// CEL feed (`chat-ops/macro-view.ts`) is a SECOND model-facing consumer of the same lines — `{{rpgSceneState}}`
// / `{{rpgCast}}` / `{{rpgQuests}}` — and it carried its OWN cast/actor/ambient/quest builders, which had
// silently drifted into a strict subset: no volatile plane on any carrier (hp · wallet · carrying · status ·
// conditions), none of the standing guides, no attribute readings, no sheet flavor, no game-subject readings,
// no quest status/description, no time-of-day, no weather description. Every one of those is a field the host
// or the model can WRITE that reached that surface nowhere — the exact class the reachability suite exists to
// kill. The line builders below are therefore EXPORTED and the feed composes them; a new seg lands on both
// surfaces at once, and the suite's macro column reds if a third builder is ever re-grown.
//
// The license + state-block prose are ARGUED NO-KNOB v1 (§4.11 #4): `steeringNote` IS the designed tuning slot
// (composes last, always-wins). The license is a VERSIONED constant so a copy revision is a legible bump, not a
// silent drift — the marinara-derived line the D86 §4.4 posture ships.

import type { ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import { PROSE_SLOTS, resolveProse } from "@orb/contracts/prose";
import type {
  RpgActorVolatile,
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
  clockTimeOfDay,
  RPG_CAST_GUIDE_FIELDS,
  rpgWeatherText,
  sortTrackers,
  trackerReading,
  trackerVocabulary,
} from "@orb/contracts/rpg";
import { resolveGuidedInstruction } from "@orb/kit/guided";
import { createNamesOnlyRegistry, processMacros } from "@orb/kit/macro";
import type { LiteReminderInput } from "../contract/params.ts";
import { buildDeltaBlock } from "./delta.ts";

// The teaches + headings below are PROSE-1 slots (`@orb/contracts/rpg/prose`, census 1-10): the shipped-default
// BYTES live in the `RPG_PROSE_SLOTS` table (ONE home), and the reminder resolves each against the game's
// PRESET `promptConfig.prose` overrides via {@link resolveTeach}. These exported constants are the DERIVED defaults — the
// byte-references the substrate tests and the macro-feed sibling read — never a second copy of the string.

/** The steering LICENSE (§4.7 #2) — a VERSIONED slot (a `version` bump = a legible copy revision, never a
 *  silent drift): the tracked values visibly shape behaviour, dialogue, and scene; acknowledge a change when it
 *  happens; NEVER recite the raw numbers back at the player. */
export const RPG_STEERING_LICENSE = PROSE_SLOTS["rpg.reminder.steeringLicense"].text;

/** The DECEPTION teaching block (P3 §3.3 feature 3) — a VERSIONED constant (a bump = a legible copy revision;
 *  the marinara-derived tag grammar the tokenizer's `HIDDEN_TAGS` `lie` registrant recognizes). Teaches the
 *  self-closing `<lie …/>` tag: it is HIDDEN from the reader but REMEMBERED by you (it rides the wire verbatim),
 *  so a lie stays consistent across the scene. The attrs (`character type truth reason`) match the reveal
 *  surface's field order. Composed ONLY when `config.features.deception` is on. */
export const RPG_DECEPTION_TEACH = PROSE_SLOTS["rpg.reminder.deceptionTeach"].text;

/** The OMNISCIENCE-FILTER teaching block (P3 §3.3 feature 4) — a VERSIONED constant (the marinara-derived
 *  `<ofilter …/>` grammar the tokenizer's `ofilter` registrant recognizes). Teaches the perception gate: when
 *  something happens the player's character could NOT perceive, record it in a hidden tag and narrate only what
 *  they CAN perceive. The attrs (`event reason`) match the reveal surface. The optional `who` attr (per-player
 *  perception, graft #V7) is tokenized but v1 hides uniformly — the teach does not mention it. Composed ONLY when
 *  `config.features.omniscience` is on. */
export const RPG_OFILTER_TEACH = PROSE_SLOTS["rpg.reminder.omniscienceTeach"].text;

// The WORKED EXAMPLE appended to both card-teach variants (spike §4h, F2b — the copy layer of the tokenizer
// fix). Its measured job is GRAMMAR, not enthusiasm: it pins the opener line's exact bytes, and the opener is
// where hosted Sonnet drifts (`:::card title="…">`, the stray `>` §4h measured on 27 of 203 open lines). Arm
// G (= this teach + this example) led the set at 10/10 rendered. The example is a STILL three-line sign — no
// scripts, no animation — so it mirrors into the static variant verbatim (§4h: "minus the JS/animation
// clause" — there is none). It is never echoed as a card (0 "EAST CROSSING" cards in 40 example-arm turns).
// Copy alone is NOT the fix (10/10 → 5/10 in one of two runs); it rides ON TOP of the tokenizer leniency.
const RPG_CARD_TEACH_EXAMPLE = PROSE_SLOTS["rpg.card.example"].text;

// The card TEACHING injection (parity-plus §7.5 — owner-authored copy, deliberately SHORT + permissive:
// no schema, no component vocabulary, no allowlist; the sandbox is the wall, §4.2). A versioned constant
// (the RPG_STEERING_LICENSE pattern). Emitted only when `features.immersiveHtml` is on; the M3
// `immersiveHtmlInteractive` sub-toggle picks the variant — it shapes the ASK, never the render (a card
// the model emits renders in the same sandbox either way).
const RPG_CARD_TEACH_ASK = PROSE_SLOTS["rpg.card.askInteractive"].text;
export const RPG_CARD_TEACH = RPG_CARD_TEACH_ASK + RPG_CARD_TEACH_EXAMPLE;

// The CYOA teaching block (P5 §5.4 feature 5) — a versioned constant (the RPG_STEERING_LICENSE pattern).
// Teaches the `:::choices` directive fence the tokenizer's `choices` registrant recognizes; the reading
// surface renders the options as clickable send-affordances (§5.2-5.3). Composed ONLY when
// `config.features.cyoa` is on; the wand's one-shot "Offer choices" covers the this-turn-only ask.
export const RPG_CYOA_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text;

// The M3 static-ask variant (`immersiveHtmlInteractive: false`) — the calmer table: still cards, no ask
// for scripts/animation. The render is identical (toggle-independent); only the invitation narrows.
const RPG_CARD_TEACH_STATIC_ASK = PROSE_SLOTS["rpg.card.askStatic"].text;
export const RPG_CARD_TEACH_STATIC = RPG_CARD_TEACH_STATIC_ASK + RPG_CARD_TEACH_EXAMPLE;

/** The ambient line. `dateMode` (#9): `narrated` renders the FREEFORM date string as the date datum and
 *  DROPS the sequential `day N` counter (no forced day-count pressure on the model); `structured` keeps
 *  it. Time-of-day stays in BOTH modes (structured + functional — it drives the Waystone).
 *
 *  EXPORTED for the macro feed's `{{rpgSceneState}}` Scene line ({@link plotLine}'s precedent — one line
 *  grammar, two model-facing consumers). Its own builder printed `day N` unconditionally and carried neither
 *  the time-of-day nor the weather `description`, so the host's dateMode ruling and two written planes died on
 *  that surface (the reachability class). */
export function ambientLine(ambient: NonNullable<RpgTrackerView["ambient"]>, dateMode: RpgDateMode): string {
  const parts: string[] = [];
  if (ambient.location !== "") {
    parts.push(ambient.location);
  }
  if (ambient.calendarDate !== null) {
    parts.push(ambient.calendarDate);
  }
  if (ambient.clock !== null) {
    // The two facts a clock carries are separately knowable: a story can be on `day 4` having said nothing
    // about the hour (the host cleared the time, or only the day has ever been written). `structured` still
    // owes the counter in that case; `narrated` has nothing to say and adds no segment.
    const label = clockTimeOfDay(ambient.clock);
    const structured = dateMode === "structured";
    if (label !== null) {
      parts.push(structured ? `day ${ambient.clock.day} · ${label}` : label);
    } else if (structured) {
      parts.push(`day ${ambient.clock.day}`);
    }
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

/** THE ONE conditions reading — `conditions: poisoned, bleeding`, or null when the carrier has none. Read
 *  through {@link volatileSegs}, which BOTH carrier surfaces now share (a roster actor's line AND the cast
 *  line), because a cast NPC's volatile plane reached the model NOWHERE: the reminder rendered it for roster
 *  actors only, and the accidental channel it used to leak through (the pre-F4 constraint enums, which
 *  enumerated every live condition name) is correctly gone. An affliction the tool round had just applied to an
 *  NPC was therefore invisible to the very turn that had to play it — and unremovable, since the model could
 *  not know it existed (D113 #4: the reminder is the model's KNOWLEDGE). */
function conditionsSeg(conditions: RpgActorVolatile["conditions"]): string | null {
  return conditions.length === 0 ? null : `conditions: ${conditions.map((c) => c.name).join(", ")}`;
}

/** The per-item ANNOTATION cap, in characters. The carrying line is a ROLL-CALL the model re-reads on EVERY
 *  turn, for every carrier, so an item's prose rides it TRUNCATED at a word boundary (`…`) rather than
 *  multiplying a party's inventory prose into the state block — the exact cost that kept `description` off the
 *  read surfaces until the owner ruled it on. */
const RPG_ITEM_NOTE_MAX = 60;

/** Trim + hard-cap one item annotation at the nearest word boundary under {@link RPG_ITEM_NOTE_MAX}. */
function itemNote(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= RPG_ITEM_NOTE_MAX) {
    return trimmed;
  }
  const cut = trimmed.slice(0, RPG_ITEM_NOTE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** ONE carried item — `rope ×2 (the pack: forty feet of hemp)`: the name, its quantity when it stacks, then the
 *  host/model annotation in ONE parenthetical (`location: description`, either alone when the other is empty).
 *  Both arms are model-writable (`update_inventory.add[].location`/`.description`) and reached NO model-facing
 *  surface until the owner ruled them on — the panel had shown both all along. The parenthetical (never a ` — `
 *  seg) keeps the comma-joined roll-call unambiguous, and {@link itemNote} caps the prose. */
function itemSeg(item: RpgActorVolatile["inventory"][number]): string {
  const head = item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name;
  const notes = [item.location, item.description].map(itemNote).filter((note) => note !== "");
  return notes.length === 0 ? head : `${head} (${notes.join(": ")})`;
}

/** An actor's volatile-plane segments (hp/wallet/inventory/status/conditions) — hoisted out of `actorLine`
 *  so the identity-plane additions (className/level/attributes) stay under the cognitive-complexity gate.
 *  The TRACKER segs are NOT here: an actor carries its trackers whether or not a snapshot ever wrote it a
 *  volatile row, so they render off `actor.trackers` in `actorLine` (the null-volatile actor — the user
 *  actor on a game whose beats only ever touched the NPC — otherwise lost every tracker it carries).
 *
 *  ONE builder for BOTH carrier surfaces (the reachability-suite fix): the roster line and the scene-cast line
 *  read the SAME plane through the SAME segs, so a cast NPC's hp/wallet/inventory/status can never again be
 *  writable-but-unreadable while a party member's identical row renders. Two builders is how that split was
 *  born (only `conditions` had been hand-carried across). */
function volatileSegs(v: RpgActorVolatile): string[] {
  const segs: string[] = [];
  // No HP seg (R3): health is an ordinary meter, so it renders through `trackerSegs` under the game's own
  // label with the game's own ceiling — one grammar, and finally one that a `freeform` game can simply not have.
  if (v.wallet.length > 0) {
    segs.push(v.wallet.map((w) => `${w.amount} ${w.name}`).join(", "));
  }
  if (v.inventory.length > 0) {
    segs.push(`carrying: ${v.inventory.map(itemSeg).join(", ")}`);
  }
  if (v.status !== "") {
    segs.push(v.status);
  }
  const conditions = conditionsSeg(v.conditions);
  if (conditions !== null) {
    segs.push(conditions);
  }
  return segs;
}

/** ONE actor's whole line — identity, the trackers it CARRIES, its volatile plane, and the standing-prose
 *  continuations. ONE builder for EVERY actor since R2 (a roster member and a scene NPC are two shapes of the
 *  same row, not two row types): the identity head differs by which half the actor carries, and everything
 *  below it — trackers, volatile segs, guides — is shared. The retired `castLine`/`actorLine` split is exactly
 *  how a cast NPC's wounds, pack and purse came to render on the model's side and nowhere else.
 *
 *  EXPORTED for `{{rpgCast}}`: the macro feed composes it rather than carrying a second builder. */
export function actorLine(
  actor: RpgTrackerView["actors"][number],
  attrDefs: readonly RpgStatAttributeDef[],
  relationshipHints: Readonly<Record<string, string>> = {},
): string {
  const identity = actor.identity;
  const segs: string[] = [identity !== null && identity.emoji !== "" ? `${identity.emoji} ${actor.name}` : actor.name];
  if (identity !== null && identity.mood !== "") {
    segs.push(identity.mood);
  }
  const rel = identity === null ? null : relationshipSeg(identity.relationship, relationshipHints);
  if (rel !== null) {
    segs.push(rel);
  }
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
  // The standing PROSE, as CONTINUATION lines (prose with no length contract does not belong mid-`—`-chain):
  // the cast's three guides (RV-11) and the sheet's host-authored FLAVOR. Both were the same dead-write class —
  // written every beat / through `patchSheet`, read by nothing — so the line taught a character's numbers and
  // none of who they are. Empty ⇒ omitted.
  const lines = [...guideLines(actor.identity)];
  const flavor = actor.sheet.flavor.trim();
  if (flavor !== "") {
    lines.push(`  flavor: ${flavor}`);
  }
  return lines.length === 0 ? head : `${head}\n${lines.join("\n")}`;
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

/** A cast member's persistent GUIDES as CONTINUATION lines under its one-liner (the {@link questLine}
 *  objective precedent), never more ` — ` segs: these are model-authored PROSE with no length contract, and a
 *  sentence wedged mid-chain buries the short steering readings behind it. Written richly by the extraction
 *  round every beat and read by NOTHING until now (RV-11) — so the character turn re-described a face it had
 *  already fixed. Empty/absent ⇒ the line is OMITTED (token-lean: a guide nobody wrote costs nothing, and the
 *  header teach only ships when one exists). */
function guideLines(identity: RpgTrackerView["actors"][number]["identity"]): string[] {
  if (identity === null) {
    return [];
  }
  return RPG_CAST_GUIDE_FIELDS.flatMap((field) => {
    const text = identity[field]?.trim() ?? "";
    return text === "" ? [] : [`  ${field}: ${text}`];
  });
}

/** The `Present:` header — the guide TEACH only when a guide actually exists, so a game whose cast carries
 *  none gets the byte-identical bare label it always had (the no-phantom-teaching rule the feature-gated
 *  teaching blocks follow). EXPORTED with {@link actorLine}: the teach and the guides travel TOGETHER, so no
 *  surface can print a member's unspoken `thoughts` without the line that says never to voice them.
 *
 *  DUAL-surface (PROSE-1): the teach header is a `rpg.reminder.castHeader` slot the reminder AND the
 *  `{{rpgCast}}`/`{{rpgSceneState}}` macro feed both resolve, so `prose` is threaded to BOTH — a host override
 *  lands on both surfaces at once (the two-surfaces-one-vocabulary law this file's header states). Resolved
 *  VERBATIM (`macros:"none"` — a header has no identity context to substitute). Empty overrides ⇒ the shipped
 *  default, byte-identical to the pre-PROSE-1 constant. */
export function castHeader(actors: readonly RpgTrackerView["actors"][number][], prose: ProseOverrides): string {
  return actors.some((a) => guideLines(a.identity).length > 0) ? resolveProse("rpg.reminder.castHeader", prose).text : "Present:";
}

/** The `Known, offstage:` roster (R2) — the terse continuity line for every tracked cast actor who is NOT on
 *  stage. It exists because retention without VISIBILITY steers nothing: an NPC the story established, then
 *  walked out of the room, is exactly the character the model should be able to bring back consistently, and
 *  before R2 she was unrepresentable (departure destroyed her identity outright). Deliberately ONE line per
 *  actor — name, mood, stance — never her trackers, pack or guides: this is a memory jog, not a second Present
 *  block, and a long-running game accumulates these.
 *
 *  Module-private on purpose: the macro feed deliberately does NOT stage this block (the reachability suite
 *  pins that posture with a `macroAbsent` needle), so unlike `actorLine`/`castHeader` it has exactly one
 *  consumer — the reminder's own assembly. */
function offstageLine(actor: RpgTrackerView["actors"][number], hints: Readonly<Record<string, string>>): string {
  const identity = actor.identity;
  const segs: string[] = [identity !== null && identity.emoji !== "" ? `${identity.emoji} ${actor.name}` : actor.name];
  if (identity !== null && identity.mood !== "") {
    segs.push(identity.mood);
  }
  const rel = identity === null ? null : relationshipSeg(identity.relationship, hints);
  if (rel !== null) {
    segs.push(rel);
  }
  return `- ${segs.join(" — ")}`;
}

/** A GAME-subject tracker's line — the SAME reading every other tracker surface renders. A tracker with no
 *  reading yet still lists (bare label): the model should know the game HAS an Alarm before it moves it.
 *  EXPORTED for `{{rpgSceneState}}`'s Game-trackers block, which the macro feed carried nowhere at all — a
 *  game-subject reading (the retired custom widgets) belongs to no actor, so it fell through the cast/party
 *  split entirely. */
export function gameTrackerLine(entry: RpgTrackerEntry): string {
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
 *  filled-but-unread class as the tracker hint). EXPORTED for `{{rpgQuests}}`, whose own builder printed the
 *  bare name (no status, no description). */
export function questLine(quest: RpgTrackerView["quests"][number]): string {
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
/** Resolve a teach SLOT against the turn preset's `promptConfig.prose` overrides and render its `names-only` macros
 *  (§6.1) — the same identity-only registry {@link renderSteeringNote} uses, so a host override's
 *  `{{user}}`/`{{char}}` become names while every other macro re-emits verbatim. NOT trimmed (unlike the
 *  steering note): a teach's own leading whitespace is load-bearing — the card example opens with a blank line
 *  that separates it from the ask. A macro-FREE resolved text — every shipped default — never touches the
 *  engine (the `!includes("{{")` fast path), so it is byte-identical to the pre-PROSE-1 constant. */
function resolveTeach(id: ProseSlotId, input: LiteReminderInput): string {
  const text = resolveProse(id, input.prose ?? {}).text;
  if (input.steerMacros === undefined || !text.includes("{{")) {
    return text;
  }
  return processMacros(text, { char: input.steerMacros.char, user: input.steerMacros.user, persona: "", scenario: "", env: {} }, STEER_NAMES_REGISTRY);
}

function teachingBlocks(input: LiteReminderInput): string[] {
  const blocks: string[] = [];
  if (input.deception) {
    blocks.push(resolveTeach("rpg.reminder.deceptionTeach", input));
  }
  if (input.omniscience) {
    blocks.push(resolveTeach("rpg.reminder.omniscienceTeach", input));
  }
  if (input.features.immersiveHtml) {
    // The card teach is TWO slots — the interactive/static ASK + the shared worked EXAMPLE (`RPG_CARD_TEACH`
    // was `ASK + EXAMPLE`); resolved separately and re-concatenated so the composed bytes stay identical.
    const ask: ProseSlotId = input.features.immersiveHtmlInteractive ? "rpg.card.askInteractive" : "rpg.card.askStatic";
    blocks.push(resolveTeach(ask, input) + resolveTeach("rpg.card.example", input));
  }
  // P5 §5.4 — the standing CYOA mode: every turn ends with a `:::choices` set. Off ⇒ no teaching (the
  // tokenizer still renders an unprompted fence harmlessly; the wand one-shot covers this-turn-only asks).
  if (input.features.cyoa) {
    blocks.push(resolveTeach("rpg.reminder.cyoaTeach", input));
  }
  return blocks;
}

/** THE THREE ACTOR BLOCKS (R2), partitioned off ONE actor list by two booleans — `actorRef.kind` (a roster
 *  person vs a scene NPC) and `presence` (on stage vs known-but-offstage). All three render through the SAME
 *  {@link actorLine}/{@link offstageLine} grammar, so a plane written onto an NPC can never again reach a
 *  party member's line and not hers. Hoisted out of {@link buildLiteReminder} for the complexity ceiling. */
function actorBlocks(input: LiteReminderInput): string[] {
  const { view } = input;
  const hints = input.features.relationshipHints;
  const attrDefs = input.statProfile.attributes;
  const party = view.actors.filter((a) => a.actorRef.kind !== "cast");
  const onStage = view.actors.filter((a) => a.actorRef.kind === "cast" && a.presence);
  const offstage = view.actors.filter((a) => a.actorRef.kind === "cast" && !a.presence);
  const lines: string[] = [];
  if (party.length > 0) {
    // The attribute VOCABULARY, taught ONCE (label + hint): the sheet's steering lever finally reaching the
    // model. Per-actor lines below carry the numbers under the same labels — one meaning, N readings, never
    // the profile's prose multiplied by the party size (the token budget the gloss has to respect).
    if (attrDefs.length > 0) {
      lines.push(`Attributes: ${attrDefs.map(attributeGloss).join(" · ")}`);
    }
    lines.push("Party:", ...party.map((a) => actorLine(a, attrDefs, hints)));
  }
  if (onStage.length > 0) {
    lines.push(castHeader(onStage, input.prose ?? {}), ...onStage.map((a) => actorLine(a, attrDefs, hints)));
  }
  if (offstage.length > 0) {
    lines.push(resolveProse("rpg.reminder.offstageHeader", input.prose ?? {}).text, ...offstage.map((a) => offstageLine(a, hints)));
  }
  return lines;
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
  stateLines.push(...actorBlocks(input));
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
    // PROSE-1 — the two delta HEADINGS are slots resolved off the preset prose (§4.3). Absent ⇒ shipped defaults.
    prose: input.prose ?? {},
  });
  if (delta !== null) {
    blocks.push(delta);
  }

  blocks.push(resolveTeach("rpg.reminder.steeringLicense", input));

  // The config-gated TEACHING blocks (parity-plus §3.3) — after the license, LAST but for the steering note.
  // P3 teaches the `<lie …/>`/`<ofilter …/>` grammar the `HIDDEN_TAGS` registry recognizes + server-strips;
  // P4 teaches the `:::card` fence (the M3 sub-toggle picks the interactive vs static ask — the ask, never
  // the render).
  //
  // ORDER: teach sits AFTER the license, not between the delta and the license — the license's "let the change
  // land in the fiction" wants its referent (the delta block) immediately before it, and teach instead lands
  // in the last stretch before the user turn (the license, the steering note, and the reconcile note
  // `gather.ts` appends all stack after it), which is the recency position models weight most. Landed on a
  // measured A/B, not on the argument alone — the argument cuts both ways (moving teach last also moves the
  // license off the end).
  blocks.push(...teachingBlocks(input));

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
