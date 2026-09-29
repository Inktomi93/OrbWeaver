// The composer utility menu's attach action owns its hidden FileDropzone, so the OS picker has one
// accessible menu item while the real input remains inside the popup's focus and portal context.

import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, ImagePlus } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useRef } from "react";
import { testId } from "#lib";
import { ATTACH_MEDIA_ACCEPT } from "../lib/attach-media.ts";

interface AttachMediaItemProps {
  readonly maxAttachmentBytes: number;
  readonly disabled: boolean;
  readonly onAddFiles: (result: FileDropzoneResult) => void;
}

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const ONE_DECIMAL = 10;

function formatMib(bytes: number): string {
  const mib = bytes / BYTES_PER_MIB;
  const rounded = Math.round(mib * ONE_DECIMAL) / ONE_DECIMAL;
  return `${rounded} MB`;
}

/** The menu item stays the only announced action; its hidden picker accepts the same media vocabulary. */
export function AttachMediaItem({ maxAttachmentBytes, disabled, onAddFiles }: AttachMediaItemProps): ReactElement {
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
        className="hidden"
      />
    </>
  );
}
