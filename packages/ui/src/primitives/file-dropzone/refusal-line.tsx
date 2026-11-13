import type { ComponentPropsWithRef, ReactElement } from "react";
import { Icon, TriangleAlert } from "#primitives/icons";
import { REFUSAL_GLYPH_NAME } from "./file-dropzone-names.ts";
import { fileDropzoneVariants } from "./variants.ts";

// The refusal line of a file control: the destructive glyph and the reason, wrapping inside its own width. The dropzone, whether on its own or as
// its Field.Error, and a control that takes a file without a zone (the avatar) say a refusal the same way, so the voice has one home.

// The glyph and the reason, the content of every refusal line.
function RefusalBody({ message }: { readonly message: string }): ReactElement {
  const slots = fileDropzoneVariants();
  return (
    <>
      <Icon className={slots.errorIcon()} icon={TriangleAlert} label={REFUSAL_GLYPH_NAME} size="xs" />
      <span className={slots.errorText()}>{message}</span>
    </>
  );
}

/** A refusal said on its own line, announced when it appears. The caller links it to the control with `aria-describedby` through `id`. */
export function RefusalLine({
  message,
  ...rest
}: { readonly message: string } & Omit<ComponentPropsWithRef<"p">, "children" | "className" | "role">): ReactElement {
  const slots = fileDropzoneVariants();
  return (
    <p {...rest} className={slots.error()} data-slot="file-dropzone-error" role="alert">
      <RefusalBody message={message} />
    </p>
  );
}
