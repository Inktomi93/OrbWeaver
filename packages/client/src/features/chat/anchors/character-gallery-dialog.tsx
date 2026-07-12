// CharacterGalleryDialog (G4, gallery-design §1.3) — the per-character gallery modal, opened from the chat
// ⋯ menu's "[Character]'s Gallery" entry. Three nested surfaces, all containment PROVIDERS so they live in
// this anchor (client-structure rule 7): the GRID of the character's curated media (thumbnails via the
// `?w=` variant ladder, originals for animated so a GIF isn't freeze-framed), a LIGHTBOX (click a cell to
// enlarge, with a remove-from-gallery action behind an AlertDialog confirm — the chat-delete destructive
// pattern, never a one-click cascade), and an ADD-PICKER (a multi-select grid of the owner's own assets to
// curate in). Wires to the tRPC gallery verbs via `use-character-gallery`. Empty state teaches
// the first add. a11y: every Dialog carries a title, the grids are labeled + keyboard-operable (MediaGrid's
// roving-tabindex APG grid), and every control is a labeled Button.

import { blobUrl } from "@orb/contracts/assets";
import type { AssetId, CharacterId, GalleryItemId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the chat-options-menu.tsx precedent).
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
import type { Trpc } from "#data";
import { SkeletonRows, useInvalidation, useTRPC } from "#data";
import { GalleryGifSearchPanel } from "../components/gallery-gif-search-panel";
import {
  GALLERY_PAGE_LIMIT,
  useAddToGallery,
  useRemoveFromGallery,
} from "../hooks/use-character-gallery";

/** The add-picker's two source modes: the owner's own uploads, or a Tenor gif search (D61). */
type AddPickerMode = "owned" | "gifs";

// The existing icon-ladder rung the grid thumbnails snap to (a cached webp; `domain/assets` variant-policy
// `BLOB_WIDTHS` holds 240). Animated items skip this — the original is rendered so animation survives.
const GALLERY_THUMB_WIDTH = 240;

type GalleryItem = inferOutput<Trpc["assets"]["listGallery"]>[number];
type OwnedAsset = inferOutput<Trpc["assets"]["listOwned"]>[number];

/** The blob thumbnail URL — `?w=` snaps to a cached variant; an animated source has no variant (it would
 *  freeze-frame), so the grid uses the original via the `animated` flag. */
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

/** The grid/empty/loading three-way for the main gallery body — a pure helper (avoids a nested ternary):
 *  a cold cache reads as a skeleton, never the empty state (D62 §4.3 rule 8 — loading/empty/error are
 *  designed states, not `data ?? []` collapsing pending into empty). */
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

/** The character-gallery modal (grid + lightbox + add-picker). */
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
  // Destructive: a confirm gate before the removal fires (this file-area's chat-delete rule — never a
  // one-click cascade). Reads the id BEFORE nulling the lightbox, then tears both surfaces down.
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
            // The popup is a capped flex COLUMN (dialog/variants.ts SCROLL OWNERSHIP): pin the title +
            // action row and let ONLY the image body scroll, so the buttons are ALWAYS on-screen (the
            // popup is deliberately not itself a scroll container). `min-h-0` lets the body region shrink
            // below the image's intrinsic height when the viewport is short.
            <Stack gap="block" className="min-h-0">
              <DialogTitle>Gallery image</DialogTitle>
              <Stack className="min-h-0 flex-1 overflow-y-auto">
                {/* `max-h-96` clamps the image so it can't push the action row past the fold. The box's
                    natural source aspect isn't on GalleryItemView (no width/height on the wire), so the
                    reserved box stays square + `fit="contain"` letterboxes rather than crop — the height
                    clamp, not the aspect, is what keeps the buttons reachable. */}
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

              {/* Removal is destructive → an explicit confirm (the chat-delete pattern). Nested inside the
                  lightbox Dialog, so `forceRender` is required for the alert's own backdrop to show. */}
              <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
                <AlertDialogPopup forceRender={true}>
                  <Stack gap="block">
                    <AlertDialogTitle>Remove this image?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the image from {characterName}'s gallery. The image itself stays
                      in your uploads.
                    </AlertDialogDescription>
                    <AlertDialogActions>
                      <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
                      <AlertDialogClose
                        render={
                          <Button
                            intent="destructive"
                            onClick={(): void => removeItem(lightbox.galleryItemId)}
                          >
                            Remove
                          </Button>
                        }
                      />
                    </AlertDialogActions>
                  </Stack>
                </AlertDialogPopup>
              </AlertDialog>
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

/** The add-picker: a mode toggle (your uploads · Tenor gif search) over the shared Dialog. "Your uploads"
 *  is a multi-select grid of the owner's own IMAGE assets; "Search GIFs" is a search box → results grid →
 *  one-click import (D61). Both curate into THIS character's gallery. */
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

/** "Your uploads" mode — a multi-select grid; "Add selected" fires one `addToGallery` per selection
 *  (idempotent server-side), then closes the picker. */
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
