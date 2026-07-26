// domain/rpg/substrate/reminder — the lite STEERING injection assembler (rpg-design/05 §4.7). PURE
// string-building (zero I/O — the gather resolves the rows and hands them in). The reminder is an EPHEMERAL
// gather candidate on `RpgGatherResult.injections` (never a `chat_injections` row — the convergence law,
// §3.3), delivered as ONE depth-0 `role:"system"` injection.
//
// Assembly order (§4.7): (1) the STATE BLOCK per entity — label-as-mini-prompt throughout (each roster actor,
// each cast row, each custom widget, the ambient line, active quests + open objectives, the recent journal
// beats); (2) the STEERING LICENSE (the versioned constant below — values visibly shape behaviour, acknowledge
// changes, never recite the numbers); (3) UPDATE GUIDANCE — tool-capable turns ONLY (which tool maintains which
// plane; the honest degrade on a non-tool turn is DESIGNED, §4.6); (4) `config.lite.steeringNote` — the
// always-wins user slot, LAST.
//
// The license + state-block prose are ARGUED NO-KNOB v1 (§4.11 #4): `steeringNote` IS the designed tuning slot
// (composes last, always-wins). The license is a VERSIONED constant so a copy revision is a legible bump, not a
// silent drift — the marinara-derived line the D86 §4.4 posture ships.

import type { RpgClockTime, RpgTrackerView, RpgWeather, TimeOfDay } from "@orb/contracts/rpg";
import { TIME_OF_DAY, TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import type { LiteReminderInput } from "../contract/params";

/** The steering LICENSE (§4.7 #2) — a VERSIONED constant (a bump = a legible copy revision, never a silent
 *  drift; the marinara-derived line): the tracked values visibly shape behaviour, dialogue, and scene;
 *  acknowledge a change when it happens; NEVER recite the raw numbers back at the player. */
export const RPG_STEERING_LICENSE =
  "These tracked values are live state for THIS story — let them visibly shape behaviour, dialogue, and the scene as you narrate. When a value changes, let the change land in the fiction. Never recite the raw numbers back at the player; weave them into the prose.";

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

function ambientLine(ambient: NonNullable<RpgTrackerView["ambient"]>): string {
  const parts: string[] = [];
  if (ambient.location !== "") {
    parts.push(ambient.location);
  }
  if (ambient.calendarDate !== null) {
    parts.push(ambient.calendarDate);
  }
  if (ambient.clock !== null) {
    parts.push(`day ${ambient.clock.day} · ${timeOfDayLabel(ambient.clock)}`);
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
function actorLine(actor: RpgTrackerView["actors"][number]): string {
  const segs: string[] = [actor.name];
  if (actor.sheet.className !== "") {
    segs.push(`(${actor.sheet.className})`);
  }
  const attrs = Object.entries(actor.sheet.attributes);
  if (attrs.length > 0) {
    segs.push(attrs.map(([k, n]) => `${k} ${n}`).join(", "));
  }
  const v = actor.volatile;
  if (v !== null) {
    if (v.hp !== null) {
      segs.push(`HP ${v.hp.value}/${v.hp.max}`);
    }
    if (v.pools.length > 0) {
      segs.push(v.pools.map((p) => `${p.name} ${p.value}/${p.max}`).join(", "));
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
  }
  return `- ${segs.join(" — ")}`;
}

function castLine(cast: RpgTrackerView["cast"][number]): string {
  const segs: string[] = [cast.emoji !== "" ? `${cast.emoji} ${cast.name}` : cast.name];
  if (cast.mood !== "") {
    segs.push(cast.mood);
  }
  const custom = Object.entries(cast.customFields);
  if (custom.length > 0) {
    segs.push(custom.map(([k, val]) => `${k}: ${val}`).join(", "));
  }
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

function questLine(quest: RpgTrackerView["quests"][number]): string {
  const open = quest.objectives.filter((o) => !o.completed);
  const head = `- ${quest.name} [${quest.status}]`;
  if (open.length === 0) {
    return head;
  }
  return `${head}\n${open.map((o) => `  ○ ${o.text}`).join("\n")}`;
}

/** The tool→plane guidance lines (§4.7 #3) — emitted only on a tool-capable turn (a non-tool turn is never
 *  asked to write what it can't). */
const UPDATE_GUIDANCE = [
  "Maintain the tracked state as the story moves, using these tools:",
  "- update_party — HP, pools, conditions, status on any actor",
  "- update_inventory — items and wallet",
  "- update_scene — location, time, weather, present cast",
  "- set_widget_value — custom trackers",
  "- upsert_quest — quest goals and objectives",
  "- add_journal_entry — log a notable beat",
].join("\n");

/** Build the lite steering reminder (§4.7). Returns the assembled block; the gather wraps it as ONE depth-0
 *  `role:"system"` `ChatInjection`. Empty sections are omitted so a fresh game's reminder is just the license
 *  (+ guidance/note) — no phantom empty headers. */
export function buildLiteReminder(input: LiteReminderInput): string {
  const { view } = input;
  const blocks: string[] = [];

  const stateLines: string[] = [];
  if (view.ambient !== null) {
    const line = ambientLine(view.ambient);
    if (line !== "") {
      stateLines.push(`Scene: ${line}`);
    }
  }
  if (view.actors.length > 0) {
    stateLines.push("Party:");
    stateLines.push(...view.actors.map(actorLine));
  }
  if (view.cast.length > 0) {
    stateLines.push("Present:");
    stateLines.push(...view.cast.map(castLine));
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

  blocks.push(RPG_STEERING_LICENSE);

  if (input.toolCapable) {
    blocks.push(UPDATE_GUIDANCE);
  }

  const note = input.steeringNote.trim();
  if (note !== "") {
    blocks.push(note);
  }

  return blocks.join("\n\n");
}
