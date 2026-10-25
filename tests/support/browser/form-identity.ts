// FORM-IDENTITY probe — whether each native form field is IDENTIFIED (an `id` or a `name`, the attribute Chrome's
// Issues panel asks for and autofill keys on) and LABELLED (a `<label>`, `aria-label` or `aria-labelledby`).
// Chrome never writes its "A form field element should have an id or name attribute" warning to the console or to
// Playwright's Chromium, so the DOM is asserted directly. Name quality is `accessible-names.ts`; this asks only whether
// a field can be addressed and labelled at all.

import type { Locator, Page } from "@playwright/test";

/** One field the probe could not identify or label. */
export interface FormIdentityFinding {
  readonly rule: "no-id-or-name" | "no-label";
  readonly detail: string;
}

/** Native fields a user fills; buttons and hidden inputs carry no identity requirement. */
const FIELD_SELECTOR = "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']), select, textarea";

/**
 * Every native form field under `root`: a missing identity is a finding, and so is a missing label unless the field is
 * hidden from assistive tech. Chrome asks for an `id` or a `name`; `both` holds a primitive to the stricter house rule
 * that its fields always emit the pair.
 */
export async function formIdentityFindings(root: Locator | Page, { both = false }: { readonly both?: boolean } = {}): Promise<readonly FormIdentityFinding[]> {
  const scope = "locator" in root ? root.locator("body") : root;
  return await scope.evaluate(
    (el: Element, [selector, requireBoth]: readonly [string, boolean]) => {
      const describe = (node: Element): string =>
        `<${node.tagName.toLowerCase()} id="${node.id}" name="${node.getAttribute("name") ?? ""}"> ${node.outerHTML.slice(0, 140).replace(/\s+/g, " ")}`;
      const textOf = (id: string): string => (el.ownerDocument.getElementById(id)?.textContent ?? "").trim();
      const isLabelled = (node: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean =>
        (node.labels?.length ?? 0) > 0 ||
        (node.getAttribute("aria-label") ?? "").trim() !== "" ||
        (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).some((id) => id !== "" && textOf(id) !== "");
      const lacksIdentity = (node: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean =>
        requireBoth && node.closest("[aria-hidden='true']") === null ? node.id === "" || node.name === "" : node.id === "" && node.name === "";
      const judge = (node: Element): { rule: "no-id-or-name" | "no-label"; detail: string }[] => {
        if (!(node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement)) {
          return [];
        }
        const findings: { rule: "no-id-or-name" | "no-label"; detail: string }[] = [];
        if (lacksIdentity(node)) {
          findings.push({ rule: "no-id-or-name", detail: describe(node) });
        }
        // A field hidden from the tree (a mirrored value input, a `hidden` file picker) is not a label target.
        if (!isLabelled(node) && node.closest("[aria-hidden='true'],[inert],[hidden]") === null) {
          findings.push({ rule: "no-label", detail: describe(node) });
        }
        return findings;
      };
      return Array.from(el.querySelectorAll(selector)).flatMap(judge);
    },
    [FIELD_SELECTOR, both] as const,
  );
}

/** Formats findings for an `expect(...)` message that points straight at the fix site. */
export function formatFormIdentityFindings(findings: readonly FormIdentityFinding[]): string {
  return findings.map((f) => `  [${f.rule}] ${f.detail}`).join("\n");
}
