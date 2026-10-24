// Explore's phone topbar names the open dossier, not just the section. The gated cache-first character.get
// read shares the dossier query; inactive mode fetches nothing and null falls back to the section label.
// The client-feature boundary prevents a sideways character-helper import.
//
// With no dossier selected, the surviving mode noun carries useCorpusCensus, the same census the list band
// reads. The phone one-name rule sheds that band's title, so the size otherwise disappears (#1676).

import { useGatedQuery, useTRPC } from "#data";
import type { CorpusDestination } from "#lib";
import { CORPUS_MODE_LABELS, censusTitle } from "#lib";
import { useSelectedCorpusCharacterId, useSelectedCorpusDestination } from "#state";
import { useCorpusCensus } from "../hooks/use-corpus-census.ts";

export function useCorpusSelectionTitle(active: boolean): string | null {
  const trpc = useTRPC();
  const characterId = useSelectedCorpusCharacterId();
  const destination = useSelectedCorpusDestination();
  const { data } = useGatedQuery(active ? characterId : null, (id) => trpc.character.get.queryOptions({ characterId: id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally for
  // exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useCorpusCensus(active);
  if (!active) {
    return null;
  }
  const artifactTitle = destination === null ? null : destinationTitle(destination);
  if (artifactTitle !== null) {
    return artifactTitle;
  }
  const name = data?.name ?? "";
  // THE CENSUS IS THE NO-SELECTION ARM, gated on the SELECTION rather than on "did a name land" (#1676):
  // with a member open this screen is that member's, so an unlanded name heals to the shell's section label,
  // never to the library's size — a true number about the wrong screen is not an improvement on a blank one.
  if (characterId !== null) {
    return name.length === 0 ? null : name;
  }
  return censusTitle(CORPUS_MODE_LABELS.explore, census) ?? CORPUS_MODE_LABELS.explore;
}

function assertDestinationNever(destination: never): never {
  throw new Error(`Missing destination title: ${String(destination)}`);
}

function destinationTitle(destination: CorpusDestination): string | null {
  switch (destination.kind) {
    case "character":
    case "distill":
      return null;
    case "scene":
      return destination.hit.chatTitle ?? destination.characterName;
    case "digest":
      return destination.hit.chatTitle ?? destination.hit.scopedCharacterName ?? "Memory summary";
    case "theme":
      return destination.row.name ?? "Story theme";
    case "cluster":
      return destination.title;
    case "pair":
      return `${destination.pair.nameA} ↔ ${destination.pair.nameB}`;
    case "image":
      return destination.hit.caption ?? "Indexed image";
    case "keyword":
      return destination.keyword;
    case "modelroute":
      return `${destination.route.genre} → ${destination.route.model}`;
    default:
      return assertDestinationNever(destination);
  }
}
