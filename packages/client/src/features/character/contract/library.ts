// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

import type { CharacterDetail, CharacterSummary, ListCharacterTagGroupsResult } from "@orb/contracts/character";
import type { TagView } from "@orb/contracts/tag";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

export type CharacterCardItem = Pick<
  CharacterSummary,
  "id" | "name" | "handle" | "nameIsAmbiguous" | "archived" | "starred" | "avatarHash" | "elevatorPitch" | "themeOverride" | "tokenSize"
> & {
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard" | "folderType">[];
};

export type CharacterHeroDetail = Pick<
  CharacterDetail,
  "id" | "handle" | "name" | "starred" | "archived" | "trustHtml" | "forbidExternalMedia" | "interactiveHtml" | "avatarHash" | "themeOverride"
> & {
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
};

export type LibraryScopeArgs = Pick<
  Exclude<inferInput<Trpc["character"]["list"]>, void>,
  "search" | "starred" | "archived" | "includeTagIds" | "excludeTagIds"
>;

export type RowTag = Pick<TagView, "id" | "name" | "isHiddenOnCard" | "folderType">;

export type FilterableRow = { readonly [K in keyof Pick<CharacterSummary, "tags">]: readonly RowTag[] };

export type TagGroupCensus = ListCharacterTagGroupsResult;
