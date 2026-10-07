// The gallery's add-picker: a multi-select, keyset-paged grid of the owner's images not yet in one character's
// gallery (the server filters), added as a per-asset batch. A partial failure keeps exactly the rejected assets
// selected, so a retry resubmits only those. Opened from the gallery dialog (`anchors/character-gallery-dialog.tsx`).

import { blobUrl } from "@orb/contracts/assets";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// @orb-waive dialog-via-composite(Dialog): the gallery add-picker owns its root and selection surface; ends if a gallery-dialog composite owns that species.
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Images } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { MediaGridHandle, MediaGridItem, MediaGridKey } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useAddToGallery, useGalleryCandidates } from "../hooks/use-character-gallery.ts";
import { useGalleryFocus } from "../hooks/use-gallery-focus.ts";
import { ownedImageName } from "../lib/gallery-image-name.ts";
import { galleryThumbUrl } from "../lib/gallery-thumb.ts";
import { GalleryLoadMore } from "./gallery-load-more.tsx";

type OwnedAsset = inferOutput<Trpc["assets"]["listOwned"]>[number];

function toOwnedGridItem(asset: OwnedAsset, index: number): MediaGridItem {
  return {
    id: asset.assetId,
    url: blobUrl(asset.hash),
    thumbUrl: galleryThumbUrl(asset.hash),
    animated: asset.animated,
    alt: ownedImageName(index + 1, asset.uploadedAt),
  };
}

interface GalleryAddPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly characterId: CharacterId;
  /** Close the picker and open the gallery's upload chooser: the next step when nothing is left to add. */
  readonly onUploadInstead: () => void;
}

export function GalleryAddPicker({ open, onOpenChange, characterId, onUploadInstead }: GalleryAddPickerProps): ReactElement {
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
        <Stack gap="block" className="@container">
          <DialogTitle>Add images to the gallery</DialogTitle>
          <OwnedAssetPicker characterId={characterId} failure={failure} isOwned={isOwned} onConfirm={confirmAdd} onUploadInstead={onUploadInstead} />
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

interface OwnedAssetPickerProps {
  readonly characterId: CharacterId;
  readonly failure: string | null;
  readonly isOwned: boolean;
  /** Runs the batch and RESOLVES WITH THE IDS STILL OUTSTANDING — an empty array means everything landed. */
  readonly onConfirm: (assetIds: readonly MediaGridKey[]) => Promise<readonly MediaGridKey[]>;
  readonly onUploadInstead: () => void;
}

function OwnedAssetPicker({ characterId, failure, isOwned, onConfirm, onUploadInstead }: OwnedAssetPickerProps): ReactElement {
  const trpc = useTRPC();
  const candidates = useGalleryCandidates({ trpc }, { characterId });
  const [selected, setSelected] = useState<ReadonlySet<MediaGridKey>>(new Set());
  const gridItems = candidates.items.map(toOwnedGridItem);
  const gridRef = useRef<MediaGridHandle>(null);
  const focus = useGalleryFocus({
    gridRef,
    headingRef: null,
    ids: candidates.items.map((asset) => asset.assetId),
    isFetchingNextPage: candidates.isFetchingNextPage,
    hasNextPage: candidates.hasNextPage,
    onLoadMore: candidates.listProps.onEndApproach,
  });

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
  const submit = (): void =>
    void onConfirm([...selected])
      .then((stillOutstanding) => setSelected(new Set(stillOutstanding)))
      .catch(globalThis.reportError);

  let body: ReactElement;
  if (candidates.isPending) {
    body = <SkeletonRows count={6} shape="line" />;
  } else if (candidates.error !== null && candidates.items.length === 0) {
    // "NOTHING LEFT TO ADD" IS A CLAIM ABOUT THE READER'S UPLOADS: a failed read is its error state, never that.
    body = <QueryErrorState label="your images" onRetry={candidates.refetch} />;
  } else if (candidates.items.length === 0) {
    // The server filters before the limit, so an empty first page is the whole answer. The next step is a new
    // upload: the gallery dialog's zone.
    body = (
      <EmptyState
        icon={<Icon icon={Images} size="lg" />}
        title="Nothing left to add"
        description="Every image you own is already in this gallery. Upload a new one from the gallery instead."
        action={
          <Button intent="secondary" onClick={onUploadInstead}>
            Upload instead
          </Button>
        }
      />
    );
  } else {
    body = (
      <MediaGrid
        items={gridItems}
        ariaLabel="Your images"
        gapToken="row"
        selection={{ selectedIds: selected, onToggle: toggle }}
        className="max-h-64 @md:max-h-96"
        ref={gridRef}
      />
    );
  }

  return (
    <Stack gap="block">
      {body}
      <GalleryLoadMore
        hasNextPage={candidates.hasNextPage}
        isFetchingNextPage={candidates.isFetchingNextPage}
        failed={candidates.error !== null && candidates.items.length > 0}
        onLoadMore={focus.loadMore}
      />
      {failure === null ? null : (
        <Text className="text-destructive" role="alert" voice="label">
          {failure}
        </Text>
      )}
      {/* The count never breaks inside itself; at a phone's width the buttons wrap below it instead. */}
      <Row justify="between" align="center" gap="row" className="flex-wrap">
        <Text voice="gloss" className="whitespace-nowrap">
          {selected.size} selected
        </Text>
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
