// AvatarUpload — the one replace-the-picture control the persona editor and the character hero band share. Click opens
// the picker; a dropped image takes the same path. The upload runs here; the WRITE that gives the picture to its owner is
// the feature's, injected as `commit`, because a persona and a character commit through different verbs.
//
// UPLOAD-COMPLETE IS NOT COMMIT. The blob landing in the content-addressed store says nothing about the row pointing at it.
// The new picture and its confirmation ring appear when `commit` resolves and only while that write is the newest; a refused
// write keeps the old picture and says so on the control's own line.
//
// WRITES ARE ORDERED. A newer pick or drop supersedes an older one: an older upload that finishes later is dropped, an older
// write not yet sent is dropped, and an older write already in flight is followed by the newer write once it settles, whatever
// its outcome. So the newest pick is always the last write the row receives, and nothing older is ever left as the picture.
//
// ONE ACCEPTANCE RULE for every way a file arrives (the picker and a drop): exactly one file, an image type, within the served
// size cap. A refused entry says what is accepted on the control's own line, and nothing is uploaded.
//
// FAILURE SHOWS IN PLACE WHEN ITS PLACE IS ON SCREEN. An oversize file, a refused upload and a refused write are one line under
// the control, linked to it with `aria-describedby`; the feature's mutation declares `failureShownInline` so no toast repeats the
// line. Once the control is gone there is no place for the line, so an upload that fails after that toasts instead, and the
// mutation toasts a write that fails after that.
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
import { useEffect, useId, useRef, useState } from "react";
import { UploadRefusedError, useUploadAsset, useUploadCaps } from "#data";
import {
  AVATAR_DROP_A_FILE,
  AVATAR_NOT_A_PICTURE,
  AVATAR_ONE_AT_A_TIME,
  AVATAR_UPLOADING_NAME,
  AVATAR_WRITE_REFUSED,
  avatarUploadFailedLine,
  notify,
  oversizeUploadMessage,
} from "#lib";
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

/** The line that refuses an entry, or undefined when it is one image within the cap. */
function refusalLine(files: readonly File[], maxBytes: number): string | undefined {
  const [file, ...rest] = files;
  if (file === undefined) {
    return AVATAR_DROP_A_FILE;
  }
  if (rest.length > 0) {
    return AVATAR_ONE_AT_A_TIME;
  }
  if (!file.type.startsWith("image/")) {
    return AVATAR_NOT_A_PICTURE;
  }
  return oversizeUploadMessage(file, maxBytes);
}

/**
 * Sends a write after every earlier one has settled, whatever their outcome, unless a newer pick has taken over by then:
 * `undefined` means this write was dropped unsent.
 */
async function writeInTurn(previous: Promise<unknown>, send: () => Promise<unknown>, isCurrent: () => boolean): Promise<"committed" | "refused" | undefined> {
  await previous;
  if (!isCurrent()) {
    return;
  }
  try {
    await send();
    return "committed";
  } catch {
    return "refused";
  }
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
  // Bookkeeping the render never reads: the newest pick's number, the tail of the write queue, whether the control is on
  // screen, and the row's picture as of the latest render (the basis a committed picture is shown against).
  const attempt = useRef(0);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(false);
  const rowHash = useRef(avatarHash);
  useEffect(() => {
    rowHash.current = avatarHash;
  }, [avatarHash]);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  const shownHash = committed !== undefined && committed.basis === avatarHash ? committed.hash : avatarHash;

  // The upload's failure shows on the line while the control is on screen, and by toast once there is no place for the line.
  function reportUploadFailure(error: unknown): void {
    const line = avatarUploadFailedLine(error instanceof UploadRefusedError ? error.reason : undefined);
    if (mounted.current) {
      setWorking(false);
      setFailure(line);
    } else {
      notify.error(line);
    }
  }

  async function replace(file: File): Promise<void> {
    const mine = ++attempt.current;
    const isCurrent = (): boolean => mine === attempt.current;
    setFailure(undefined);
    setWorking(true);
    const stored = await upload(file, "avatar").catch((error: unknown) => {
      if (isCurrent()) {
        reportUploadFailure(error);
      }
    });
    if (stored === undefined || !isCurrent()) {
      return;
    }
    const turn = writeInTurn(writes.current, () => commit(stored), isCurrent);
    writes.current = turn;
    const outcome = await turn;
    if (outcome === undefined || !isCurrent()) {
      return;
    }
    setWorking(false);
    if (outcome === "refused") {
      setFailure(AVATAR_WRITE_REFUSED);
      return;
    }
    setCommitted({ basis: rowHash.current, hash: stored.hash });
    // A static ring flash, no keyframe (reduced-motion-safe by construction); clears itself shortly after.
    setConfirming(true);
    globalThis.setTimeout((): void => setConfirming(false), CONFIRM_MS);
  }

  function take(files: readonly File[]): void {
    const refusal = refusalLine(files, uploadCaps.assetUpload);
    const [file] = files;
    if (refusal !== undefined || file === undefined) {
      setFailure(refusal);
      return;
    }
    replace(file).catch(globalThis.reportError);
  }

  // A drag carrying no file is claimed too, so the drop can say what the control takes.
  const { dragActive, dropTargetProps } = useFileDrop(take, { claimsAnyDrag: true });
  const src = shownHash === null ? {} : { src: blobUrl(shownHash) };
  return (
    <Stack align="start" cap="avatarHero" className="relative shrink-0" gap="tight">
      <FileTrigger accept="image/*" onFilesSelected={take}>
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
