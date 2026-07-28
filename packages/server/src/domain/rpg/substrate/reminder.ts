// domain/rpg/substrate/reminder — the lite STEERING injection assembler (rpg-design/05 §4.7). PURE
// string-building (zero I/O — the gather resolves the rows and hands them in). The reminder is an EPHEMERAL
// gather candidate on `RpgGatherResult.injections` (never a `chat_injections` row — the convergence law,
// §3.3), delivered as ONE depth-0 `role:"system"` injection.
//
// Assembly order (§4.7 + the §2.7 delta insert): (1) the STATE BLOCK per entity — label-as-mini-prompt
// throughout (each roster actor, each cast row, each custom widget, the ambient line, active quests + open
// objectives, the recent journal beats); (2) the DELTA BLOCK — the prev→current snapshot diff (`delta.ts`),
// rendered BEFORE the license so "let the change land in the fiction" has its referent (always on, omitted on
// no-change); (3) the STEERING LICENSE (the versioned constant below — values visibly shape behaviour,
// acknowledge changes, never recite the numbers); (4) `config.lite.steeringNote` — the always-wins user slot, LAST.
//
// NO tool-update guidance here (owner ruling 2026-07-27): the character turn is ALWAYS tool-less prose — state
// is captured by a DEDICATED post-commit round (`runToolRound`/`runExtraction`), so this reminder never asks the
// character turn to call a tool. The "call every applicable tool" checklist now lives in the TOOL ROUND's own
// prompt (`toolRoundSystem`, entry/compose/rpg.ts), where the tools actually fire. This reminder injects the
// tracked state as FLAVOR the character reacts off — steering, not writing.
//
// The license + state-block prose are ARGUED NO-KNOB v1 (§4.11 #4): `steeringNote` IS the designed tuning slot
// (composes last, always-wins). The license is a VERSIONED constant so a copy revision is a legible bump, not a
// silent drift — the marinara-derived line the D86 §4.4 posture ships.

import type { RpgCastField, RpgClockTime, RpgDateMode, RpgRelationship, RpgTrackerView, RpgWeather, TimeOfDay } from "@orb/contracts/rpg";
import { TIME_OF_DAY, TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
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

// The card TEACHING injection (parity-plus §7.5 — owner-authored copy, deliberately SHORT + permissive:
// no schema, no component vocabulary, no allowlist; the sandbox is the wall, §4.2). A versioned constant
// (the RPG_STEERING_LICENSE pattern). Emitted only when `features.immersiveHtml` is on; the M3
// `immersiveHtmlInteractive` sub-toggle picks the variant — it shapes the ASK, never the render (a card
// the model emits renders in the same sandbox either way).
export const RPG_CARD_TEACH =
  'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS/JS, then `:::` on its own line. Make whatever fits the moment — animations, layouts, interactive bits are all welcome. Embed everything inline (no external scripts/fonts/images). Do not wrap it in a code fence.';

// The CYOA teaching block (P5 §5.4 feature 5) — a versioned constant (the RPG_STEERING_LICENSE pattern).
// Teaches the `:::choices` directive fence the tokenizer's `choices` registrant recognizes; the reading
// surface renders the options as clickable send-affordances (§5.2-5.3). Composed ONLY when
// `config.features.cyoa` is on; the wand's one-shot "Offer choices" covers the this-turn-only ask.
export const RPG_CYOA_TEACH =
  "CHOICES: end every response with a set of choices for the player. After your narration, add a line containing exactly :::choices then 3-5 numbered options (1. ...), each a distinct action the player could take next, then a line containing exactly ::: on its own. Keep each option one sentence, concrete, and meaningfully different from the others.";

// The M3 static-ask variant (`immersiveHtmlInteractive: false`) — the calmer table: still cards, no ask
// for scripts/animation. The render is identical (toggle-independent); only the invitation narrows.
export const RPG_CARD_TEACH_STATIC =
  'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS, then `:::` on its own line. Keep it a still visual — no scripts or animations, just an in-world page for the reader. Embed everything inline (no external fonts/images). Do not wrap it in a code fence.';

/** Derive the nearest time-of-day label from a stored clock hour (the ONE inverse of `TIME_OF_DAY_HOURS`,
 *  §2.7 — the banner + the reminder both read the label back through this one home). */
function timeOfDayLabel(clock: RpgClockTime): string {
  let best: TimeOfDay = TIME_OF_DAY[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const label of TIME_OF_DAY) {
    const dist = Math.abs(TIME_OF_DAY_HOURS[label] - clock.hour);
    if (dist < bestDist) {
      bestDist = dist;
      best = label;
    }
  }
  return best;
}

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
    parts.push(dateMode === "structured" ? `day ${ambient.clock.day} · ${timeOfDayLabel(ambient.clock)}` : timeOfDayLabel(ambient.clock));
  }
  if (ambient.weather !== null) {
    parts.push(weatherLine(ambient.weather));
  }
  return parts.join(" · ");
}

function weatherLine(weather: RpgWeather): string {
  return weather.description !== undefined && weather.description !== "" ? `${weather.type} (${weather.description})` : weather.type;
}

/** One roster actor's line — name, className flavor, attributes, pools value/max, wallet, inventory summary,
 *  status. A missing plane is omitted (no phantom "0 gold"). */
/** An actor's volatile-plane segments (hp/pools/wallet/inventory/status/conditions) — hoisted out of `actorLine`
 *  so the identity-plane additions (className/level/attributes) stay under the cognitive-complexity gate.
 *  `poolHints` (#36) glosses each pool with its host-authored MEANING (`mana 5/10 (fuels spellcasting)`)
 *  so the model knows what a pool IS, not just its number — matched by name off `sheet.poolDefs`. */
function volatileSegs(v: NonNullable<RpgTrackerView["actors"][number]["volatile"]>, poolHints: ReadonlyMap<string, string>): string[] {
  const segs: string[] = [];
  if (v.hp !== null) {
    segs.push(`HP ${v.hp.value}/${v.hp.max}`);
  }
  if (v.pools.length > 0) {
    segs.push(
      v.pools
        .map((p) => {
          const hint = poolHints.get(p.name);
          return hint !== undefined && hint !== "" ? `${p.name} ${p.value}/${p.max} (${hint})` : `${p.name} ${p.value}/${p.max}`;
        })
        .join(", "),
    );
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

function actorLine(actor: RpgTrackerView["actors"][number]): string {
  const segs: string[] = [actor.name];
  if (actor.sheet.className !== "") {
    segs.push(`(${actor.sheet.className})`);
  }
  if (actor.sheet.level !== null) {
    segs.push(`Lv ${actor.sheet.level}`); // §2.6 — hand-only level; omitted when null (nullable-honesty)
  }
  const attrs = Object.entries(actor.sheet.attributes);
  if (attrs.length > 0) {
    segs.push(attrs.map(([k, n]) => `${k} ${n}`).join(", "));
  }
  if (actor.volatile !== null) {
    segs.push(...volatileSegs(actor.volatile, new Map(actor.sheet.poolDefs.map((d) => [d.name, d.hint]))));
  }
  return `- ${segs.join(" — ")}`;
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

/** A present character's tracked-field segments (§2.8) — a `meter` field as `label N/max`, a `text` field as
 *  `label: value`, joined against the host-defined field SCHEMAS (only DEFINED fields render; an orphan value
 *  from a deleted field is skipped). Kind-aware + hint-glossed (the hint rides the label as a `title`-class gloss
 *  in the panel; in the reminder it appends inline so the model reads the steering meaning). */
function castFieldSegs(customFields: Readonly<Record<string, string>>, castFields: readonly RpgCastField[]): string[] {
  const segs: string[] = [];
  for (const field of castFields) {
    const raw = customFields[field.key];
    if (raw === undefined) {
      continue;
    }
    if (field.kind === "meter") {
      segs.push(field.max !== undefined ? `${field.label} ${raw}/${field.max}` : `${field.label} ${raw}`);
    } else {
      segs.push(`${field.label}: ${raw}`);
    }
  }
  return segs;
}

function castLine(cast: RpgTrackerView["cast"][number], castFields: readonly RpgCastField[], hints: Readonly<Record<string, string>>): string {
  const segs: string[] = [cast.emoji !== "" ? `${cast.emoji} ${cast.name}` : cast.name];
  if (cast.mood !== "") {
    segs.push(cast.mood);
  }
  const rel = relationshipSeg(cast.relationship, hints);
  if (rel !== null) {
    segs.push(rel);
  }
  segs.push(...castFieldSegs(cast.customFields, castFields));
  return `- ${segs.join(" — ")}`;
}

function widgetLine(widget: RpgTrackerView["widgets"][number]): string {
  const value = widget.value;
  if (value === null) {
    return `- ${widget.def.label}`;
  }
  if (value.value !== undefined) {
    return `- ${widget.def.label}: ${value.value}${value.max !== undefined ? `/${value.max}` : ""}`;
  }
  if (value.items !== undefined) {
    return `- ${widget.def.label}: ${value.items.join(", ")}`;
  }
  return `- ${widget.def.label}`;
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

function questLine(quest: RpgTrackerView["quests"][number]): string {
  const open = quest.objectives.filter((o) => !o.completed);
  const head = `- ${quest.name} [${quest.status}]`;
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
  if (view.actors.length > 0) {
    stateLines.push("Party:");
    stateLines.push(...view.actors.map(actorLine));
  }
  if (view.cast.length > 0) {
    stateLines.push("Present:");
    stateLines.push(...view.cast.map((c) => castLine(c, view.castFields, input.features.relationshipHints)));
  }
  if (view.widgets.length > 0) {
    stateLines.push("Trackers:");
    stateLines.push(...view.widgets.map(widgetLine));
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
    castFields: view.castFields,
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

  const note = input.steeringNote.trim();
  if (note !== "") {
    blocks.push(note);
  }

  return blocks.join("\n\n");
}
