// The per-kind templates `pnpm doc new` and `pnpm doc item` mint from. Each carries exactly the sections
// `lib/rules.ts` requires for the kind. A section the author filled at mint time (its content flag)
// carries that text; any other keeps a one-line prompt, so a minted file is never a silent placeholder:
// the check reads the section, the author replaces the line.
import type { AdrSectionFlag, ItemSectionFlag, PlanSectionFlag, SectionContent } from "../contract/types.ts";
import { renderFrontmatter } from "./frontmatter-write.ts";

/** `flag` is the section's content flag, or null for a section only a later verb fills. */
interface Section<F extends string> {
  readonly name: string;
  readonly prompt: string;
  readonly flag: F | null;
}

export const ADR_SECTIONS: readonly Section<AdrSectionFlag>[] = [
  { name: "Context", prompt: "What forced the decision, in a paragraph.", flag: "context" },
  { name: "Decision", prompt: "The ruling, stated so a cold reader can apply it.", flag: "decision" },
  { name: "Consequences", prompt: "What becomes easier, what becomes harder, what the checker enforces.", flag: "consequences" },
  { name: "Alternatives rejected", prompt: "One line per option and the reason it lost.", flag: "alternatives" },
];

export const PLAN_SECTIONS: readonly Section<PlanSectionFlag>[] = [
  { name: "Goal", prompt: "The outcome, in a sentence.", flag: "goal" },
  { name: "Shape", prompt: "The chosen shape, with the homes it touches.", flag: "shape" },
  { name: "Rejected", prompt: "One line per option and the reason it lost.", flag: "rejected" },
  { name: "Coupled sites", prompt: "Every file a lane must touch, one line each.", flag: "coupled" },
  { name: "Test plan", prompt: "Each red-first test and its planted control; the suites that run.", flag: "test-plan" },
];

export const ITEM_SECTIONS: readonly Section<ItemSectionFlag>[] = [
  { name: "What", prompt: "The change, in a sentence.", flag: "what" },
  { name: "Why", prompt: "The symptom or the ruling behind it.", flag: "why" },
  { name: "Done when", prompt: "The observable bar a verifier can check.", flag: "done" },
  { name: "Evidence", prompt: "Filled at landing: what ran and where its output is.", flag: null },
];

export function sectionNames<F extends string>(sections: readonly Section<F>[]): readonly string[] {
  return sections.map((section) => section.name);
}

/** The content flags a kind takes, in section order. */
export function sectionFlags<F extends string>(sections: readonly Section<F>[]): readonly F[] {
  return sections.flatMap((section) => (section.flag === null ? [] : [section.flag]));
}

function render<F extends string>(sections: readonly Section<F>[], content: SectionContent<F>): string {
  return sections
    .map((section) => {
      const text = section.flag === null ? undefined : content[section.flag]?.trim();
      return `## ${section.name}\n\n${text === undefined || text === "" ? section.prompt : text}\n`;
    })
    .join("\n");
}

export function adrTemplate(title: string, today: string, content: SectionContent<AdrSectionFlag> = {}): string {
  return `${renderFrontmatter({ kind: "adr", status: "active", updated: today })}\n# ${title}\n\n${render(ADR_SECTIONS, content)}`;
}

export function planTemplate(title: string, today: string, content: SectionContent<PlanSectionFlag> = {}): string {
  return `${renderFrontmatter({ kind: "plan", status: "active", updated: today })}\n# ${title}\n\n${render(PLAN_SECTIONS, content)}`;
}

export function itemTemplate(fields: Readonly<Record<string, string>>, title: string, content: SectionContent<ItemSectionFlag> = {}): string {
  return `${renderFrontmatter(fields)}\n# ${title}\n\n${render(ITEM_SECTIONS, content)}`;
}
