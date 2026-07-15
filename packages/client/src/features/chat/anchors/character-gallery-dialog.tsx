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
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { SkeletonRows, useInvalidation, useTRPC } from "#data";
import { GalleryGifSearchPanel } from "../components/gallery-gif-search-panel";
import {
  GALLERY_PAGE_LIMIT,
  useAddToGallery,
  useRemoveFromGallery,
} from "../hooks/use-character-gallery";

type AddPickerMode = "owned" | "gifs";

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
function GalleryGridBody({
  isPending,
  gridItems,
  galleryLabel,
  characterName,
  onActivate,
  onAddClick,
}: GalleryGridBodyProps): ReactElement {
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
  return (
    <MediaGrid
      items={gridItems}
      ariaLabel={galleryLabel}
      gapToken="row"
      onActivate={onActivate}
      className="max-h-96"
    />
  );
}

export interface CharacterGalleryDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly characterId: CharacterId;
  readonly characterName: string;
}

export function CharacterGalleryDialog({
  open,
  onOpenChange,
  characterId,
  characterName,
}: CharacterGalleryDialogProps): ReactElement {
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
  const removeItem = (galleryItemId: GalleryItemId): void => {
    remove.mutate({ galleryItemId });
    setRemoveConfirmOpen(false);
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
              <Stack className="min-h-0 flex-1 overflow-y-auto">
                <CrossfadeImage
                  src={blobUrl(lightbox.hash)}
                  alt="Gallery image"
                  aspectRatio={1}
                  fit="contain"
                  className="max-h-96"
                />
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
                onConfirm={(): void => removeItem(lightbox.galleryItemId)}
                onOpenChange={setRemoveConfirmOpen}
                open={removeConfirmOpen}
                title="Remove this image?"
              />
            </Stack>
          )}
        </DialogPopup>
      </Dialog>

      <GalleryAddPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        characterId={characterId}
        existingAssetIds={existingAssetIds}
      />
    </>
  );
}

interface GalleryAddPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly characterId: CharacterId;
  readonly existingAssetIds: ReadonlySet<AssetId>;
}

function GalleryAddPicker({
  open,
  onOpenChange,
  characterId,
  existingAssetIds,
}: GalleryAddPickerProps): ReactElement {
  const [mode, setMode] = useState<AddPickerMode>("owned");

  const close = (next: boolean): void => {
    if (!next) {
      setMode("owned");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogPopup size="lg">
        <Stack gap="block">
          <DialogTitle>Add images to the gallery</DialogTitle>
          <ToggleGroup
            value={[mode]}
            onValueChange={(value): void => {
              const next = value[0];
              if (next !== undefined) {
                setMode(next as AddPickerMode);
              }
            }}
            aria-label="Image source"
          >
            <Toggle value="owned">Your uploads</Toggle>
            <Toggle value="gifs">Search GIFs</Toggle>
          </ToggleGroup>

          {mode === "owned" ? (
            <OwnedAssetPicker
              characterId={characterId}
              existingAssetIds={existingAssetIds}
              onDone={(): void => close(false)}
            />
          ) : (
            <GalleryGifSearchPanel characterId={characterId} />
          )}
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

interface OwnedAssetPickerProps {
  readonly characterId: CharacterId;
  readonly existingAssetIds: ReadonlySet<AssetId>;
  readonly onDone: () => void;
}

function OwnedAssetPicker({
  characterId,
  existingAssetIds,
  onDone,
}: OwnedAssetPickerProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const owned = useQuery(trpc.assets.listOwned.queryOptions({ limit: GALLERY_PAGE_LIMIT }));
  const add = useAddToGallery({ trpc, invalidation });
  const [selected, setSelected] = useState<ReadonlySet<MediaGridKey>>(new Set());

  const candidates = (owned.data ?? []).filter(
    (a) => a.mime.startsWith("image/") && !existingAssetIds.has(a.assetId),
  );
  const gridItems = candidates.map(toOwnedGridItem);

  const toggle = (id: MediaGridKey): void => {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) {
        nextSet.delete(id);
      } else {
        nextSet.add(id);
      }
      return nextSet;
    });
  };
  const confirmAdd = (): void => {
    for (const assetId of selected) {
      add.mutate({ assetId: assetId as AssetId, subjectCharacterId: characterId });
    }
    onDone();
  };

  let body: ReactElement;
  if (owned.isPending) {
    body = <SkeletonRows count={6} shape="line" />;
  } else if (candidates.length === 0) {
    body = (
      <EmptyState
        icon={<Icon icon={Images} size="lg" />}
        title="Nothing left to add"
        description="Every image you own is already in this gallery."
      />
    );
  } else {
    body = (
      <MediaGrid
        items={gridItems}
        ariaLabel="Your images"
        gapToken="row"
        selection={{ selectedIds: selected, onToggle: toggle }}
        className="max-h-96"
      />
    );
  }

  return (
    <Stack gap="block">
      {body}
      <Row justify="between" align="center" gap="row">
        <Text size="micro" tone="muted">
          {selected.size} selected
        </Text>
        <Row gap="row">
          <DialogClose render={<Button intent="ghost">Cancel</Button>} />
          <Button intent="primary" disabled={selected.size === 0} onClick={confirmAdd}>
            Add selected
          </Button>
        </Row>
      </Row>
    </Stack>
  );
}
