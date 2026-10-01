import type { Archetype, ModelRoutingRow, ThemeRow, VisualArchetype } from "@orb/contracts/discovery";
import type { CorpusDigestSource, DigestSourceHit, DiscoverSegment, ImageSearchHit } from "@orb/contracts/search";
import type { CharacterId, ChatId } from "@orb/kit/ids";

type Cluster = Archetype | VisualArchetype;

export const CORPUS_DESTINATION_KINDS = ["character", "scene", "digest", "distill", "theme", "cluster", "pair", "image", "keyword", "modelroute"] as const;

/** Explore retains complete producer snapshots so section navigation cannot erase the selected evidence. */
export type CorpusDestination =
  | { readonly kind: "character"; readonly characterId: CharacterId }
  | { readonly kind: "distill"; readonly characterId: CharacterId }
  | { readonly kind: "scene"; readonly hit: DiscoverSegment; readonly characterName: string; readonly rank: number | null }
  | { readonly kind: "digest"; readonly hit: DigestSourceHit | CorpusDigestSource; readonly rank: number | null }
  | { readonly kind: "theme"; readonly row: ThemeRow }
  | { readonly kind: "cluster"; readonly cluster: Cluster; readonly visual: boolean; readonly k: number | null; readonly title: string }
  | {
      readonly kind: "pair";
      readonly pair:
        | {
            readonly kind: "characters";
            readonly idA: CharacterId;
            readonly idB: CharacterId;
            readonly nameA: string;
            readonly nameB: string;
            readonly score: number | null;
          }
        | {
            readonly kind: "chats";
            readonly idA: ChatId;
            readonly idB: ChatId;
            readonly nameA: string;
            readonly nameB: string;
            readonly score: number;
            readonly relation: string;
          };
    }
  | { readonly kind: "image"; readonly hit: ImageSearchHit }
  | { readonly kind: "keyword"; readonly keyword: string; readonly frequency: number | null; readonly frequencyScope: string }
  | { readonly kind: "modelroute"; readonly route: ModelRoutingRow };

/** Identity keys remount reading surfaces when the evidence subject changes. */
export function corpusDestinationIdentity(destination: CorpusDestination): string {
  switch (destination.kind) {
    case "character":
    case "distill":
      return `${destination.kind}:${destination.characterId}`;
    case "scene":
    case "digest":
      return `${destination.kind}:${destination.hit.source.rowId}:${destination.hit.source.generationId}:${destination.hit.source.contentHash}`;
    case "theme":
      return `theme:${destination.row.id}`;
    case "cluster":
      return `cluster:${destination.cluster.passId}:${destination.cluster.members
        .map((member) => member.characterId)
        .toSorted()
        .join("|")}`;
    case "pair":
      return `pair:${destination.pair.kind}:${destination.pair.idA}:${destination.pair.idB}`;
    case "image":
      return `image:${destination.hit.assetId}`;
    case "keyword":
      return `keyword:${destination.keyword}`;
    case "modelroute":
      return `modelroute:${destination.route.genre}:${destination.route.model}:${destination.route.provider ?? ""}`;
    default:
      return assertDestinationNever(destination);
  }
}
function assertDestinationNever(destination: never): never {
  throw new Error(`Missing artifact identity: ${String(destination)}`);
}
