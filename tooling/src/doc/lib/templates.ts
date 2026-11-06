// The per-kind templates `pnpm doc new` and `pnpm doc item` mint from. Each carries exactly the sections
// `lib/rules.ts` requires for the kind. A section the author filled at mint time (its content flag)
// carries that text; any other keeps a one-line prompt, so a minted file is never a silent placeholder:
// the check reads the section, the author replaces the line. An item's What, Why and Done when are the
// exception: a mint refuses them at a prompt, and `drift` names any item that still holds one.
import type { AdrSectionFlag, ItemEditFlag, ItemSectionFlag, PlanSectionFlag, SectionContent } from "../contract/types.ts";
import { ITEM_SECTION_FLAGS } from "../contract/types.ts";
import { renderFrontmatter, sectionText } from "./frontmatter-write.ts";

/** `flag` is the section's content flag, or null for a section no verb fills from text. It need not be a mint flag: Evidence's is `edit`-only. */
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

export const ITEM_SECTIONS: readonly Section<ItemEditFlag>[] = [
  { name: "What", prompt: "The change, in a sentence.", flag: "what" },
  { name: "Why", prompt: "The symptom or the ruling behind it.", flag: "why" },
  { name: "Done when", prompt: "The observable bar a verifier can check.", flag: "done" },
  { name: "Evidence", prompt: "Filled at landing: what ran and where its output is.", flag: "evidence" },
];

type AuthoredSection = Section<ItemSectionFlag> & { readonly flag: ItemSectionFlag };

function isAuthored(section: Section<ItemEditFlag>): section is AuthoredSection {
  return ITEM_SECTION_FLAGS.some((flag) => flag === section.flag);
}

/** What, Why and Done when: the sections an author writes at mint. Evidence keeps its prompt until landing. */
const AUTHORED_ITEM_SECTIONS = ITEM_SECTIONS.filter(isAuthored);

/** The authored flags `content` leaves absent, blank or equal to the section's own prompt. */
export function unwrittenItemFlags(content: SectionContent<ItemSectionFlag>): readonly ItemSectionFlag[] {
  return AUTHORED_ITEM_SECTIONS.flatMap(({ flag, prompt }) => {
    const text = content[flag]?.trim();
    return text === undefined || text === "" || text === prompt ? [flag] : [];
  });
}

/** The authored flags whose section in an item body is, whole, its template prompt. A section quoting the
 *  prompt inside longer prose is written text and does not count. */
export function templateItemFlags(body: string): readonly ItemSectionFlag[] {
  return AUTHORED_ITEM_SECTIONS.flatMap(({ name, flag, prompt }) => (sectionText(body, name) === prompt ? [flag] : []));
}

export function sectionNames<F extends string>(sections: readonly Section<F>[]): readonly string[] {
  return sections.map((section) => section.name);
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

export function planTemplate(title: string, today: string, rank: number, content: SectionContent<PlanSectionFlag> = {}): string {
  return `${renderFrontmatter({ kind: "plan", status: "active", updated: today, rank: String(rank) })}\n# ${title}\n\n${render(PLAN_SECTIONS, content)}`;
}

/** A law doc has no required sections: the rule decides its shape. */
export function lawTemplate(title: string, today: string): string {
  return `${renderFrontmatter({ kind: "law", status: "active", updated: today })}\n# ${title}\n\nThe rule, stated so an agent can follow it without asking.\n`;
}

export function itemTemplate(fields: Readonly<Record<string, string>>, title: string, content: SectionContent<ItemSectionFlag> = {}): string {
  return `${renderFrontmatter(fields)}\n# ${title}\n\n${render<ItemEditFlag>(ITEM_SECTIONS, content)}`;
}
