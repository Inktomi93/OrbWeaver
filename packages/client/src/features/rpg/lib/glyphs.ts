// The MODEL-AUTHORED-STRING → GLYPH resolver (panel-redesign DESIGN.md §12.5) — ONE home for every
// "what icon does this free string get" decision: inventory items, condition chips, the waystone's
// weather overlay, plus the CLOSED-vocab Records (relationship kinds, widget types) that are exhaustive
// mapped types, never the resolver. Pure data, deterministic TOKEN matching only (no fuzzy-distance dep,
// no LLM call — testable as a table). Icons come exclusively through the curated `@orb/ui/icons` seal
// (dep-cruiser `ui-satellite-seals`); every name here is a verified export added to that seal.
// A11y: every glyph rendered from this module is DECORATION (aria-hidden via `<Icon>` without `label`);
// the NAME text on the cell/chip stays the datum (the tracker-kit a11y model).

import type { RpgRelationshipKind, RpgWidgetType } from "@orb/contracts/rpg";
import type { LucideIcon } from "@orb/ui/icons";
import {
  Activity,
  Award,
  Beef,
  Bone,
  BookOpen,
  Cable,
  CircleGauge,
  Coins,
  Crosshair,
  Droplet,
  Flame,
  FlaskConical,
  Gauge,
  Gem,
  Handshake,
  Hash,
  Heart,
  KeyRound,
  Leaf,
  MapIcon,
  Minus,
  Package,
  Scroll,
  Shield,
  ShieldHalf,
  Skull,
  Star,
  Sword,
  Swords,
  Tag,
  Type,
} from "@orb/ui/icons";
import type { WaystoneWeather } from "@orb/ui/meter";

// ─── The normalize/tokenize machinery (top-level regexes per the perf lint) ──────────────────────
const NON_TOKEN_RE = /[^a-z0-9\s-]/g;
const TOKEN_SPLIT_RE = /[\s-]+/;

/** The item-NAME keyword map (§12.5.1) — the fantasy floor, most-specific (longest) token wins. */
const ITEM_NAME_GLYPHS: Readonly<Record<string, LucideIcon>> = {
  key: KeyRound,
  keys: KeyRound,
  dagger: Sword,
  blade: Sword,
  sword: Sword,
  knife: Sword,
  axe: Sword,
  spear: Sword,
  potion: FlaskConical,
  flask: FlaskConical,
  vial: FlaskConical,
  poultice: FlaskConical,
  elixir: FlaskConical,
  tonic: FlaskConical,
  rope: Cable,
  chain: Cable,
  ration: Beef,
  rations: Beef,
  bread: Beef,
  food: Beef,
  meat: Beef,
  cheese: Beef,
  oil: Droplet,
  drop: Droplet,
  water: Droplet,
  wine: Droplet,
  ale: Droplet,
  dart: Crosshair,
  needle: Crosshair,
  arrow: Crosshair,
  arrows: Crosshair,
  bolt: Crosshair,
  torch: Flame,
  lantern: Flame,
  candle: Flame,
  tinderbox: Flame,
  coin: Coins,
  coins: Coins,
  purse: Coins,
  gold: Coins,
  silver: Coins,
  map: MapIcon,
  chart: MapIcon,
  scroll: Scroll,
  letter: Scroll,
  note: Scroll,
  parchment: Scroll,
  book: BookOpen,
  tome: BookOpen,
  journal: BookOpen,
  grimoire: BookOpen,
  shield: Shield,
  buckler: Shield,
  armor: ShieldHalf,
  armour: ShieldHalf,
  mail: ShieldHalf,
  helm: ShieldHalf,
  gem: Gem,
  jewel: Gem,
  ruby: Gem,
  amulet: Gem,
  ring: Gem,
  herb: Leaf,
  herbs: Leaf,
  leaf: Leaf,
  moss: Leaf,
  bone: Bone,
  bones: Bone,
  skull: Skull,
};

/** The item-TYPE taxonomy map (§12.5.2) — the second chance when the name missed. */
const ITEM_TYPE_GLYPHS: Readonly<Record<string, LucideIcon>> = {
  weapon: Sword,
  consumable: FlaskConical,
  potion: FlaskConical,
  food: Beef,
  armor: ShieldHalf,
  armour: ShieldHalf,
  currency: Coins,
  treasure: Gem,
  document: Scroll,
  quest: Scroll,
  tool: Package,
  key: KeyRound,
};

/** Condition-name keywords — a small map over the same mechanism; `Activity` is the designed fallback. */
const CONDITION_GLYPHS: Readonly<Record<string, LucideIcon>> = {
  poisoned: FlaskConical,
  poison: FlaskConical,
  burning: Flame,
  burned: Flame,
  bleeding: Droplet,
  wounded: Droplet,
  blessed: Star,
  cursed: Skull,
  charmed: Heart,
};

/** Normalize + tokenize a model-authored string for table matching (lowercase, punctuation stripped). */
function tokensOf(raw: string): readonly string[] {
  return raw
    .toLowerCase()
    .replace(NON_TOKEN_RE, " ")
    .split(TOKEN_SPLIT_RE)
    .filter((t) => t.length > 0);
}

/** Longest matching keyword wins (most-specific rule, §12.5.1); `undefined` when nothing matches. */
function matchTokens(map: Readonly<Record<string, LucideIcon>>, raw: string): LucideIcon | undefined {
  let best: LucideIcon | undefined;
  let bestLen = 0;
  for (const token of tokensOf(raw)) {
    const hit = map[token];
    if (hit !== undefined && token.length > bestLen) {
      best = hit;
      bestLen = token.length;
    }
  }
  return best;
}

/** Item glyph: name keywords → type taxonomy → the designed `Package` fallback (never a blank). */
export function resolveItemGlyph(name: string, type: string): LucideIcon {
  return matchTokens(ITEM_NAME_GLYPHS, name) ?? matchTokens(ITEM_TYPE_GLYPHS, type) ?? Package;
}

/** Condition glyph: name keywords → the designed `Activity` fallback. */
export function resolveConditionGlyph(name: string): LucideIcon {
  return matchTokens(CONDITION_GLYPHS, name) ?? Activity;
}

/** Weather-overlay keyword map (§12.5.6) — the free `weather.type` string resolves onto the waystone's
 *  CLOSED overlay vocabulary; `null` = no overlay (the band text still names the weather — text is the
 *  datum, the sky just stays plain). The Scene ambient line shares this one weather-vocabulary home. */
const WEATHER_OVERLAYS: Readonly<Record<string, WaystoneWeather>> = {
  clear: "clear",
  sun: "clear",
  sunny: "clear",
  fair: "clear",
  cloudless: "clear",
  rain: "rain",
  raining: "rain",
  rainy: "rain",
  drizzle: "rain",
  shower: "rain",
  showers: "rain",
  downpour: "rain",
  storm: "storm",
  stormy: "storm",
  thunder: "storm",
  thunderstorm: "storm",
  lightning: "storm",
  tempest: "storm",
  snow: "snow",
  snowing: "snow",
  sleet: "snow",
  hail: "snow",
  blizzard: "snow",
  flurries: "snow",
  fog: "fog",
  foggy: "fog",
  mist: "fog",
  misty: "fog",
  haze: "fog",
  hazy: "fog",
  smoke: "fog",
};

/** Resolve a free weather string onto the waystone overlay vocab (`null` = unresolvable ⇒ no overlay). */
export function resolveWeatherOverlay(type: string): WaystoneWeather | null {
  const map: Readonly<Record<string, WaystoneWeather | undefined>> = WEATHER_OVERLAYS;
  let best: WaystoneWeather | undefined;
  let bestLen = 0;
  for (const token of tokensOf(type)) {
    const hit = map[token];
    if (hit !== undefined && token.length > bestLen) {
      best = hit;
      bestLen = token.length;
    }
  }
  return best ?? null;
}

// ─── The CLOSED vocabs — exhaustive mapped Records, never the resolver (§12.5.5) ─────────────────

/** Relationship kind → glyph (a new kind fails tsc here — the exhaustive-Record discipline). */
export const RELATIONSHIP_GLYPHS: Readonly<Record<RpgRelationshipKind, LucideIcon>> = {
  lover: Heart,
  friend: Star,
  ally: Handshake,
  neutral: Minus,
  enemy: Swords,
  custom: Tag,
};

/** Widget type → glyph (exhaustive over `RPG_WIDGET_TYPES`). */
export const WIDGET_TYPE_GLYPHS: Readonly<Record<RpgWidgetType, LucideIcon>> = {
  meter: Gauge,
  counter: Hash,
  gauge: CircleGauge,
  badge: Award,
  text: Type,
};
