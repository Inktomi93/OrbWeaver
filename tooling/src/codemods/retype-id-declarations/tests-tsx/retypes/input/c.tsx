import type { ReactElement } from "react";

export function Row({ onSelect }: { readonly onSelect: (id: string) => void }): ReactElement {
  return <button onClick={() => onSelect("x")} />;
}
