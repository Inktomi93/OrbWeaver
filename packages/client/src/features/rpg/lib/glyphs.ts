// Free-string glyphs use deterministic token matching; closed vocabularies use exhaustive records.
// Icons enter through @orb/ui/icons (ui-satellite-seals-icons).
// Glyphs decorate the adjacent text, which carries the accessible meaning.
import type { RpgRelationshipKind, RpgTrackerShape } from "@orb/contracts/rpg";
import type { LucideIcon } from "@orb/ui/icons";
import {
  Activity,
  Beef,
  Bone,
  BookOpen,
  Cable,
  Coins,
  Crosshair,
  Droplet,
  Flame,
  FlaskConical,
  Gauge,
  Gem,
  Handshake,
  Heart,
  KeyRound,
  Leaf,
  List,
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

// ─── The normalize/tokenize machinery (top-level regexes per the perf lint) ──────────────────────
const NON_TOKEN_RE = /[^a-z0-9\s-]/g;
const TOKEN_SPLIT_RE = /[\s-]+/;

/** The item-NAME keyword map — the fantasy floor, most-specific (longest) token wins. */
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

/** The item-TYPE taxonomy map — the second chance when the name missed. */
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

/** Longest matching keyword wins (most-specific rule); `undefined` when nothing matches. */
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
function resolveItemGlyph(name: string, type: string): LucideIcon {
  return matchTokens(ITEM_NAME_GLYPHS, name) ?? matchTokens(ITEM_TYPE_GLYPHS, type) ?? Package;
}

/** The #37 HOST-pickable item-icon catalog — the curated choices the icon PICKER offers, each a stable
 *  NAME the `rpgInventoryItemSchema.icon` field stores (never a component reference in the blob). Grown
 *  from the seal's fantasy floor; a stored name that later leaves this table falls back to the keyword
 *  resolver (never a blank cell). */
export const ITEM_ICON_CHOICES: Readonly<Record<string, LucideIcon>> = {
  sword: Sword,
  shield: Shield,
  armor: ShieldHalf,
  potion: FlaskConical,
  key: KeyRound,
  scroll: Scroll,
  book: BookOpen,
  map: MapIcon,
  gem: Gem,
  coins: Coins,
  rope: Cable,
  flame: Flame,
  food: Beef,
  herb: Leaf,
  bone: Bone,
  skull: Skull,
  arrow: Crosshair,
  droplet: Droplet,
  star: Star,
  heart: Heart,
  pack: Package,
};

/** Display resolution for an item's glyph (#37): the host-picked `icon` name wins; unset/unknown falls
 *  back to the keyword resolver (`resolveItemGlyph`). */
export function resolveItemIcon(icon: string | undefined, name: string, type: string): LucideIcon {
  return (icon === undefined ? undefined : ITEM_ICON_CHOICES[icon]) ?? resolveItemGlyph(name, type);
}

/** Condition glyph: name keywords → the designed `Activity` fallback. */
export function resolveConditionGlyph(name: string): LucideIcon {
  return matchTokens(CONDITION_GLYPHS, name) ?? Activity;
}

// ─── The CLOSED vocabs — exhaustive mapped Records, never the resolver ─────────────────

/** Relationship kind → glyph (a new kind fails tsc here — the exhaustive-Record discipline). */
export const RELATIONSHIP_GLYPHS: Readonly<Record<RpgRelationshipKind, LucideIcon>> = {
  lover: Heart,
  friend: Star,
  ally: Handshake,
  neutral: Minus,
  enemy: Swords,
  custom: Tag,
};

/** Tracker SHAPE → glyph (exhaustive over `RPG_TRACKER_SHAPES` — a new shape fails tsc here). Replaces the
 *  five-member widget-type table: the unification collapsed those display types into the three real shapes a
 *  tracked value can have (`counter`/`gauge`/`badge` were meters wearing different chrome). */
export const TRACKER_SHAPE_GLYPHS: Readonly<Record<RpgTrackerShape, LucideIcon>> = {
  meter: Gauge,
  text: Type,
  list: List,
};
