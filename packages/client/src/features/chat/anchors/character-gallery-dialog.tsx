// The per-character gallery modal, opened from the chat options menu. Three nested surfaces: the grid
// of curated media, a lightbox (remove-from-gallery behind an AlertDialog confirm, never a one-click
// cascade), and an add-picker (`components/gallery-add-picker.tsx`). Wires to the tRPC gallery
// verbs via use-character-gallery. The grid's scope filter narrows to pictures generated in this chat; the
// server applies it inside the caller's own gallery, so it can never show another member's pictures. The
// grid is keyset-paged in a date order: a "Load more" control fetches the next page, because the virtualized
// grid has no end-of-list callback. Under it, an upload zone takes picked or dropped images straight in.

import type { GallerySort } from "@orb/contracts/assets";
import { blobUrl, DEFAULT_GALLERY_SORT, GALLERY_SORTS } from "@orb/contracts/assets";
import type { AssetId, CharacterId, ChatId, GalleryItemId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
// @orb-waive dialog-via-composite(Dialog): this character-gallery picker owns its root and selection surface; ends if a gallery-dialog composite owns that species.
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, ImagePlus, Images, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { MediaGridItem } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { GalleryAddPicker } from "../components/gallery-add-picker.tsx";
import { GalleryUploadZone } from "../components/gallery-upload-zone.tsx";
import { useGalleryCollection, useRemoveFromGallery } from "../hooks/use-character-gallery.ts";
import { galleryThumbUrl } from "../lib/gallery-thumb.ts";

type GalleryItem = inferOutput<Trpc["assets"]["listGallery"]>[number];

function toGalleryGridItem(item: GalleryItem): MediaGridItem {
  return {
    id: item.galleryItemId,
    url: blobUrl(item.hash),
    thumbUrl: galleryThumbUrl(item.hash),
    animated: item.animated,
    alt: "Gallery image",
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

interface GalleryLoadMoreProps {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** The last page request failed while earlier pages are on screen. */
  readonly failed: boolean;
  readonly onLoadMore: () => void;
}

// Present only while the server has more: a short page ends the list, and the control goes with it.
function GalleryLoadMore({ hasNextPage, isFetchingNextPage, failed, onLoadMore }: GalleryLoadMoreProps): ReactElement | null {
  if (!hasNextPage) {
    return null;
  }
  return (
    <Stack gap="tight">
      {failed ? (
        <Text className="text-destructive" role="alert" voice="label">
          Couldn't load more pictures. Try again.
        </Text>
      ) : null}
      <Row justify="center">
        <Button intent="secondary" size="sm" loading={isFetchingNextPage} onClick={onLoadMore}>
          Load more
        </Button>
      </Row>
    </Stack>
  );
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
}

// Pending reads as a skeleton and a failed read as its error state, never the empty state: "No images"
// over a failed read is a false claim about the reader's gallery.
function GalleryGridBody(props: GalleryGridBodyProps): ReactElement {
  const { isPending, isError, onRetry, scope, onShowEverywhere, gridItems, galleryLabel, characterName, onActivate, onAddClick } = props;
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
        description={`Upload images below, or add ones you already have to ${characterName}'s gallery.`}
        action={
          <Button intent="primary" onClick={onAddClick}>
            <Icon icon={ImagePlus} size="sm" />
            Add images
          </Button>
        }
      />
    );
  }
  return <MediaGrid items={gridItems} ariaLabel={galleryLabel} gapToken="row" onActivate={onActivate} className="max-h-96" />;
}

export interface CharacterGalleryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly characterId: CharacterId;
  readonly characterName: string;
  /** The chat the dialog was opened from — the room the "This chat" scope filters to. */
  readonly chatId: ChatId;
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
  const remove = useRemoveFromGallery({ trpc, invalidation });

  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const items = gallery.items;
  const gridItems = items.map(toGalleryGridItem);
  const existingAssetIds = new Set<AssetId>(items.map((i) => i.assetId));
  const galleryLabel = `${characterName}'s gallery`;

  const openLightbox = (activated: MediaGridItem): void => {
    setLightbox(items.find((i) => i.galleryItemId === activated.id) ?? null);
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
    setLightbox(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Top-anchored: the scope filter changes the body's height, and a centred popup would move the
            heading and the filter out from under the pointer. */}
        <DialogPopup anchor="top" size="lg">
          <Stack gap="block">
            <Row justify="between" align="center" gap="row">
              <DialogTitle>{galleryLabel}</DialogTitle>
              <Button intent="secondary" size="sm" onClick={(): void => setPickerOpen(true)}>
                <Icon icon={ImagePlus} size="sm" />
                Add images
              </Button>
            </Row>

            <Row className="flex-wrap" gap="row">
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
                {GALLERY_SCOPES.map((option) => (
                  <Toggle checked={option === scope} key={option} ref={option === "everywhere" ? everywhereRef : undefined} semantics="radio" value={option}>
                    {GALLERY_SCOPE_LABELS[option]}
                  </Toggle>
                ))}
              </ToggleGroup>
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
            </Row>

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
            />
            <GalleryLoadMore
              hasNextPage={gallery.hasNextPage}
              isFetchingNextPage={gallery.isFetchingNextPage}
              failed={gallery.error !== null && items.length > 0}
              onLoadMore={gallery.listProps.onEndApproach}
            />
            <GalleryUploadZone characterId={characterId} characterName={characterName} />
          </Stack>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={lightbox !== null}
        onOpenChange={(next): void => {
          if (!next) {
            setLightbox(null);
          }
        }}
      >
        <DialogPopup size="lg">
          {lightbox === null ? null : (
            <Stack gap="block" className="min-h-0">
              <DialogTitle>Gallery image</DialogTitle>
              <Stack className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <CrossfadeImage src={blobUrl(lightbox.hash)} alt="Gallery image" aspectRatio={1} fit="contain" className="max-h-96" />
              </Stack>
              <Row justify="between" align="center" gap="row" className="shrink-0">
                <Button intent="destructive" onClick={(): void => setRemoveConfirmOpen(true)}>
                  <Icon icon={Trash2} size="sm" />
                  Remove from gallery
                </Button>
                <DialogClose render={<Button intent="ghost">Close</Button>} />
              </Row>

              <ConfirmDialog
                confirmLabel="Remove"
                description={`This removes the image from ${characterName}'s gallery. The image itself stays in your uploads.`}
                forceRender={true}
                onConfirm={(): Promise<void> => removeItem(lightbox.galleryItemId)}
                onOpenChange={setRemoveConfirmOpen}
                open={removeConfirmOpen}
                title="Remove this image?"
              />
            </Stack>
          )}
        </DialogPopup>
      </Dialog>

      <GalleryAddPicker open={pickerOpen} onOpenChange={setPickerOpen} characterId={characterId} existingAssetIds={existingAssetIds} />
    </>
  );
}
