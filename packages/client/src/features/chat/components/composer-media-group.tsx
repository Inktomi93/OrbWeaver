// The composer ✨ menu's MEDIA group: attach images and video, generate from text, the /imagine door, and the
// character gallery door. Split from `composer-utility-menu.tsx`, which renders it; the composer owns the
// controls (`ComposerImageControls`) and this file only renders them as menu rows.

import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, ImagePlus, Images, LayoutGrid, Sparkles } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuGroup, MenuGroupLabel, MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef } from "react";
import { IMAGE_GEN_SPENDS_NOW, IMAGINE_DOOR_HELPER, ROOM_PICTURES_NOTE, testId } from "#lib";
// The picker's file-type filter is DERIVED from the shared attach vocabulary (#376) — the drop and paste
// gestures gate on the same tuple, so the dialog filter and the runtime gate cannot drift.
import { ATTACH_MEDIA_ACCEPT } from "../lib/attach-media.ts";

/** The image controls the ✨ menu's Media group renders — attach, generate-from-text, /imagine and the gallery
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
  /** Opens the `/imagine` modal seeded with whatever is typed (#623 P1-IA) — the SECOND, safer image door.
   *
   *  ALWAYS actionable, and that asymmetry is the point: generate-from-text needs a prompt because the typed
   *  text IS the prompt, while an extraction mode reads the conversation instead — so on the empty composer
   *  a first-timer meets an enabled door that shows the price before spending, not a greyed-out one. Free
   *  mode with no text is a legal seed (the modal's own Generate carries the gate). */
  readonly onOpenImagine: () => void;
  /** The room's gallery door (`useRoomGalleryDoor`): the character whose gallery opens, or `null` when the viewer
   *  owns no character here. A gallery is its character's owner's, so the door is permission-gated and a viewer
   *  without one gets no row at all, the one exception to this menu's disabled-with-a-reason posture. */
  readonly gallery: { readonly characterName: string; readonly open: () => void } | null;
}

/** The ✨ menu's MEDIA group — attach, the two image doors, and the room's gallery door. The label, items and
 *  hidden picker live together so the menu file stays one concern per group. */
export function ComposerMediaGroup({ image }: { readonly image: ComposerImageControls }): ReactElement {
  return (
    <MenuGroup>
      <MediaGroupLabel sharedRoom={image.sharedRoom} />
      <AttachMediaItem maxAttachmentBytes={image.maxAttachmentBytes} disabled={image.uploadDisabled} onAddFiles={image.onAddFiles} />
      {/* TWO IMAGE DOORS, BOTH FINDABLE (#623 P1-IA). The split itself is a RULING, not an accident —
          `features/imagery/index.ts`'s scope fence keeps this fast composer-owned door in chat and calls
          /imagine "the richer surface (mode + preview) BESIDE it, not a replacement". What was defective
          was that only the blind-spend door was discoverable: /imagine was reachable only by knowing to
          type `/`, so a first-timer's default path spends with no mode, no preview and no stated price.
          So the ruling stands and its symptom is closed by putting the beside-door literally beside it.
          This row names its spend (an enabled `title` is the Regenerate/`helper` idiom, not a disabled
          reason); the row under it is the one that lets you look first. */}
      <MenuItem
        closeOnClick={false}
        disabled={!image.canGenerate}
        title={image.canGenerate ? IMAGE_GEN_SPENDS_NOW : image.generateReason}
        data-testid={testId("composerGenerateImage")}
        onClick={image.canGenerate ? image.onGenerate : undefined}
      >
        <Icon icon={Sparkles} size="sm" />
        {image.generating ? "Generating image…" : "Generate image from text"}
      </MenuItem>
      <MenuItem data-testid={testId("composerOpenImagine")} onClick={image.onOpenImagine} title={IMAGINE_DOOR_HELPER}>
        <Icon icon={Images} size="sm" />
        Imagine — modes & preview…
      </MenuItem>
      {image.gallery === null ? null : (
        <MenuItem onClick={image.gallery.open}>
          <Icon icon={LayoutGrid} size="sm" />
          {image.gallery.characterName}'s gallery…
        </MenuItem>
      )}
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
