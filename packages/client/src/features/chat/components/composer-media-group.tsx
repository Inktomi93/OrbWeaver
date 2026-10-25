// The composer ✨ menu's MEDIA group: attach images and video, generate from text, and the /imagine door.
// Split from `composer-utility-menu.tsx`, which renders it; the composer owns the
// controls (`ComposerImageControls`) and this file only renders them as menu rows.

import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, ImagePlus, Images, Sparkles } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuGroup, MenuGroupLabel, MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { DescribedMenuItem } from "#components";
import { IMAGE_GEN_SPENDS_NOW, IMAGINE_DOOR_HELPER, ROOM_PICTURES_NOTE, testId } from "#lib";
// The picker's file-type filter is DERIVED from the shared attach vocabulary — the drop and paste
// gestures gate on the same tuple, so the dialog filter and the runtime gate cannot drift.
import { ATTACH_MEDIA_ACCEPT } from "../lib/attach-media.ts";

/** The image controls the ✨ menu's Media group renders — attach, immediate generation and the modes/preview
 *  door. Owned by the composer (upload caps, the generate hook, the F-P1 clear-on-success); the wand only renders
 *  them. Homed HERE (the group that renders them) so the cluster imports it DOWN this one edge — no import cycle. */
export interface ComposerImageControls {
  readonly maxAttachmentBytes: number;
  readonly uploadDisabled: boolean;
  readonly onAddFiles: (result: FileDropzoneResult) => void;
  readonly canGenerate: boolean;
  readonly generateReason: string | undefined;
  readonly generating: boolean;
  readonly onGenerate: () => void;
  /** True in a shared room: both image doors post the picture into the room, so the Media group says so. */
  readonly sharedRoom: boolean;
  /** Opens the `/imagine` modal seeded with whatever is typed — the SECOND, safer image door.
   *
   *  ALWAYS actionable, and that asymmetry is the point: generate-from-text needs a prompt because the typed
   *  text IS the prompt, while an extraction mode reads the conversation instead — so on the empty composer
   *  a first-timer meets an enabled door that shows the price before spending, not a greyed-out one. Free
   *  mode with no text is a legal seed (the modal's own Generate carries the gate). */
  readonly onOpenImagine: () => void;
}

/** The ✨ menu's MEDIA group — attach and the two distinct image-generation doors. The label, items and
 *  hidden picker live together so the menu file stays one concern per group. */
export function ComposerMediaGroup({ image }: { readonly image: ComposerImageControls }): ReactElement {
  return (
    <MenuGroup>
      <MediaGroupLabel sharedRoom={image.sharedRoom} />
      <AttachMediaItem maxAttachmentBytes={image.maxAttachmentBytes} disabled={image.uploadDisabled} onAddFiles={image.onAddFiles} />
      {/* TWO IMAGE DOORS, BOTH FINDABLE. The split itself is a RULING, not an accident —
          `features/imagery/index.ts`'s scope boundary keeps this fast composer-owned door in chat and calls
          /imagine "the richer surface (mode + preview) BESIDE it, not a replacement". So the beside-door sits
          literally beside it: a door reachable only by typing `/` would leave a first-timer's default path
          spending with no mode, no preview and no stated price.
          This row names its spend in its detail line (an enabled helper, the Regenerate idiom, or the
          disabled reason); the row under it is the one that lets you look first. */}
      <DescribedMenuItem
        closeOnClick={false}
        data-testid={testId("composerGenerateImage")}
        detail={image.canGenerate ? IMAGE_GEN_SPENDS_NOW : image.generateReason}
        disabled={!image.canGenerate}
        icon={Sparkles}
        label={image.generating ? "Generating image…" : "Generate image from text"}
        onClick={image.canGenerate ? image.onGenerate : undefined}
      />
      <DescribedMenuItem
        data-testid={testId("composerOpenImagine")}
        detail={IMAGINE_DOOR_HELPER}
        icon={Images}
        label="Imagine — modes & preview…"
        onClick={image.onOpenImagine}
      />
    </MenuGroup>
  );
}

/** The Media group's label. In a shared room it carries the sentence that generated pictures post into the
 *  room: it rides the group label because a menu may own only items, groups and separators, and the label is
 *  the group's accessible name, so a screen reader hears the sentence on entering the group. */
function MediaGroupLabel({ sharedRoom }: { readonly sharedRoom: boolean }): ReactElement {
  if (!sharedRoom) {
    return <MenuGroupLabel>Media</MenuGroupLabel>;
  }
  return (
    <MenuGroupLabel>
      <Stack gap="field">
        <Text as="span">Media</Text>
        {/* Inline-size containment keeps the sentence from setting the popup's width: it wraps to the
            width the menu rows set, so the popup stays inside a phone viewport. */}
        <Text as="span" voice="gloss" className="contain-inline-size" data-slot="composer-room-pictures-note">
          {ROOM_PICTURES_NOTE}
        </Text>
      </Stack>
    </MenuGroupLabel>
  );
}

// Attach images & video — the sanctioned FileDropzone picker (a raw file input is gate-banned in features).
// The input is kept OUT of the menuitem's accessible-name subtree (P1-C): it renders hidden (aria-hidden +
// tabIndex -1 so it is neither a focus target nor an announced control), and the menuitem TRIGGERS it via a
// ref click. The menuitem carries the single clean accessible name; `closeOnClick={false}` keeps the menu
// open through the OS dialog. Screen readers see exactly one control: "Attach images & video, up to {size}
// per file."
function AttachMediaItem({
  maxAttachmentBytes,
  disabled,
  onAddFiles,
}: {
  readonly maxAttachmentBytes: number;
  readonly disabled: boolean;
  readonly onAddFiles: ComposerImageControls["onAddFiles"];
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = (): void => {
    inputRef.current?.click();
  };
  return (
    <>
      <MenuItem
        closeOnClick={false}
        disabled={disabled}
        aria-label={`Attach images & video, up to ${formatMib(maxAttachmentBytes)} per file`}
        data-testid={testId("composerAttachImages")}
        onClick={disabled ? undefined : openPicker}
      >
        <Icon icon={ImagePlus} size="sm" />
        Attach images & video
      </MenuItem>
      {/* The real picker, hidden off the accessible tree — the row above triggers its input via the ref. Kept
          inside the popup so its focus/portal context is the menu's, never a stray body-level input. */}
      <FileDropzone
        ref={inputRef}
        accept={ATTACH_MEDIA_ACCEPT}
        multiple={true}
        maxSizeBytes={maxAttachmentBytes}
        disabled={disabled}
        onFilesSelected={onAddFiles}
        instructions=""
        aria-hidden={true}
        tabIndex={-1}
        // `hidden` (display:none) drops the whole picker from BOTH layout and the accessibility tree — the row
        // above is the only visible/announced control; a display:none file input still opens on a programmatic
        // .click() (Chromium) and accepts setInputFiles, so the upload + CT paths are unaffected.
        className="hidden"
      />
    </>
  );
}

// The accessible-name byte-size hint (MB, one decimal) — a plain decimal render of the served image cap so the
// menuitem's name states the limit without depending on the dropzone's own visible hint copy.
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const ONE_DECIMAL = 10;
function formatMib(bytes: number): string {
  const mib = bytes / BYTES_PER_MIB;
  const rounded = Math.round(mib * ONE_DECIMAL) / ONE_DECIMAL;
  return `${rounded} MB`;
}
