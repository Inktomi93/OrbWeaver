import { useRef } from "react";
import type { ArtView } from "../components/art-slot.tsx";

/** Shares the row's visible image control with its decorative pointer targets. */
export function useArtControl(): ArtView["control"] {
  const openerRef = useRef<HTMLButtonElement | null>(null);
  return {
    attach: (opener): void => {
      openerRef.current = opener;
    },
    activate: (): void => {
      openerRef.current?.click();
    },
  };
}
