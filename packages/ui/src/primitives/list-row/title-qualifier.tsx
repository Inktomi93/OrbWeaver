// The title line's qualifier and the dot before it. The dot is a span of its own so a qualifier that takes a line of its own
// starts on its first word; the dot that stays on the name's line is hidden, so no lone dot remains.

import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

/** The dot between a row's name and its qualifier, in both the painted line and the accessible name. */
export const TITLE_QUALIFIER_SEPARATOR = " · ";

export function TitleQualifier({
  clickable,
  qualifier,
  qualifierClass,
  separatorClass,
}: {
  readonly clickable: boolean;
  readonly qualifier: string;
  readonly qualifierClass: string;
  readonly separatorClass: string;
}): ReactElement {
  const separator = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [wrapped, setWrapped] = useState(false);

  // The dot keeps its box when hidden (`invisible`), so hiding it never lets the qualifier back onto the name's line. An observer reports its
  // size once on `observe`, so the first measure needs no call of its own.
  useEffect(() => {
    const dot = separator.current;
    const label = text.current;
    if (dot === null || label === null || label.parentElement === null) {
      return;
    }
    const observer = new ResizeObserver(() => setWrapped(label.getBoundingClientRect().top >= dot.getBoundingClientRect().bottom));
    observer.observe(label.parentElement);
    return (): void => observer.disconnect();
  }, []);

  return (
    <>
      <span
        aria-hidden={clickable ? true : undefined}
        className={separatorClass}
        data-slot="list-row-title-separator"
        data-wrapped={wrapped ? "" : undefined}
        ref={separator}
      >
        {TITLE_QUALIFIER_SEPARATOR}
      </span>
      <span aria-hidden={clickable ? true : undefined} className={qualifierClass} data-slot="list-row-title-qualifier" ref={text}>
        {qualifier}
      </span>
    </>
  );
}
