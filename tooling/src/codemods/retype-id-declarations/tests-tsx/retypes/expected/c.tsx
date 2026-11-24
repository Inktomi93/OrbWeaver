import type { ReactElement } from "react";
import type { CharacterId } from "@orb/kit/ids";

export function Row({ onSelect }: { readonly onSelect: (id: CharacterId) => void }): ReactElement {
  return <button onClick={() => onSelect("x")} />;
}
