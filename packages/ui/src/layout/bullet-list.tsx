import type { ComponentProps, ReactElement } from "react";
import { bulletListVariants } from "./variants.ts";

export type BulletListProps = Omit<ComponentProps<"ul">, "className">;

/** A semantic vertical list whose items hang their marker in one indent; its children are `li` elements. */
export function BulletList(props: BulletListProps): ReactElement {
  return <ul {...props} className={bulletListVariants()} />;
}
