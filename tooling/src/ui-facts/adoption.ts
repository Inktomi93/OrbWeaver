// Primitive adoption: raw against primitive elements per section.
import type { FileFacts } from "../eslint/index.ts";

export interface SectionAdoption {
  readonly section: string;
  readonly raw: number;
  readonly ui: number;
  readonly composite: number;
  readonly local: number;
  /** Primitive elements over raw plus primitive elements. */
  readonly share: number;
}

export function adoptionBySection(all: readonly FileFacts[]): readonly SectionAdoption[] {
  const bySection = new Map<string, { raw: number; ui: number; composite: number; local: number }>();
  for (const facts of all) {
    if (facts.source.layer !== "client") {
      continue;
    }
    const row = bySection.get(facts.source.section) ?? { raw: 0, ui: 0, composite: 0, local: 0 };
    for (const elem of facts.elems) {
      row[elem.kind] += 1;
    }
    bySection.set(facts.source.section, row);
  }
  return [...bySection.entries()]
    .map(([section, row]) => ({ section, ...row, share: row.raw + row.ui === 0 ? 0 : row.ui / (row.raw + row.ui) }))
    .sort((a, b) => a.share - b.share);
}
