// The gallery's add-picker: a multi-select grid of the owner's own images, added to one character's gallery
// as a per-asset batch. A partial failure keeps exactly the rejected assets selected, so a retry resubmits
// only those. Opened from the gallery dialog (`anchors/character-gallery-dialog.tsx`).

import { blobUrl } from "@orb/contracts/assets";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// @orb-waive dialog-via-composite(Dialog): the gallery add-picker owns its root and selection surface; ends if a gallery-dialog composite owns that species.
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Images } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { MediaGridItem, MediaGridKey } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { GALLERY_PAGE_LIMIT, useAddToGallery } from "../hooks/use-character-gallery.ts";
import { galleryThumbUrl } from "../lib/gallery-thumb.ts";

type OwnedAsset = inferOutput<Trpc["assets"]["listOwned"]>[number];

function toOwnedGridItem(asset: OwnedAsset): MediaGridItem {
  return {
    id: asset.assetId,
    url: blobUrl(asset.hash),
    thumbUrl: galleryThumbUrl(asset.hash),
    animated: asset.animated,
    alt: `${asset.kind} image`,
  };
}

interface GalleryAddPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly characterId: CharacterId;
  readonly existingAssetIds: ReadonlySet<AssetId>;
}

export function GalleryAddPicker({ open, onOpenChange, characterId, existingAssetIds }: GalleryAddPickerProps): ReactElement {
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
