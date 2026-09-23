// The per-kind templates `pnpm doc new` and `pnpm doc item` mint from. Each carries exactly the sections
// `lib/rules.ts` requires for the kind, with a one-line prompt under each so a minted file is never a
// silent placeholder: the check reads the section, the author replaces the line.
import { renderFrontmatter } from "./frontmatter-write.ts";

interface Section {
  readonly name: string;
  readonly prompt: string;
}

export const ADR_SECTIONS: readonly Section[] = [
  { name: "Context", prompt: "What forced the decision, in a paragraph." },
  { name: "Decision", prompt: "The ruling, stated so a cold reader can apply it." },
  { name: "Consequences", prompt: "What becomes easier, what becomes harder, what the checker enforces." },
  { name: "Alternatives rejected", prompt: "One line per option and the reason it lost." },
];

export const PLAN_SECTIONS: readonly Section[] = [
  { name: "Goal", prompt: "The outcome, in a sentence." },
  { name: "Shape", prompt: "The chosen shape, with the homes it touches." },
  { name: "Rejected", prompt: "One line per option and the reason it lost." },
  { name: "Coupled sites", prompt: "Every file a lane must touch, one line each." },
  { name: "Test plan", prompt: "Each red-first test and its planted control; the suites that run." },
];

export const ITEM_SECTIONS: readonly Section[] = [
  { name: "What", prompt: "The change, in a sentence." },
  { name: "Why", prompt: "The symptom or the ruling behind it." },
  { name: "Done when", prompt: "The observable bar a verifier can check." },
  { name: "Evidence", prompt: "Filled at landing: what ran and where its output is." },
];

export function sectionNames(sections: readonly Section[]): readonly string[] {
  return sections.map((section) => section.name);
}

function render(sections: readonly Section[]): string {
  return sections.map((section) => `## ${section.name}\n\n${section.prompt}\n`).join("\n");
}

export function adrTemplate(title: string, today: string): string {
  return `${renderFrontmatter({ kind: "adr", status: "active", updated: today })}\n# ${title}\n\n${render(ADR_SECTIONS)}`;
}

export function planTemplate(title: string, today: string): string {
  return `${renderFrontmatter({ kind: "plan", status: "active", updated: today })}\n# ${title}\n\n${render(PLAN_SECTIONS)}`;
}

export function itemTemplate(fields: Readonly<Record<string, string>>, title: string): string {
  return `${renderFrontmatter(fields)}\n# ${title}\n\n${render(ITEM_SECTIONS)}`;
}
