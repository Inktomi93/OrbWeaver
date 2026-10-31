import type { ReactElement } from "react";
import type { StackProps } from "../stack.tsx";
import { Stack } from "../stack.tsx";
import { spoilerVariants } from "./variants.ts";

interface SpoilerProps extends StackProps {
  /** The reader has not revealed the content: it blurs and takes no selection. */
  readonly concealed: boolean;
}

/**
 * Content the reader asked not to see yet. It is a Stack that owns only the spoiler skin, so its layout props
 * are the Stack's and a call site changes no DOM depth. The state is `data-concealed`, which the skin keys on.
 */
export function Spoiler({ concealed, className, ...rest }: SpoilerProps): ReactElement {
  return <Stack {...rest} className={spoilerVariants({ className })} data-concealed={concealed ? "" : undefined} data-slot="spoiler" />;
}
