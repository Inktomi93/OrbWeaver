// The hero band — the editor's visual centerpiece. Mixes two commit models by design: the name is a draft
// card field (bound to the form → save-bar), while the portrait is an immediate identity commit
// (`character.update` single-key patches). The accent swatch is a read-only preview of the
// resolved themeOverride — the theme control itself lives in the CONTEXT **Options** tab (the tab that
// merged the former Appearance + History tabs; `character-options-tab.tsx` mounts `CharacterAppearanceTab`
// inside it, and the COMPONENT kept the old name while the TAB did not).
//
// TRUTH-REPAIR 2026-08-30 (#838): this header used to claim "the portrait/star/archive are immediate
// identity commits" here. The band renders NEITHER a star nor an archive control and never has on this
// tree — `archived` arrives only as a prop the band reads for display. Archive's affordances for an open
// character now live in the CONTEXT pane's `Character actions` kebab (the `open` slice of
// `../lib/character-actions.ts`); the star lives on the list row.

import { blobUrl } from "@orb/contracts/assets";
import { rendersTrustedHtml } from "@orb/contracts/chat";
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
import { useInvalidation, useUploadAsset, useUploadCaps } from "#data";
import type { AppFormInstance } from "#forms";
import { notify, oversizeUploadMessage } from "#lib";
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
  /** The third override column (#111) — carried so this subset still satisfies `RenderPolicyOverride`
   *  whole; the greeting preview renders no card frame, so nothing here reads the resolved value. */
  readonly interactiveHtml: boolean | null;
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
              <Text voice="gloss" className="font-mono">
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
        trusted={rendersTrustedHtml(previewPolicy.htmlTrust)}
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
  const uploadCaps = useUploadCaps();
  const update = useUpdateCharacter({ trpc, invalidation });
  const [previewHash, setPreviewHash] = useState<string | null>(detail.avatarHash);
  const [confirming, setConfirming] = useState(false);

  const onFile = async (file: File): Promise<void> => {
    // `FileTrigger` (unlike `FileDropzone`) carries no size ceiling of its own — pre-check against the
    // served route cap (`UploadCaps.assetUpload`) before the multipart POST, same pattern as the
    // `.image`/`.databankUpload` FileDropzone consumers (census #72 item 1).
    const oversize = oversizeUploadMessage(file, uploadCaps.assetUpload);
    if (oversize !== undefined) {
      notify.error(oversize);
      return;
    }
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
  // NO call-site radius (#169). `size="media"` is `size-auto p-0`, so this button's border box IS the
  // Avatar's — its confirm ring and hover fill have to trace the Avatar's own corner, which
  // `shape="square"` puts at `--radius-control`, i.e. Button's own default `shape="control"`. The
  // `rounded-base` that used to sit here rendered as nothing: `--radius-*` was opaque to tailwind-merge,
  // both classes survived, and the stylesheet emits `.rounded-control` after `.rounded-base`
  // (alphabetical within the family). Registering the radius namespace hands the merge to the call site,
  // which would have opened a 2px corner gap between the confirm ring and the portrait it confirms.
  const triggerClass = confirming ? "relative shrink-0 ring-2 ring-accent" : "relative shrink-0";
  return (
    <FileTrigger
      accept="image/*"
      onFilesSelected={([file]): void => {
        if (file !== undefined) {
          onFile(file).catch(() => notify.error("Couldn't upload the portrait."));
        }
      }}
    >
      {({ open }): ReactElement => (
        <Button aria-label="Replace portrait" intent="ghost" size="media" className={triggerClass} onClick={open}>
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
 * The card's OWN-LOOK marker — read-only; the theme control lives in the CONTEXT Options tab.
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
  // IT NAMES A TAB THAT EXISTS (side-eye 2026-08-18 P2-7), AND IT KEEPS DOING SO. It used to point at "the
  // Appearance tab" — there was none on Characters, while the Settings modal DOES have an "Appearance"
  // category, so anyone who followed the sentence landed in the wrong surface entirely. That fixed name
  // ("the Options tab") then aged out too when #841/#860 split Options into Look · History · Trust; the
  // theme editor is the **Look** tab's. This string is the one user-facing site that has to follow the
  // roster in `characters-section.tsx` — a pin reads it there, so a third rename cannot land silently.
  // ITS NAME IS ITS VISIBLE TEXT, AND ITS GLOSS IS REACHABLE WITHOUT A MOUSE (side-eye 2026-08-30
  // rail-characters P2, #840). Three defects in one element, all fixed here:
  //   1. `role="img"` on a text badge — nothing here is an image; it is a status mark.
  //   2. the accessible name was the whole SENTENCE while the visible text read `Own look`, so the name
  //      did not contain the label — WCAG 2.5.3 Label-in-Name. (NOT covered by the #512 list-row ruling,
  //      which is scoped to the row's `title + qualifier` contract.)
  //   3. `tabIndex: -1` with `title: null` — the sentence reached a screen reader (as the img's name) and a
  //      mouse (as the hover tooltip) and NOBODY ELSE. It is the only thing on the surface that says where
  //      the character's look is edited, and a keyboard-only or touch user could never see it.
  // A real focusable trigger fixes 3 outright: Base UI opens the tooltip on FOCUS as well as hover, so tab
  // and tap both reach the gloss, and `@orb/ui`'s Tooltip seal already threads `aria-describedby` from the
  // trigger to the popup — so the sentence is the DESCRIPTION and `Own look` is the NAME, which is the
  // pairing the three defects above were each a symptom of missing.
  const label = "This card carries its own look — edit it in the Look tab.";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button intent="ghost" size="inline" type="button" className="px-field">
            <ThemeScope className="size-4 shrink-0 rounded-full bg-primary ring-1 ring-border" tokens={themeOverride}>
              {null}
            </ThemeScope>
            {/* The kicker register at its own weight (#573): this mark was micro-caps-muted at REGULAR
                weight — the same micro-caps tag `kicker` paints, one axis short of it. */}
            <Text voice="kicker">Own look</Text>
          </Button>
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
      {/* THE NAME IS STATIC AND `aria-pressed` CARRIES THE STATE (side-eye 2026-08-30 rail-characters P2,
          #840). It used to flip BOTH — `Hide spoilers`/`false` → `Show spoilers`/`true` — so the ON state
          announced as "Show spoilers, toggle button, PRESSED", i.e. "showing is on", while the spoilers
          were in fact hidden. ARIA APG allows either half, never both: a flipping name describes the next
          ACTION, `aria-pressed` describes the current STATE, and a control doing both inverts its meaning
          in exactly one of its two states. `Select multiple` on this same surface is the correct model
          (static name, `aria-pressed` false→true), which is what makes this a defect and not a style. */}
      <Button type="button" intent="ghost" size="icon" aria-label="Hide spoilers" aria-pressed={spoilerBlur} onClick={toggleSpoilerBlur}>
        <Icon icon={spoilerBlur ? EyeOff : Eye} size="sm" />
      </Button>
    </Row>
  );
}
