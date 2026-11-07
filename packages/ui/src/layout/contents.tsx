import type { ComponentProps, ReactElement } from "react";

/** An element that adds no box: its children take part in its parent's layout, for a landmark, a role or a data slot that must not move them. */
export function Contents(props: Omit<ComponentProps<"div">, "className">): ReactElement {
  return <div {...props} className="contents" />;
}
