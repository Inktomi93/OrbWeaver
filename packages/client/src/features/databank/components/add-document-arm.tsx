import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode, Ref } from "react";

/** One Add-document arm's region. Each arm reserves the tallest arm's height, so the mode strip and the footer hold one y as the mode changes. */
export function AddDocumentArm({ children, ref }: { readonly children: ReactNode; readonly ref?: Ref<HTMLDivElement> }): ReactElement {
  return (
    <Stack data-slot="add-document-arm" gap="block" minHeight="scrollLg" {...(ref === undefined ? {} : { ref })}>
      {children}
    </Stack>
  );
}
