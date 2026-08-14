// The hero band — the editor's visual centerpiece. Mixes two commit models by design: the name is a draft
// card field (bound to the form → save-bar), while the portrait/star/archive are immediate identity
// commits (`character.update` single-key patches). The accent swatch is a read-only preview of the
// resolved themeOverride — the theme control itself lives in the CONTEXT Appearance tab.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronRight, Eye, EyeOff, Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useUploadAsset } from "#data";
import type { AppFormInstance } from "#forms";
import { notify } from "#lib";
import { toggleSpoilerBlur, useSpoilerBlur } from "#state";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { usePreviewRenderPolicy } from "../hooks/use-preview-render-policy.ts";
import type { CharacterCardFormValues } from "../lib/character-card-form-model.ts";
import { CharacterGreetingPreview } from "./character-greeting-preview.tsx";
import { CharacterTagSuggestions } from "./character-tag-suggestions.tsx";
import { CharacterTagsRow } from "./character-tags-row.tsx";

/** The identity/preview subset of the owner card the hero renders — draft card fields flow through `form`. */
export interface CharacterHeroDetail {
  readonly id: CharacterId;
  readonly handle: CharacterHandle;
  readonly name: string;
  readonly starred: boolean;
  readonly archived: boolean;
  /** The card's own render-policy OVERRIDE columns — inputs to the policy, never the policy itself: the
   *  greeting preview resolves them against the deployment floor (`usePreviewRenderPolicy`). */
  readonly trustHtml: boolean | null;
  readonly forbidExternalMedia: boolean | null;
  readonly avatarHash: string | null;
  readonly themeOverride: ThemeOverride | null;
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
}

export interface CharacterHeroBandProps {
  readonly detail: CharacterHeroDetail;
  readonly form: AppFormInstance<CharacterCardFormValues>;
  readonly trpc: Trpc;
  /** Starts a fresh chat with this character (the surface fires the shared creation seam + jumps to Chats). */
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
  // DRAFT-TRUST arm 1: the preview paints with the RESOLVED policy (deployment floor × this card's
  // override), not the raw override column — see use-preview-render-policy.ts.
  const previewPolicy = usePreviewRenderPolicy(detail);
  return (
    <Stack gap="section" data-slot="character-hero">
      <Row align="start" gap="block" className="flex-wrap">
        <HeroPortrait detail={detail} trpc={trpc} />
        <Stack className="min-w-0 flex-1" gap="field">
          <Row align="center" gap="row" className="flex-wrap">
            <Stack className="min-w-0 flex-1" gap="field">
              <form.AppField name="name">{(field): ReactElement => <field.TextField label="Name" />}</form.AppField>
              <Text size="micro" tone="muted" className="font-mono">
                @{detail.handle}
              </Text>
            </Stack>
            <AccentSwatch themeOverride={detail.themeOverride} />
          </Row>
          <HeroActions spoilerBlur={spoilerBlur} onNewChat={onNewChat} onViewChats={onViewChats} chatCount={chatCount} />
        </Stack>
      </Row>

      <CharacterTagsRow characterId={detail.id} tags={detail.tags} trpc={trpc} />
      <CharacterTagSuggestions characterId={detail.id} trpc={trpc} />

      <CharacterGreetingPreview
        characterId={detail.id}
        form={form}
        themeOverride={detail.themeOverride}
        trusted={previewPolicy.trustHtml}
        spoilerBlur={spoilerBlur}
        activeIndex={activeGreetingIndex}
        onActiveIndexChange={onActiveGreetingIndexChange}
      />
    </Stack>
  );
}

/** The click-to-replace portrait — immediate commit (upload-complete = commit). A confirmation ring
 *  flashes on the portrait (no toast).
 *
 *  The trigger is `size="media"`, never `size="icon"`: media sizes the button from its child, so the
 *  button box IS the portrait box. Under `size="icon"` the button stayed a 34px control while the 64px
 *  avatar painted outside it — over the "Name" label — and the real click target was the invisible 34px
 *  square (stickler 2026-08-01 F2). */
function HeroPortrait({ detail, trpc }: { readonly detail: CharacterHeroDetail; readonly trpc: Trpc }): ReactElement {
  const invalidation = useInvalidation();
  const upload = useUploadAsset();
  const update = useUpdateCharacter({ trpc, invalidation });
  const [previewHash, setPreviewHash] = useState<string | null>(detail.avatarHash);
  const [confirming, setConfirming] = useState(false);

  const onFile = async (file: File): Promise<void> => {
    try {
      const stored = await upload(file, "avatar");
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
          size="media"
          className={confirming ? "relative shrink-0 rounded-base ring-2 ring-accent" : "relative shrink-0 rounded-base"}
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

/**
 * The card's OWN-LOOK marker — read-only; the theme control lives in the CONTEXT Appearance tab.
 *
 * IT ONLY RENDERS WHEN THERE IS SOMETHING TO MARK, AND IT SAYS WHAT IT MEANS (side-eye 2026-08-03, the
 * cold-first-timer finding). It used to render unconditionally: a bare 16px dot with an ALL-CAPS
 * "APPEARANCE" floating at the right edge of the Name field, no border, no tooltip, no affordance — the
 * reviewer had to read source to learn it meant "this character carries a theme override", and on a card
 * with NO override it painted the global primary, i.e. a marker for a fact that wasn't true. An override-less
 * card now shows nothing (the honest absence), and a card that carries one says so in words the reader can
 * act on.
 */
function AccentSwatch({ themeOverride }: { readonly themeOverride: ThemeOverride | null }): ReactElement | null {
  if (themeOverride === null || Object.keys(themeOverride).length === 0) {
    return null;
  }
  const label = "This card carries its own look — edit it in the Appearance tab.";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Row aria-label={label} gap="field" align="center" role="img">
            <ThemeScope className="size-4 shrink-0 rounded-full bg-primary ring-1 ring-border" tokens={themeOverride}>
              {null}
            </ThemeScope>
            <Text size="micro" tone="muted" transform="caps">
              Own look
            </Text>
          </Row>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
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
