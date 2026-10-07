// The per-character gallery modal, mounted once by `character-gallery-anchor.tsx`: the upload zone, then a
// keyset-paged grid with "Load more", a lightbox whose remove sits behind a confirm, and the add-picker. The
// "This chat" scope filters inside the caller's own gallery, never wider. Focus never leaves the dialog.

import type { GallerySort } from "@orb/contracts/assets";
import { blobUrl, DEFAULT_GALLERY_SORT, GALLERY_SORTS } from "@orb/contracts/assets";
import type { CharacterId, ChatId, GalleryItemId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// @orb-waive dialog-via-composite(Dialog): this character-gallery picker owns its root and selection surface; ends if a gallery-dialog composite owns that species.
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, ImagePlus, Images } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { MediaGridHandle, MediaGridItem } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, Ref } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { GalleryAddPicker } from "../components/gallery-add-picker.tsx";
import { GalleryLightbox } from "../components/gallery-lightbox.tsx";
import { GalleryLoadMore } from "../components/gallery-load-more.tsx";
import { GalleryUploadZone } from "../components/gallery-upload-zone.tsx";
import { useGalleryCollection, useRemoveFromGallery } from "../hooks/use-character-gallery.ts";
import { useGalleryFocus } from "../hooks/use-gallery-focus.ts";
import { galleryImageName } from "../lib/gallery-image-name.ts";
import { galleryThumbUrl } from "../lib/gallery-thumb.ts";

type GalleryItem = inferOutput<Trpc["assets"]["listGallery"]>[number];

function toGalleryGridItem(item: GalleryItem, index: number): MediaGridItem {
  return {
    id: item.galleryItemId,
    url: blobUrl(item.hash),
    thumbUrl: galleryThumbUrl(item.hash),
    animated: item.animated,
    alt: galleryImageName(index + 1, item.createdAt),
  };
}

/** The grid's scope: the whole gallery, or only pictures generated in this chat. Words from the chat's
 *  existing scope chips (`docs/law/vocabulary-map.md`, the Documents rack). */
const GALLERY_SCOPES = ["everywhere", "chat"] as const;
type GalleryScope = (typeof GALLERY_SCOPES)[number];
const GALLERY_SCOPE_LABELS: Record<GalleryScope, string> = { everywhere: "Everywhere", chat: "This chat" };

function isGalleryScope(value: unknown): value is GalleryScope {
  return GALLERY_SCOPES.some((scope) => scope === value);
}

const GALLERY_SORT_LABELS: Record<GallerySort, string> = { newest: "Newest first", oldest: "Oldest first" };

function isGallerySort(value: unknown): value is GallerySort {
  return GALLERY_SORTS.some((sort) => sort === value);
}

interface GalleryGridBodyProps {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly scope: GalleryScope;
  readonly onShowEverywhere: () => void;
  readonly gridItems: readonly MediaGridItem[];
  readonly galleryLabel: string;
  readonly characterName: string;
  readonly onActivate: (item: MediaGridItem) => void;
  readonly onAddClick: () => void;
  readonly gridRef: Ref<MediaGridHandle>;
}

// Pending reads as a skeleton and a failed read as its error state, never the empty state: "No images"
// over a failed read is a false claim about the reader's gallery.
function GalleryGridBody(props: GalleryGridBodyProps): ReactElement {
  const { isPending, isError, onRetry, scope, onShowEverywhere, gridItems, galleryLabel, characterName, onActivate, onAddClick, gridRef } = props;
  if (isPending) {
    return <SkeletonRows count={6} shape="line" />;
  }
  if (isError) {
    return <QueryErrorState label={galleryLabel} onRetry={onRetry} />;
  }
  if (gridItems.length === 0 && scope === "chat") {
    return (
      <EmptyState
        icon={<Icon icon={Images} size="lg" />}
        title="No images from this chat"
        description={`Pictures generated in this chat show here once you add them to ${characterName}'s gallery.`}
        action={
          <Button intent="secondary" onClick={onShowEverywhere}>
            Show everywhere
          </Button>
        }
      />
    );
  }
  if (gridItems.length === 0) {
    return (
      <EmptyState
        icon={<Icon icon={Images} size="lg" />}
        title="No images yet"
        description={`Upload images above, or add ones you already have to ${characterName}'s gallery.`}
        action={
          <Button intent="primary" onClick={onAddClick}>
            <Icon icon={ImagePlus} size="sm" />
            Add images
          </Button>
        }
      />
    );
  }
  return <MediaGrid items={gridItems} ariaLabel={galleryLabel} gapToken="row" onActivate={onActivate} className="max-h-64 @md:max-h-96" ref={gridRef} />;
}

export interface CharacterGalleryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly characterId: CharacterId;
  readonly characterName: string;
  /** The chat the dialog was opened from — the room the "This chat" scope filters to. `null` outside a chat,
   *  where the scope strip is absent and the grid is the whole gallery. */
  readonly chatId: ChatId | null;
}

export function CharacterGalleryDialog({ open, onOpenChange, characterId, characterName, chatId }: CharacterGalleryDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [scope, setScope] = useState<GalleryScope>("everywhere");
  // "Show everywhere" unmounts itself, so focus moves to the radio it selected rather than the dialog.
  const everywhereRef = useRef<HTMLButtonElement>(null);
  const showEverywhere = (): void => {
    setScope("everywhere");
    everywhereRef.current?.focus();
  };
  const [sort, setSort] = useState<GallerySort>(DEFAULT_GALLERY_SORT);
  const gallery = useGalleryCollection({ trpc }, { characterId, chatId: scope === "chat" ? chatId : null, sort });
  const scopes = chatId === null ? null : GALLERY_SCOPES;
  const remove = useRemoveFromGallery({ trpc, invalidation });

  const [lightboxId, setLightboxId] = useState<GalleryItemId | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // "Upload instead" in the add-picker opens the zone's own file chooser.
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const items = gallery.items;
  const gridItems = items.map(toGalleryGridItem);
  const galleryLabel = `${characterName}'s gallery`;
  // Settled on nothing: the Order strip and the header's add yield to the empty state's one action.
  const galleryEmpty = !gallery.isPending && gallery.error === null && items.length === 0;
  const gridRef = useRef<MediaGridHandle>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focus = useGalleryFocus({
    gridRef,
    headingRef,
    ids: items.map((i) => i.galleryItemId),
    isFetchingNextPage: gallery.isFetchingNextPage,
    hasNextPage: gallery.hasNextPage,
    onLoadMore: gallery.listProps.onEndApproach,
  });

  const lightboxIndex = items.findIndex((i) => i.galleryItemId === lightboxId);
  const lightboxItem = items[lightboxIndex];
  const openLightbox = (activated: MediaGridItem): void => {
    setLightboxId(items.find((i) => i.galleryItemId === activated.id)?.galleryItemId ?? null);
  };
  // BOTH DIALOGS CLOSE ON THE REMOVAL, NOT ON THE REQUEST (#1501). The confirm and the lightbox were
  // dismissed on the same tick as `.mutate`, so a rejected remove left the image in the gallery, the reader
  // back at the grid, and nothing on screen to retry from — the toast was the only evidence, over a grid that
  // still showed the image they had just confirmed deleting. On failure the confirm stays open, which IS the
  // retry.
  // THE CONFIRM IS THE RETRY SURFACE FOR ITS OWN VERB (#1563), so the settle is RETURNED to it rather than
  // handled here: `ConfirmDialog` holds open while this is in flight, closes itself on success, and on
  // rejection stays open with the reason and its own button as the retry. Only the LIGHTBOX close is this
  // surface's own business — the removed image's own frame outlives the confirm.
  const removeItem = async (galleryItemId: GalleryItemId): Promise<void> => {
    await remove.mutateAsync({ galleryItemId });
    focus.noteRemoval(galleryItemId);
    setLightboxId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Top-anchored: the scope filter changes the body's height, and a centred popup would move the
            heading and the filter out from under the pointer. */}
        {/* The first tabbable changes as loading settles; initial focus targets the popup that stays mounted. */}
        <DialogPopup anchor="top" initialFocus={popupRef} ref={popupRef} size="lg">
          {/* The container the grid's height reads: a phone-width dialog keeps the grid short enough that the
              zone above it and "Load more" below it stay on screen. */}
          <Stack gap="block" className="@container">
            <Row justify="between" align="center" gap="row">
              {/* Focusable by script only: a removal that empties the gallery puts focus here. */}
              <DialogTitle ref={headingRef} tabIndex={-1}>
                {galleryLabel}
              </DialogTitle>
              <Row align="center" gap="row">
                {galleryEmpty && scope === "everywhere" ? null : (
                  <Button intent="secondary" size="sm" onClick={(): void => setPickerOpen(true)}>
                    <Icon icon={ImagePlus} size="sm" />
                    Add images
                  </Button>
                )}
                <DialogClose
                  render={
                    <Button intent="ghost" size="sm">
                      Close
                    </Button>
                  }
                />
              </Row>
            </Row>

            {scopes === null && galleryEmpty ? null : (
              <Row className="flex-wrap" gap="row">
                {scopes === null ? null : (
                  <ToggleGroup
                    aria-label="Show images from"
                    onValueChange={(picked): void => {
                      // A one-of-N strip has no release: clicking the active segment yields an empty array.
                      const next = picked[0];
                      if (isGalleryScope(next)) {
                        setScope(next);
                      }
                    }}
                    semantics="radio"
                    value={[scope]}
                  >
                    {scopes.map((option) => (
                      <Toggle
                        checked={option === scope}
                        key={option}
                        ref={option === "everywhere" ? everywhereRef : undefined}
                        semantics="radio"
                        value={option}
                      >
                        {GALLERY_SCOPE_LABELS[option]}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                )}
                {galleryEmpty ? null : (
                  <ToggleGroup
                    aria-label="Order"
                    onValueChange={(picked): void => {
                      const next = picked[0];
                      if (isGallerySort(next)) {
                        setSort(next);
                      }
                    }}
                    semantics="radio"
                    value={[sort]}
                  >
                    {GALLERY_SORTS.map((option) => (
                      <Toggle checked={option === sort} key={option} semantics="radio" value={option}>
                        {GALLERY_SORT_LABELS[option]}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                )}
              </Row>
            )}

            {/* Above the grid: at a phone's height a full grid would push the zone below the fold. */}
            <GalleryUploadZone characterId={characterId} characterName={characterName} inputRef={uploadInputRef} />
            <GalleryGridBody
              isPending={gallery.isPending}
              isError={gallery.error !== null && items.length === 0}
              onRetry={gallery.refetch}
              scope={scope}
              onShowEverywhere={showEverywhere}
              gridItems={gridItems}
              galleryLabel={galleryLabel}
              characterName={characterName}
              onActivate={openLightbox}
              onAddClick={(): void => setPickerOpen(true)}
              gridRef={gridRef}
            />
            <GalleryLoadMore
              hasNextPage={gallery.hasNextPage}
              isFetchingNextPage={gallery.isFetchingNextPage}
              failed={gallery.error !== null && items.length > 0}
              onLoadMore={focus.loadMore}
            />
          </Stack>
        </DialogPopup>
      </Dialog>

      <GalleryLightbox
        image={lightboxItem === undefined ? null : { hash: lightboxItem.hash, name: galleryImageName(lightboxIndex + 1, lightboxItem.createdAt) }}
        characterName={characterName}
        onClose={(): void => setLightboxId(null)}
        onRemove={(): Promise<void> => (lightboxItem === undefined ? Promise.resolve() : removeItem(lightboxItem.galleryItemId))}
        finalFocus={focus.lightboxFinalFocus}
        onSettled={focus.onLightboxSettled}
      />

      <GalleryAddPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        characterId={characterId}
        onUploadInstead={(): void => {
          setPickerOpen(false);
          uploadInputRef.current?.click();
        }}
      />
    </>
  );
}
