// AvatarUpload — the one replace-the-picture control the persona editor and the character hero band share. Click opens
// the picker; a dropped image takes the same path. The upload runs here; the WRITE that gives the picture to its owner is
// the feature's, injected as `commit`, because a persona and a character commit through different verbs.
//
// UPLOAD-COMPLETE IS NOT COMMIT. The blob landing in the content-addressed store says nothing about the row pointing at it.
// The new picture and its confirmation ring appear when `commit` resolves; a refused write keeps the old picture and says so
// on the control's own line. A newer pick or drop supersedes an older one still in flight, so a slow upload never lands over
// the picture the person chose after it.
//
// FAILURE SHOWS IN PLACE. An oversize file, a refused upload and a refused write are one line under the control, linked to
// it with `aria-describedby`; the feature's mutation declares `failureShownInline` so no toast repeats the line.
//
// The button box IS the portrait box: a `PictureButton` sizes itself from its child, so the hit target, the confirm ring and
// the drop ring all trace the avatar's own circle (`shape="pill"`, no call-site radius). Never a `square` button, which
// stays a control-height square while the avatar paints outside it.
//
// HOME: `components/` may reach `#data` (the tier rule bars only features and routes), so the upload seam and the served size
// cap are read here once for both surfaces; the feature injects only what differs, the write.

import type { StoredAsset } from "@orb/contracts/assets";
import { blobUrl } from "@orb/contracts/assets";
import { Avatar } from "@orb/ui/avatar";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Corner, Stack } from "@orb/ui/layout";
import { PictureButton } from "@orb/ui/picture-button";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { UploadRefusedError, useUploadAsset, useUploadCaps } from "#data";
import { AVATAR_UPLOADING_NAME, AVATAR_WRITE_REFUSED, avatarUploadFailedLine, oversizeUploadMessage } from "#lib";
import { useFileDrop } from "./use-file-drop.ts";

/** How long the confirmation ring stays on the portrait after the write commits. */
const CONFIRM_MS = 1500;

export interface AvatarUploadProps {
  /** The control's accessible name. */
  readonly name: string;
  /** Stable identity for the fallback hue. */
  readonly hueSeed: string;
  /** The fallback inside the avatar while there is no picture. */
  readonly initials: string;
  readonly size: "md" | "hero";
  /** The picture the owner row points at now; null when it has none. */
  readonly avatarHash: string | null;
  /** The feature's write: resolves once the row points at the new asset, rejects when it refuses. */
  readonly commit: (stored: StoredAsset) => Promise<unknown>;
}

interface Landing {
  readonly upload: (file: File, kind: "avatar") => Promise<StoredAsset>;
  readonly commit: AvatarUploadProps["commit"];
  /** False once a newer pick or drop has taken over the control. */
  readonly isCurrent: () => boolean;
}

/** Upload then write. `undefined` when a newer attempt superseded this one, so it says nothing and shows nothing. */
async function land(file: File, { upload, commit, isCurrent }: Landing): Promise<{ readonly landed: StoredAsset } | { readonly refused: string } | undefined> {
  let stored: StoredAsset;
  try {
    stored = await upload(file, "avatar");
  } catch (error) {
    return isCurrent() ? { refused: avatarUploadFailedLine(error instanceof UploadRefusedError ? error.reason : undefined) } : undefined;
  }
  if (!isCurrent()) {
    return;
  }
  try {
    await commit(stored);
  } catch {
    return isCurrent() ? { refused: AVATAR_WRITE_REFUSED } : undefined;
  }
  return isCurrent() ? { landed: stored } : undefined;
}

export function AvatarUpload({ name, hueSeed, initials, size, avatarHash, commit }: AvatarUploadProps): ReactElement {
  const upload = useUploadAsset();
  const uploadCaps = useUploadCaps();
  const errorId = useId();
  // The picture the last committed write chose, shown until the owner row's own hash changes under it.
  const [committed, setCommitted] = useState<{ readonly basis: string | null; readonly hash: string } | undefined>();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const attempt = useRef(0);

  const shownHash = committed !== undefined && committed.basis === avatarHash ? committed.hash : avatarHash;

  async function replace(file: File): Promise<void> {
    const mine = ++attempt.current;
    const oversize = oversizeUploadMessage(file, uploadCaps.assetUpload);
    setFailure(oversize);
    setWorking(oversize === undefined);
    if (oversize !== undefined) {
      return;
    }
    const outcome = await land(file, { upload, commit, isCurrent: (): boolean => mine === attempt.current });
    if (outcome === undefined) {
      return;
    }
    setWorking(false);
    if ("refused" in outcome) {
      setFailure(outcome.refused);
      return;
    }
    setCommitted({ basis: avatarHash, hash: outcome.landed.hash });
    // A static ring flash, no keyframe (reduced-motion-safe by construction); clears itself shortly after.
    setConfirming(true);
    globalThis.setTimeout((): void => setConfirming(false), CONFIRM_MS);
  }

  const { dragActive, dropTargetProps } = useFileDrop(([file]) => {
    if (file !== undefined) {
      replace(file).catch(globalThis.reportError);
    }
  });
  const src = shownHash === null ? {} : { src: blobUrl(shownHash) };
  return (
    <Stack align="start" cap="avatarHero" className="relative shrink-0" gap="tight">
      <FileTrigger
        accept="image/*"
        onFilesSelected={([file]): void => {
          if (file !== undefined) {
            replace(file).catch(globalThis.reportError);
          }
        }}
      >
        {({ open }): ReactElement => (
          <PictureButton
            {...dropTargetProps}
            aria-busy={working ? true : undefined}
            aria-describedby={failure === undefined ? undefined : errorId}
            aria-label={name}
            confirming={confirming || dragActive}
            data-drag-over={dragActive ? "" : undefined}
            onClick={open}
            reach={size === "md" ? "floor" : undefined}
            shape="pill"
            variant="ghost"
          >
            <Avatar fallbackDelay={0} hueSeed={hueSeed} size={size} {...src}>
              {initials}
            </Avatar>
          </PictureButton>
        )}
      </FileTrigger>
      {/* Beside the button, not in it: a button's children are presentational, so a status inside it is never announced. The
          button's own `aria-busy` and this mark say the same thing. */}
      {working ? (
        <Corner>
          <WebSpinner label={AVATAR_UPLOADING_NAME} size="sm" />
        </Corner>
      ) : null}
      {failure === undefined ? null : (
        <Text id={errorId} role="alert" voice="gloss">
          {failure}
        </Text>
      )}
    </Stack>
  );
}
