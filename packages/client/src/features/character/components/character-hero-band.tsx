// The hero band — the editor's visual centerpiece. Mixes two commit models by design: the name is a draft
// card field (bound to the form → save-bar), while the portrait/star/archive are immediate identity
// commits (`character.update` single-key patches). The accent swatch is a read-only preview of the
// resolved themeOverride — the theme control itself lives in the CONTEXT Appearance tab.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { estimateTokens } from "@orb/kit/tokens";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronRight, Eye, EyeOff, Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { uploadAsset, useInvalidation } from "#data";
import type { AppFormInstance } from "#forms";
import { notify } from "#lib";
import { toggleSpoilerBlur, useSpoilerBlur } from "#state";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { CharacterGreetingPreview } from "./character-greeting-preview";
import { CharacterTagSuggestions } from "./character-tag-suggestions";
import { CharacterTagsRow } from "./character-tags-row";
import { CharacterTokenCounter } from "./character-token-counter";

/** The identity/preview subset of the owner card the hero renders — draft card fields flow through `form`. */
export interface CharacterHeroDetail {
  readonly id: CharacterId;
  readonly handle: string;
  readonly name: string;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly trustHtml: boolean | null;
  readonly avatarHash: string | null;
  readonly themeOverride: ThemeOverride | null;
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
}

export interface CharacterHeroBandProps {
  readonly detail: CharacterHeroDetail;
  readonly form: AppFormInstance<CharacterCardFormValues>;
  readonly trpc: Trpc;
  /** Starts a fresh chat with this character (the surface fires startNewChat + jumps to Chats). */
  readonly onNewChat: () => void;
  /** "N chats ›" — jumps to this character's threads in the Chats section. */
  readonly onViewChats: () => void;
  /** How many chats exist with this character; 0 hides the "N chats ›" affordance. */
  readonly chatCount: number;
  /** The greeting the hero is previewing — lifted to the surface. */
  readonly activeGreetingIndex: number;
  readonly onActiveGreetingIndexChange: (index: number) => void;
}

export function CharacterHeroBand({
  detail,
  form,
  trpc,
  onNewChat,
  onViewChats,
  chatCount,
  activeGreetingIndex,
  onActiveGreetingIndexChange,
}: CharacterHeroBandProps): ReactElement {
  const spoilerBlur = useSpoilerBlur();
  return (
    <Stack gap="section" data-slot="character-hero">
      <Row align="start" gap="block" className="flex-wrap">
        <HeroPortrait detail={detail} trpc={trpc} />
        <Stack className="min-w-0 flex-1" gap="field">
          <Row align="center" gap="row" className="flex-wrap">
            <Stack className="min-w-0 flex-1" gap="field">
              <form.AppField name="name">
                {(field): ReactElement => <field.TextField label="Name" />}
              </form.AppField>
              <form.Subscribe selector={(s): string => s.values.name}>
                {(name): ReactElement => <CharacterTokenCounter tokens={estimateTokens(name)} />}
              </form.Subscribe>
              <Text size="micro" tone="muted" className="font-mono">
                @{detail.handle}
              </Text>
            </Stack>
            <AccentSwatch themeOverride={detail.themeOverride} />
          </Row>
          <HeroActions
            spoilerBlur={spoilerBlur}
            onNewChat={onNewChat}
            onViewChats={onViewChats}
            chatCount={chatCount}
          />
        </Stack>
      </Row>

      <CharacterTagsRow characterId={detail.id} tags={detail.tags} trpc={trpc} />
      <CharacterTagSuggestions characterId={detail.id} trpc={trpc} />

      <CharacterGreetingPreview
        form={form}
        themeOverride={detail.themeOverride}
        trusted={detail.trustHtml === true}
        spoilerBlur={spoilerBlur}
        activeIndex={activeGreetingIndex}
        onActiveIndexChange={onActiveGreetingIndexChange}
      />
    </Stack>
  );
}

/** The click-to-replace portrait — immediate commit (upload-complete = commit). A confirmation ring
 *  flashes on the portrait (no toast). */
function HeroPortrait({
  detail,
  trpc,
}: {
  readonly detail: CharacterHeroDetail;
  readonly trpc: Trpc;
}): ReactElement {
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  const [previewHash, setPreviewHash] = useState<string | null>(detail.avatarHash);
  const [confirming, setConfirming] = useState(false);

  const onFile = async (file: File): Promise<void> => {
    try {
      const stored = await uploadAsset(file, "avatar");
      update.mutate({ characterId: detail.id, input: { avatarAssetId: stored.assetId } });
      setPreviewHash(stored.hash);
      // A static ring flash, no keyframe (reduced-motion-safe by construction); clears itself shortly after.
      setConfirming(true);
      globalThis.setTimeout((): void => setConfirming(false), CONFIRM_MS);
    } catch {
      notify.error("Couldn't upload the portrait.");
    }
  };

  const avatarSrc = previewHash === null ? {} : { src: blobUrl(previewHash) };
  return (
    <FileTrigger
      accept="image/*"
      onFilesSelected={([file]): void => {
        if (file !== undefined) {
          void onFile(file);
        }
      }}
    >
      {({ open }): ReactElement => (
        <Button
          aria-label="Replace portrait"
          intent="ghost"
          size="icon"
          className={
            confirming
              ? "relative size-auto shrink-0 rounded-card ring-2 ring-accent"
              : "relative size-auto shrink-0 rounded-card"
          }
          onClick={open}
        >
          <Avatar hueSeed={detail.id} shape="square" size="hero" {...avatarSrc}>
            {initialsFor(detail.name)}
          </Avatar>
        </Button>
      )}
    </FileTrigger>
  );
}

const CONFIRM_MS = 1500;

/** Read-only accent preview — the theme control itself lives in the CONTEXT Appearance tab. */
function AccentSwatch({
  themeOverride,
}: {
  readonly themeOverride: ThemeOverride | null;
}): ReactElement {
  return (
    <Row gap="field" align="center">
      <ThemeScope className="size-4 shrink-0 rounded-full bg-primary" tokens={themeOverride ?? {}}>
        {null}
      </ThemeScope>
      <Text size="micro" tone="muted" transform="caps">
        Appearance
      </Text>
    </Row>
  );
}

/** The "New chat" primary · the "N chats ›" jump · the spoiler eye (view state). */
function HeroActions({
  spoilerBlur,
  onNewChat,
  onViewChats,
  chatCount,
}: {
  readonly spoilerBlur: boolean;
  readonly onNewChat: () => void;
  readonly onViewChats: () => void;
  readonly chatCount: number;
}): ReactElement {
  return (
    <Row gap="row" align="center" className="flex-wrap">
      <Button type="button" intent="primary" onClick={onNewChat}>
        <Icon icon={MessagesSquare} size="sm" />
        New chat
      </Button>
      {chatCount > 0 ? (
        <Button type="button" intent="ghost" onClick={onViewChats}>
          {chatCount} {chatCount === 1 ? "chat" : "chats"}
          <Icon icon={ChevronRight} size="sm" />
        </Button>
      ) : null}
      <Button
        type="button"
        intent="ghost"
        size="icon"
        aria-label={spoilerBlur ? "Show spoilers" : "Hide spoilers"}
        aria-pressed={spoilerBlur}
        onClick={toggleSpoilerBlur}
      >
        <Icon icon={spoilerBlur ? EyeOff : Eye} size="sm" />
      </Button>
    </Row>
  );
}
