// The per-character gallery modal, opened from the chat options menu. Three nested surfaces: the grid
// of curated media, a lightbox (remove-from-gallery behind an AlertDialog confirm, never a one-click
// cascade), and an add-picker (multi-select grid of the owner's own assets). Wires to the tRPC gallery
// verbs via use-character-gallery.

import { blobUrl } from "@orb/contracts/assets";
import type { AssetId, CharacterId, GalleryItemId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, ImagePlus, Images, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { MediaGridItem, MediaGridKey } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { GALLERY_PAGE_LIMIT, useAddToGallery, useRemoveFromGallery } from "../hooks/use-character-gallery.ts";

const GALLERY_THUMB_WIDTH = 240;

type GalleryItem = inferOutput<Trpc["assets"]["listGallery"]>[number];
type OwnedAsset = inferOutput<Trpc["assets"]["listOwned"]>[number];

// An animated source has no cached variant (it would freeze-frame), so the grid uses the original via
// the animated flag.
function thumbUrl(hash: string): string {
  return `${blobUrl(hash)}?w=${GALLERY_THUMB_WIDTH}`;
}

function toGalleryGridItem(item: GalleryItem): MediaGridItem {
  return {
    id: item.galleryItemId,
    url: blobUrl(item.hash),
    thumbUrl: thumbUrl(item.hash),
    animated: item.animated,
    alt: "Gallery image",
  };
}

function toOwnedGridItem(asset: OwnedAsset): MediaGridItem {
  return {
    id: asset.assetId,
    url: blobUrl(asset.hash),
    thumbUrl: thumbUrl(asset.hash),
    animated: asset.animated,
    alt: `${asset.kind} image`,
  };
}

interface GalleryGridBodyProps {
  readonly isPending: boolean;
  readonly gridItems: readonly MediaGridItem[];
  readonly galleryLabel: string;
  readonly characterName: string;
  readonly onActivate: (item: MediaGridItem) => void;
  readonly onAddClick: () => void;
}

// Pending reads as a skeleton, never the empty state.
function GalleryGridBody({ isPending, gridItems, galleryLabel, characterName, onActivate, onAddClick }: GalleryGridBodyProps): ReactElement {
  if (isPending) {
    return <SkeletonRows count={6} shape="line" />;
  }
  if (gridItems.length === 0) {
    return (
      <EmptyState
        icon={<Icon icon={Images} size="lg" />}
        title="No images yet"
        description={`Curate images into ${characterName}'s gallery from your uploads.`}
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
}

export function CharacterGalleryDialog({ open, onOpenChange, characterId, characterName }: CharacterGalleryDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const gallery = useQuery(
    trpc.assets.listGallery.queryOptions({
      subjectCharacterId: characterId,
      limit: GALLERY_PAGE_LIMIT,
    }),
  );
  const remove = useRemoveFromGallery({ trpc, invalidation });

  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const items = gallery.data ?? [];
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
        <DialogPopup size="lg">
          <Stack gap="block">
            <Row justify="between" align="center" gap="row">
              <DialogTitle>{galleryLabel}</DialogTitle>
              <Button intent="secondary" size="sm" onClick={(): void => setPickerOpen(true)}>
                <Icon icon={ImagePlus} size="sm" />
                Add images
              </Button>
            </Row>

            <GalleryGridBody
              isPending={gallery.isPending}
              gridItems={gridItems}
              galleryLabel={galleryLabel}
              characterName={characterName}
              onActivate={openLightbox}
              onAddClick={(): void => setPickerOpen(true)}
            />
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
              <Stack className="relative min-h-0 flex-1 overflow-y-auto">
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

interface GalleryAddPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly characterId: CharacterId;
  readonly existingAssetIds: ReadonlySet<AssetId>;
}

function GalleryAddPicker({ open, onOpenChange, characterId, existingAssetIds }: GalleryAddPickerProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const add = useAddToGallery({ trpc, invalidation });
  const [isOwned, setIsOwned] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const ownedRef = useRef(false);

  /**
   * Adds the picked assets and REPORTS BACK WHICH ONES ARE STILL OUTSTANDING (#1501).
   *
   * A partial batch used to leave the picker's selection untouched, so the obvious next move — press Add
   * again — re-submitted every asset including the ones already in the gallery. The batch is per-asset
   * (`Promise.allSettled` over independent writes), so the honest retry set is exactly the rejected ones;
   * the picker narrows its selection to what this returns.
   */
  const confirmAdd = async (assetIds: readonly MediaGridKey[]): Promise<readonly MediaGridKey[]> => {
    if (ownedRef.current) {
      return assetIds;
    }
    ownedRef.current = true;
    setIsOwned(true);
    setFailure(null);
    const writes = assetIds.map((assetId) => add.mutateAsync({ assetId: assetId as AssetId, subjectCharacterId: characterId }));
    try {
      const outcomes = await Promise.allSettled(writes);
      // Index-aligned by construction (`Promise.allSettled` preserves input order), so a rejected outcome
      // names its own asset.
      const stillOutstanding = assetIds.filter((_, index) => outcomes[index]?.status !== "fulfilled");
      if (stillOutstanding.length === 0) {
        onOpenChange(false);
      } else {
        setFailure(
          stillOutstanding.length === assetIds.length
            ? "Couldn't add the selected images to the gallery."
            : `Added ${String(assetIds.length - stillOutstanding.length)} of ${String(assetIds.length)} — the rest are still selected.`,
        );
      }
      return stillOutstanding;
    } finally {
      ownedRef.current = false;
      setIsOwned(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next): void => {
        if (next || !ownedRef.current) {
          onOpenChange(next);
        }
      }}
    >
      <DialogPopup size="lg">
        <Stack gap="block">
          <DialogTitle>Add images to the gallery</DialogTitle>
          <OwnedAssetPicker existingAssetIds={existingAssetIds} failure={failure} isOwned={isOwned} onConfirm={confirmAdd} />
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

interface OwnedAssetPickerProps {
  readonly existingAssetIds: ReadonlySet<AssetId>;
  readonly failure: string | null;
  readonly isOwned: boolean;
  /** Runs the batch and RESOLVES WITH THE IDS STILL OUTSTANDING — an empty array means everything landed. */
  readonly onConfirm: (assetIds: readonly MediaGridKey[]) => Promise<readonly MediaGridKey[]>;
}

function OwnedAssetPicker({ existingAssetIds, failure, isOwned, onConfirm }: OwnedAssetPickerProps): ReactElement {
  const trpc = useTRPC();
  const owned = useQuery(trpc.assets.listOwned.queryOptions({ limit: GALLERY_PAGE_LIMIT }));
  const [selected, setSelected] = useState<ReadonlySet<MediaGridKey>>(new Set());
  const candidates = (owned.data ?? []).filter((asset) => asset.mime.startsWith("image/") && !existingAssetIds.has(asset.assetId));
  const gridItems = candidates.map(toOwnedGridItem);

  const toggle = (id: MediaGridKey): void => {
    if (isOwned) {
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /** Runs the batch and keeps only what did not land — so a retry submits the remainder, never the whole
   *  set again. Every failure path leaves the selection intact, which is what makes the retry meaningful. */
  const submit = (): void => void onConfirm([...selected]).then((stillOutstanding) => setSelected(new Set(stillOutstanding)));

  let body: ReactElement;
  if (owned.isPending) {
    body = <SkeletonRows count={6} shape="line" />;
  } else if (owned.isError) {
    // "NOTHING LEFT TO ADD" IS A CLAIM ABOUT THE READER'S UPLOADS (#1500, the same class as the batch this
    // dialog was filed under). A failed `assets.listOwned` emptied `candidates`, so the picker told a reader
    // with a hundred images that every one of them was already in this gallery.
    body = <QueryErrorState label="your images" onRetry={(): void => void owned.refetch()} />;
  } else if (candidates.length === 0) {
    // @orb-waive empty-state-has-action(EmptyState): the "Nothing left to add" state — every owned image is already in this gallery, so there is genuinely nothing to do here. Ends when uploading a new image becomes reachable from inside this dialog, which would be the next step this state is missing.
    body = <EmptyState icon={<Icon icon={Images} size="lg" />} title="Nothing left to add" description="Every image you own is already in this gallery." />;
  } else {
    body = <MediaGrid items={gridItems} ariaLabel="Your images" gapToken="row" selection={{ selectedIds: selected, onToggle: toggle }} className="max-h-96" />;
  }

  return (
    <Stack gap="block">
      {body}
      {failure === null ? null : (
        <Text className="text-destructive" role="alert" voice="label">
          {failure}
        </Text>
      )}
      <Row justify="between" align="center" gap="row">
        <Text voice="gloss">{selected.size} selected</Text>
        <Row gap="row">
          <DialogClose
            render={
              <Button intent="ghost" disabled={isOwned}>
                Cancel
              </Button>
            }
          />
          <Button intent="primary" disabled={selected.size === 0 || isOwned} onClick={submit}>
            Add selected
          </Button>
        </Row>
      </Row>
    </Stack>
  );
}
