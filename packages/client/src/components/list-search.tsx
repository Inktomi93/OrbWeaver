import { Contents } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

/** Marks the rendered search boundary without changing a roster's control or layout. */
export function ListSearch({ children }: { readonly children: ReactNode }): ReactElement {
  return <Contents data-slot="list-search">{children}</Contents>;
}
