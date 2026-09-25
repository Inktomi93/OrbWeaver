// The user seed's ONE manifest (D263): every item an account is seeded with, keyed and kinded. The seed is
// content, never a conversation, so no room or transcript appears here. Each key is recorded once in the
// account's seed ledger, so an item the user deleted is never seeded again and an item a later build adds
// here reaches existing accounts on their next boot.

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The kinds of seeded item; the seeder handles each kind in its own door. */
export const SEED_ITEM_KINDS = ["character", "persona", "rosterPreset"] as const;
export type SeedItemKind = (typeof SEED_ITEM_KINDS)[number];

/** One seeded item. `key` is the ledger key and never changes once shipped: renaming it reseeds the item. */
export type SeedManifestItem =
  /** A shipped card, by its handle; the server's card pack holds its content, avatar, greetings and scene plate. */
  | { readonly kind: "character"; readonly key: string; readonly handle: CharacterHandle }
  /** The default `{{user}}` persona. Only an automation-started stack receives it; a person names their own
   *  persona in the first-run step (D263), so the item stays unrecorded on their account. */
  | { readonly kind: "persona"; readonly key: string }
  /** A roster preset over seeded characters, which starts a chat in one action. */
  | {
      readonly kind: "rosterPreset";
      readonly key: string;
      readonly name: string;
      readonly description: string;
      readonly characters: readonly CharacterHandle[];
    };

function character(handle: string): SeedManifestItem {
  return { kind: "character", key: `character:${handle}`, handle: castId<CharacterHandle>(handle) };
}

function roster(slug: string, name: string, description: string, handles: readonly string[]): SeedManifestItem {
  return { kind: "rosterPreset", key: `roster:${slug}`, name, description, characters: handles.map((handle) => castId<CharacterHandle>(handle)) };
}

/** Every seeded item, in seed order: characters before the roster presets that seat them. */
export const SEED_MANIFEST: readonly SeedManifestItem[] = [
  character("assistant"),
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
  roster("second-opinion", "Second Opinion", "Charlotte drafts it, JFC tears it down.", ["assistant", "jfc-coder"]),
];
