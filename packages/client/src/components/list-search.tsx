import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

/** Marks the rendered search boundary without changing a roster's control or layout. */
export function ListSearch({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Stack className="contents" data-slot="list-search">
      {children}
    </Stack>
  );
}
