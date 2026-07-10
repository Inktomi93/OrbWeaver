// The §6.1 hero band — the editor's visual centerpiece (a face and a voice, pinned above the Main/Advanced
// tabs). Composition ONLY over built primitives (no new seal). It mixes the two commit models by DESIGN
// (§2): the NAME is a DRAFT card field (bound to the form → the save-bar), while the portrait, star, and
// archive are IMMEDIATE identity commits (`character.update` single-key patches, never the save-bar, never
// the dirty pill). The accent swatch is a READ-ONLY preview of the resolved themeOverride (the theme control
// itself is single-homed in the Wave-3 CONTEXT Appearance tab — a preview here, not a second editor). The
// spoiler eye is pure device-local view state. The greeting bubble + tags row are their own components.
//
// avatar kind = "avatar" (a raw uploaded image, the persona-panel-row precedent) — a full card PNG is the
// import path, not a click-to-replace portrait.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { estimateTokens } from "@orb/kit/tokens";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve every glyph + Icon fine (the character-card.tsx precedent).
import { Archive, Eye, EyeOff, Icon, MessagesSquare, Star } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
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

/** The identity/preview subset of the owner card the hero renders (the surface passes it from `character.get`
 *  — the DRAFT card fields flow through the `form` instead). */
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
  /** §6.1/§9c "Start chat" (resume-or-new — the surface computes the target from the LIST's reverse read). */
  readonly onStartChat: () => void;
  /** The greeting the hero is previewing (drives the §6.5 total; lifted to the surface). */
  readonly activeGreetingIndex: number;
  readonly onActiveGreetingIndexChange: (index: number) => void;
}

export function CharacterHeroBand({
  detail,
  form,
  trpc,
  onStartChat,
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
            detail={detail}
            trpc={trpc}
            spoilerBlur={spoilerBlur}
            onStartChat={onStartChat}
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

/** The click-to-replace portrait — IMMEDIATE commit (upload-complete = commit, §2/§6.1). A confirmation ring
 *  flashes on the portrait (no toast). A hidden file input backs the click (the persona-panel-row precedent). */
function HeroPortrait({
  detail,
  trpc,
}: {
  readonly detail: CharacterHeroDetail;
  readonly trpc: Trpc;
}): ReactElement {
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewHash, setPreviewHash] = useState<string | null>(detail.avatarHash);
  const [confirming, setConfirming] = useState(false);

  const onFile = async (file: File): Promise<void> => {
    try {
      const stored = await uploadAsset(file, "avatar");
      update.mutate({ characterId: detail.id, input: { avatarAssetId: stored.assetId } });
      setPreviewHash(stored.hash);
      // The portrait-ring pulse confirmation (§6.1) — a static ring flash, no keyframe (reduced-motion-safe
      // by construction); clears itself shortly after.
      setConfirming(true);
      globalThis.setTimeout((): void => setConfirming(false), CONFIRM_MS);
    } catch {
      notify.error("Couldn't upload the portrait.");
    }
  };

  const avatarSrc = previewHash === null ? {} : { src: blobUrl(previewHash) };
  return (
    <>
      <Button
        aria-label="Replace portrait"
        intent="ghost"
        size="icon"
        className={
          confirming
            ? "relative size-auto shrink-0 rounded-card ring-2 ring-accent"
            : "relative size-auto shrink-0 rounded-card"
        }
        onClick={(): void => fileRef.current?.click()}
      >
        <Avatar hueSeed={detail.id} shape="square" size="hero" {...avatarSrc}>
          {initialsFor(detail.name)}
        </Avatar>
      </Button>
      <input
        aria-label="Upload portrait file"
        accept="image/*"
        hidden={true}
        ref={fileRef}
        onChange={(event): void => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) {
            void onFile(file);
          }
        }}
      />
    </>
  );
}

const CONFIRM_MS = 1500;

/** Read-only accent preview (§6.1) — painted via `<ThemeScope>` (the gate-enforced path a themeOverride
 *  reaches the DOM; character-card.tsx precedent). The theme CONTROL lives in the Wave-3 CONTEXT Appearance
 *  tab; this is a preview, not a second editing home. */
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

/** Star / Archive (IMMEDIATE identity commits) · the spoiler eye (view state) · the "Start chat" primary. */
function HeroActions({
  detail,
  trpc,
  spoilerBlur,
  onStartChat,
}: {
  readonly detail: CharacterHeroDetail;
  readonly trpc: Trpc;
  readonly spoilerBlur: boolean;
  readonly onStartChat: () => void;
}): ReactElement {
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  return (
    <Row gap="row" align="center" className="flex-wrap">
      <Button type="button" intent="primary" onClick={onStartChat}>
        <Icon icon={MessagesSquare} size="sm" />
        Start chat
      </Button>
      <Button
        type="button"
        intent="ghost"
        size="icon"
        aria-label={detail.starred ? "Unstar" : "Star"}
        aria-pressed={detail.starred}
        onClick={(): void =>
          update.mutate({ characterId: detail.id, input: { starred: !detail.starred } })
        }
      >
        <Icon icon={Star} size="sm" />
      </Button>
      <Button
        type="button"
        intent="ghost"
        size="icon"
        aria-label={detail.archived ? "Unarchive" : "Archive"}
        aria-pressed={detail.archived}
        onClick={(): void =>
          update.mutate({ characterId: detail.id, input: { archived: !detail.archived } })
        }
      >
        <Icon icon={Archive} size="sm" />
      </Button>
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
