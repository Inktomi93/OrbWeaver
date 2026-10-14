// The user seed's ONE manifest (D263): every item an account is seeded with, keyed and kinded. The seed is
// content, never a conversation, so no room or transcript appears here. Each key is recorded once in the
// account's seed ledger, so an item the user deleted is never seeded again and an item a later build adds
// here reaches existing accounts on their next boot.

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SeedManifestItem } from "./contract/index.ts";

function character(handle: string): SeedManifestItem {
  return { kind: "character", key: `character:${handle}`, handle: castId<CharacterHandle>(handle) };
}

type RosterItem = Extract<SeedManifestItem, { readonly kind: "rosterPreset" }>;

function roster(slug: string, name: string, description: string, handles: readonly string[]): RosterItem {
  return {
    kind: "rosterPreset",
    key: `roster:${slug}`,
    name,
    description,
    characters: handles.map((handle) => castId<CharacterHandle>(handle)),
    startsGame: false,
  };
}

/** A roster whose start is an RPG campaign: the room is born with its game. */
function campaign(slug: string, name: string, description: string, handles: readonly string[]): RosterItem {
  return { ...roster(slug, name, description, handles), startsGame: true };
}

/** Every seeded item, in seed order: characters before the roster presets that seat them. */
export const SEED_MANIFEST: readonly SeedManifestItem[] = [
  character("charlotte"),
  character("jfc-coder"),
  character("niko"),
  character("hana"),
  character("morgatha"),
  character("sabine"),
  character("birdie"),
  character("kohaku"),
  character("calamity"),
  character("elias"),
  { kind: "persona", key: "persona:default" },
  roster("ashen-spire", "The Ashen Spire", "A dark lady, the knight she hired, and a sword with opinions.", ["morgatha", "sabine", "calamity"]),
  roster("midnight-run", "Midnight Run", "Two night owls, one convenience store, and a cursed apartment.", ["niko", "kohaku"]),
  roster("second-opinion", "Second Opinion", "Charlotte drafts it, JFC tears it down.", ["charlotte", "jfc-coder"]),
  campaign(
    "storm-the-spire",
    "Storm the Spire",
    "An RPG campaign: you and a sellsword knight take the contract on the Ashen Spire, and its undying queen is expecting you.",
    ["sabine", "morgatha"],
  ),
];
