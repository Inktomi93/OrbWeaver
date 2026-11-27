// The rendered half of the type-ramp law (UI-Density-Law.md §2.3, integer-line-boxes.md §2): every visible text run
// under a scope paints at a `--text-*` step of the root it is scaled by. The ramp is the production token tuple, never
// a list here. Each probe runs in the page and takes its values as arguments.
import { LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";

export interface TypeRampFinding {
  readonly rule: "off-ramp-text" | "empty-ramp-census";
  readonly detail: string;
}

// A step sized by its art container rather than the root (the avatar fallback's initials, UI-Density-Law.md §2.3).
const CONTAINER_UNIT = /\dcq(?:min|max|[whib])\b/u;
const TEXT_TOKENS = Object.entries(TOKENS).filter(([path]) => path.startsWith("text."));
/** The ramp: every `text.*` token that is a served dimension. */
const RAMP_VARS = TEXT_TOKENS.filter(([path]) => path in LENGTH_BASE_PX).map(([, token]) => token.cssVar);
/** The container-sized steps' utility classes; a run that wears one is the one exemption. */
const CONTAINER_SIZED_CLASSES = TEXT_TOKENS.filter(([, token]) => CONTAINER_UNIT.test(token.value)).map(([, token]) => token.cssVar.slice("--".length));
/** The longest run of text a finding quotes. */
const QUOTE_CHARS = 40;
/** Two sizes this close are one size: computed pixels carry sub-pixel rounding. */
const STEP_TOLERANCE_PX = 0.01;

interface OffRampRun {
  readonly text: string;
  readonly slot: string | null;
  readonly fontSize: number;
}

/** Every visible text run under `scope`, read against the ramp steps the same scope resolves. A scope with no visible run is a finding too: a clean verdict on a subject nothing was read from proves nothing. */
export async function typeRampFindings(scope: Locator): Promise<TypeRampFinding[]> {
  const reading = await scope.evaluate(
    (subject, { rampVars, exempt, quoteChars, tolerance }) => {
      const steps = rampVars.map((cssVar) => {
        const probe = document.createElement("span");
        probe.style.fontSize = `var(${cssVar})`;
        probe.style.position = "fixed";
        subject.append(probe);
        const px = Number.parseFloat(getComputedStyle(probe).fontSize);
        probe.remove();
        return px;
      });
      const offRamp: OffRampRun[] = [];
      let checked = 0;
      for (const element of [subject, ...subject.querySelectorAll("*")]) {
        const painted = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
        const containerSized = exempt.some((name) => element.closest(`.${name}`) !== null);
        if (containerSized || !(painted && element.checkVisibility())) {
          continue;
        }
        checked += 1;
        const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
        if (!steps.some((step) => Math.abs(step - fontSize) < tolerance)) {
          offRamp.push({ text: element.textContent.trim().slice(0, quoteChars), slot: element.getAttribute("data-slot"), fontSize });
        }
      }
      return { checked, offRamp };
    },
    { rampVars: RAMP_VARS, exempt: CONTAINER_SIZED_CLASSES, quoteChars: QUOTE_CHARS, tolerance: STEP_TOLERANCE_PX },
  );
  if (reading.checked === 0) {
    return [{ rule: "empty-ramp-census", detail: "no visible text run under the scope was read" }];
  }
  return reading.offRamp.map(({ text, slot, fontSize }) => ({
    rule: "off-ramp-text",
    detail: `"${text}"${slot === null ? "" : ` (${slot})`} paints at ${String(fontSize)}px, which is no ramp step of its root`,
  }));
}

export function formatTypeRampFindings(findings: readonly TypeRampFinding[]): string {
  return findings.map(({ rule, detail }) => `${rule}: ${detail}`).join("\n");
}
