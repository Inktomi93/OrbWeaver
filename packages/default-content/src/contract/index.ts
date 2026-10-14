// Package-owned seed manifest and reader results; shipped content remains in its owning modules.
import type { CharacterHandle } from "@orb/kit/ids";

/** The kinds of seeded item; the seeder handles each kind in its own door. */
export const SEED_ITEM_KINDS = ["character", "persona", "rosterPreset"] as const;

/** One seeded item. `key` is the ledger key and never changes once shipped: renaming it reseeds the item. */
export type SeedManifestItem =
  /** A shipped card, by its handle; the server's card pack holds its content, avatar, greetings and scene plate. */
  | { readonly kind: "character"; readonly key: string; readonly handle: CharacterHandle }
  /** The default `{{user}}` persona. Only an automation-started stack receives it; a person names their own
   *  persona in the first-run step (D263), so the item stays unrecorded on their account. */
  | { readonly kind: "persona"; readonly key: string }
  /** A roster preset over seeded characters, which starts a chat in one action. `startsGame` makes that start
   *  a game too: the seeder stores rpg's default game template on the preset (D264). */
  | {
      readonly kind: "rosterPreset";
      readonly key: string;
      readonly name: string;
      readonly description: string;
      readonly characters: readonly CharacterHandle[];
      readonly startsGame: boolean;
    };

/** One shipped asset's bytes + the mime that matches them. */
export interface SeedAssetBytes {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

/** One shipped scene plate: the file `slug` (`backgrounds/<slug>.jpg`) and the display NAME the seeded
 *  background-library entry wears. The label lives beside the bytes rather than in a contract catalog — it
 *  IS content, and its only reader is the seeder that writes the library entry. */
export interface SeedBackgroundPlate {
  readonly slug: string;
  readonly label: string;
}

/** The encoder space and native vector returned by the seed cache. */
export interface SeedEmbeddingResult {
  readonly model: string;
  readonly vector: Float32Array<ArrayBuffer>;
}
