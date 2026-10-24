// The hero band — the editor's visual centerpiece. Mixes two commit models by design: the name is a draft
// card field (bound to the form → save-bar), while the portrait is an immediate identity commit
// (`character.update` single-key patches). The accent swatch is a read-only preview of the
// resolved themeOverride — the theme control itself lives in the CONTEXT pane (`character-options-tab.tsx`
// mounts `CharacterAppearanceTab`; the component name differs from the tab's).
//
// The band renders NEITHER a star nor an archive control — `archived` arrives only as a prop the band reads
// for display. Archive's affordances for an open character live in the CONTEXT pane's `Character actions`
// kebab (the `open` slice of `../lib/character-actions.ts`); the star lives on the list row.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterDetail } from "@orb/contracts/character";
import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { TagView } from "@orb/contracts/tag";
import type { ThemeOverride } from "@orb/contracts/theme";
import { cardEmbeddableSubset } from "@orb/contracts/theme";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { ChevronRight, Eye, EyeOff, Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useUploadAsset, useUploadCaps } from "#data";
import type { AppFormInstance } from "#forms/editor";
import { notify, oversizeUploadMessage } from "#lib";
import { toggleSpoilerBlur, useSpoilerBlur } from "#state";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { usePreviewRenderPolicy } from "../hooks/use-preview-render-policy.ts";
import type { CharacterCardFormValues } from "../lib/character-card-form-model.ts";
import { CharacterGreetingPreview } from "./character-greeting-preview.tsx";
import { CharacterTagSuggestions } from "./character-tag-suggestions.tsx";
import { CharacterTagsRow } from "./character-tags-row.tsx";

type CharacterHeroDetail = Pick<
  CharacterDetail,
  "id" | "handle" | "name" | "starred" | "archived" | "trustHtml" | "forbidExternalMedia" | "interactiveHtml" | "avatarHash" | "themeOverride"
> & {
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
};

/** The suggestion strip's first-boot guess: one wrapped row of chips. `reserveKey` replaces it with this
 *  device's own measurement on every subsequent open. */
const TAG_SUGGESTION_SKELETON_ROWS = 1;

/** THE HERO'S GLANCE ECHOES STAND DOWN WHILE THE CONTEXT PANE IS OPEN — the shell marker `shell.css` keys
 *  the yield on, exactly as the topbar's identity yields to the chat band. Without it the handle, the
 *  Own-look trigger and the chat count render twice on one screen, two doors to one action.
 *
 *  The pane's HEAD BAND (an owner-ruled mock) is the artifact's identity, so while the band is on screen it
 *  is the identity's one home, and the hero yields the same three items.
 *
 *  WHAT DOES NOT CARRY THE MARKER, deliberately: the NAME field and the PORTRAIT. They are the only rename
 *  and avatar-replace affordances on the surface — the band's `h2` and its 36px avatar are a GLANCE, these
 *  are the EDITOR — and hiding an affordance because a read-only copy of its value sits elsewhere would be
 *  a new defect one screen over. */
export const HERO_ECHO_CLASS = "shell-character-hero-echo";

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
              <Text voice="gloss" className={`truncate font-mono ${HERO_ECHO_CLASS}`}>
                @{detail.handle}
              </Text>
            </Stack>
            <Row align="center" className={HERO_ECHO_CLASS}>
              <OwnLookMark themeOverride={detail.themeOverride} />
            </Row>
          </Row>
          <HeroActions spoilerBlur={spoilerBlur} onNewChat={onNewChat} onViewChats={onViewChats} chatCount={chatCount} />
        </Stack>
      </Row>

      <CharacterTagsRow characterId={detail.id} tags={detail.tags} trpc={trpc} />
      {/* ITS OWN BOUNDARY, WITH A RESERVATION. The suggestion strip is the block between the tags row and
          the greeting, and it arrives on its own read — without a reservation it would render at zero height
          and then push the greeting down after the editor had finished filling. Its own boundary
          keeps the suspense local (the editor does not re-suspend for it) and `reserveKey` holds the box
          this device measured, so the block below it never moves. */}
      <QueryBoundary
        fallback={<SkeletonRows count={TAG_SUGGESTION_SKELETON_ROWS} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="tag suggestions" onRetry={retry} />}
        reserveKey="character.tagSuggestions"
      >
        <CharacterTagSuggestions characterId={detail.id} trpc={trpc} />
      </QueryBoundary>

      <CharacterGreetingPreview
        characterId={detail.id}
        form={form}
        themeOverride={detail.themeOverride}
        trusted={rendersTrustedHtml(previewPolicy.htmlTrust)}
        allowExternalMedia={!previewPolicy.forbidExternalMedia}
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
 *  avatar would paint outside it — over the "Name" label — and the real click target would be the
 *  invisible control square. */
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
    // `.image`/`.databankUpload` FileDropzone consumers.
    const oversize = oversizeUploadMessage(file, uploadCaps.assetUpload);
    if (oversize !== undefined) {
      notify.error(oversize);
      return;
    }
    try {
      const stored = await upload(file, "avatar");
      // UPLOAD-COMPLETE IS NOT COMMIT. The blob landing in the CAS says nothing about the character row
      // pointing at it: swapping the portrait on `.mutate` would leave a rejected `character.update`'s new
      // face on screen — over a card that still wears its prior one everywhere else. Both the preview and its
      // confirmation are the WRITE's, not the upload's; a failure keeps the prior portrait and speaks through
      // the mutation's own errorToast.
      update.mutate(
        { characterId: detail.id, input: { avatarAssetId: stored.assetId } },
        {
          onSuccess: (): void => {
            setPreviewHash(stored.hash);
            // A static ring flash, no keyframe (reduced-motion-safe by construction); clears itself shortly after.
            setConfirming(true);
            globalThis.setTimeout((): void => setConfirming(false), CONFIRM_MS);
          },
        },
      );
    } catch {
      notify.error("Couldn't upload the portrait.");
    }
  };

  const avatarSrc = previewHash === null ? {} : { src: blobUrl(previewHash) };
  // NO call-site radius. `size="media"` is `size-auto p-0`, so this button's border box IS the Avatar's: its
  // confirm ring and hover fill trace the Avatar's own corner. The avatar is a circle (UI-Density-Law 2.1),
  // so the button takes `shape="pill"`, the same full radius, and no second radius class is written here.
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
        <Button aria-label="Replace portrait" intent="ghost" shape="pill" size="media" className={triggerClass} onClick={open}>
          <Avatar hueSeed={detail.id} size="hero" {...avatarSrc}>
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
 * IT ONLY RENDERS WHEN THERE IS SOMETHING TO MARK, AND IT SAYS WHAT IT MEANS. An unconditional marker on a
 * card with NO override would paint the global primary, a marker for a fact that isn't true. An
 * override-less card shows nothing (the honest absence), and a card that carries one says so in words the
 * reader can act on.
 */
export function OwnLookMark({ themeOverride }: { readonly themeOverride: ThemeOverride | null }): ReactElement | null {
  const cardTheme = themeOverride === null ? null : cardEmbeddableSubset(themeOverride);
  if (cardTheme === null || Object.keys(cardTheme).length === 0) {
    return null;
  }
  // IT NAMES A TAB THAT EXISTS: the theme editor is the **Look** tab's. This string is the one user-facing
  // site that has to follow the roster in `characters-section.tsx` — a pin reads it there, so a rename
  // cannot land silently.
  // ITS NAME IS ITS VISIBLE TEXT, AND ITS GLOSS IS REACHABLE WITHOUT A MOUSE. `Own look` is the NAME (WCAG
  // 2.5.3 Label-in-Name: the accessible name contains the visible label), and the sentence is the
  // DESCRIPTION through `@orb/ui`'s Tooltip seal, which threads `aria-describedby` from the trigger. It is a
  // status mark, not an image, so it takes no `role="img"`.
  //
  // TAB AND TAP BOTH REACH THE GLOSS. Base UI builds the tooltip's hover with `mouseOnly: true`
  // (`tooltip/trigger/TooltipTrigger.js`) and its focus path returns early unless the trigger matches
  // `:focus-visible` (`floating-ui-react/hooks/useFocus.js`). A tap focuses the button but does NOT make it
  // `:focus-visible`, and this sentence is the only thing on the surface that says where the look is
  // edited. The chip has no other job on press, so the press opens the same sentence as a Popover (the
  // `HintTrigger` anatomy); hover/`:focus-visible` keep the tooltip, whose `closeOnClick` default dismisses
  // it as the popover opens, so the two never stack.
  const label = "This card carries its own look — edit it in the Look tab.";
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                // THE ACTIONABLE CHIP LIFTS ITS INK: `secondary` + `pill` at the `sm` control step,
                // the same treatment the chat band's members and memory chips take, so ONE grammar reads across
                // both bands — the live chip is at the foreground, a datum holds the muted step. (The axis is
                // COLOUR, not the border: a `soft` Badge draws the same hairline — measured; the note in
                // chat-recall-indicator.tsx carries it.) A `ghost`+`size="inline"` chip would draw nothing at
                // rest and leave the unpressable datum chips as the row's only shaped items.
                <Button intent="secondary" shape="pill" size="sm" type="button">
                  <ThemeScope className="size-4 shrink-0 rounded-full bg-primary ring-1 ring-border" tokens={cardTheme}>
                    {null}
                  </ThemeScope>
                  {/* The kicker register at its own weight. `interactiveKicker`, not `kicker`: this text is the
                      VISIBLE LABEL OF A BUTTON, and `kicker` is the micro step — under the readable floor the
                      context rail beside it keeps ("the readable-floor ruling stands", context-rail.tsx). Same
                      instrument register, readable step. */}
                  {/* `as="span"`, NOT the `<Text>` default `<p>` (this component renders in the CONTENT header
                      and again in the CONTEXT band). `<button>` takes PHRASING content only: React-DOM constructs
                      the tree so nothing reparents at runtime, but an HTML parser (SSR/hydration, an ariaSnapshot
                      round trip) closes the button at the `<p>` and re-parents everything after it. */}
                  <Text as="span" voice="interactiveKicker" className="text-inherit">
                    Own look
                  </Text>
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="bottom">{label}</TooltipPopup>
      </Tooltip>
      {/* The popup is a `role="dialog"` whose whole body IS the gloss, so it takes the chip's own visible
          word as its name rather than announcing as a nameless dialog. */}
      <PopoverPopup aria-label="Own look" data-slot="own-look-gloss" side="bottom">
        {label}
      </PopoverPopup>
    </Popover>
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
        // The chat-count DOOR is a glance echo of the band's `N chats` chip and of the rail's own Chats
        // cell — `duplicate-action-door` names it twice. It yields with the handle (see HERO_ECHO_CLASS).
        <Button type="button" intent="ghost" onClick={onViewChats} className={HERO_ECHO_CLASS}>
          {chatCount} {chatCount === 1 ? "chat" : "chats"}
          <Icon icon={ChevronRight} size="sm" />
        </Button>
      ) : null}
      {/* THE NAME IS STATIC AND `aria-pressed` CARRIES THE STATE. Flipping BOTH — `Hide spoilers`/`false`
          → `Show spoilers`/`true` — would announce the ON state as "Show spoilers, toggle button, PRESSED",
          i.e. "showing is on", while the spoilers are hidden. ARIA APG allows either half, never both: a flipping name describes the next
          ACTION, `aria-pressed` describes the current STATE, and a control doing both inverts its meaning
          in exactly one of its two states. `Select multiple` on this same surface is the correct model
          (static name, `aria-pressed` false→true), which is what makes this a defect and not a style. */}
      <Button type="button" intent="ghost" size="icon" aria-label="Hide spoilers" aria-pressed={spoilerBlur} onClick={toggleSpoilerBlur}>
        <Icon icon={spoilerBlur ? EyeOff : Eye} size="sm" />
      </Button>
    </Row>
  );
}
