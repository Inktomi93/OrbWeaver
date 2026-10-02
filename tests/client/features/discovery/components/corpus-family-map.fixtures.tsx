import { useSelectedCorpusDestination } from "@orb/client/state";
import type { ReactElement } from "react";
import { CorpusFamilyMap } from "../../../../../packages/client/src/features/discovery/components/corpus-family-map.tsx";

export function FamilyMapFixture({
  families,
  width,
}: {
  readonly families: Parameters<typeof CorpusFamilyMap>[0]["families"];
  readonly width: number;
}): ReactElement {
  const selected = useSelectedCorpusDestination();
  return (
    <div style={{ width }}>
      <button type="button">Before families</button>
      <CorpusFamilyMap families={families} focal={false} canOpenFamilies={false} />
      <output aria-label="Selected family">{selected?.kind === "cluster" ? selected.title : "none"}</output>
    </div>
  );
}
