// accessible-names — the NAME-QUALITY probes behind `tests/client/a11y/accessible-name-quality.suite.ct.tsx`
// (lane NAMECRAFT). The convention they enforce is `UI-Primitives-and-Reuse.md` §13.10; this file is the
// MECHANICAL half of it. The judgment-y half (is the verb the right verb, is the noun the user's noun)
// stays in the doc — a CT cannot read taste.
//
// WHY TWO ENGINES, not one. The two probes read the same page through deliberately different lenses:
//
//   • `ariaTreeFindings` parses `locator.ariaSnapshot()` — Playwright's OWN accessible-name computation
//     over the OWN visibility/aria-hidden filtering. That is exactly the tree an agent driving the app by
//     `getByRole(role, { name })` sees, so a finding here is a finding in the agent's world by
//     construction. There is no browser API that computes an accessible name (`el.ariaLabel` is the raw
//     attribute, not the computed name), so hand-rolling this in `page.evaluate` would be re-implementing
//     the accname spec — and getting it subtly wrong in exactly the cases that matter.
//   • `labelInNameFindings` runs in the DOM, because WCAG 2.5.3 needs the VISIBLE text with the
//     `aria-describedby` target REMOVED — an ariaSnapshot line prints name and content but cannot tell
//     you which part of the content was a description rather than a label. It is scoped to elements
//     carrying an explicit `aria-label`, which is exact: a control with no `aria-label` takes its name
//     FROM its content, so name and visible label cannot diverge and there is nothing to check.
//
// The ariaSnapshot YAML shape this parser targets (measured, not assumed — Playwright 1.5x):
//     - button "Send message"
//     - button "Aria — character": Aria responding
//     - 'button "Talkativeness: Aria — talks at level 50 of 100"': Talks 50   ← quoted key: the name holds a colon
//     - textbox "Message":
//         - /placeholder: Type a message…
//     - group:                                                ← a NAMELESS node
//   Indentation is two spaces per level and encodes ancestry, which is what makes the duplicate-name
//   probe scope-aware instead of page-global.

import type { Locator, Page } from "@playwright/test";

/** One node of the parsed ARIA tree. `scope` is the ancestor chain that disambiguates a repeated name. */
export interface AriaNode {
  readonly role: string;
  /** The computed accessible name, or `null` when the tree exposes the node without one. */
  readonly name: string | null;
  /** Ancestor `role "name"` chain, outermost first — only the SCOPING roles (see `SCOPE_ROLES`). */
  readonly scope: readonly string[];
  readonly line: string;
}

/** One name-quality violation, shaped for a failure message that names its own fix site. */
export interface NameFinding {
  readonly rule: "nameless-control" | "ambiguous-duplicate" | "unnamed-landmark" | "duplicate-landmark" | "label-not-in-name";
  readonly detail: string;
}

/**
 * Roles an agent ACTS on — every one of these must be findable by name. Deliberately excludes the
 * container/presentational roles (`group`, `list`, `paragraph`, `text`, `status`, `img`) whose names are
 * governed by the landmark/scoping rules instead, and excludes `option`, whose name is always its own
 * content and which therefore cannot be nameless without being empty.
 */
const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "textbox",
  "combobox",
  "listbox",
  "slider",
  "spinbutton",
  "searchbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "treeitem",
]);

/**
 * The roles WCAG 2.5.3 governs: a control whose own text content IS its visible label. Everything else is
 * excluded for a reason, and both exclusions were measured as false-fires on the first run of this suite:
 *
 *   • CONTAINERS (`navigation "Primary"`, `complementary "Chats list"`, `main`, `group "Filters"`,
 *     `list "Character library"`) — their text content is their CHILDREN. 2.5.3 is about "components with
 *     labels", i.e. controls; naming a nav after everything inside it is the opposite of a good name.
 *   • VALUE-BEARING controls (`combobox`, `textbox`, `slider`, `spinbutton`, `listbox`) — their content is
 *     the current VALUE. A `combobox "Chat display"` rendering "Bubble" is displaying its selection;
 *     renaming it "Bubble" would be the defect.
 */
const LABEL_IN_NAME_ROLES: ReadonlySet<string> = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "treeitem",
]);

/** ARIA landmark roles. `region` is included: a `region` reaches the tree ONLY when it has a name. */
const LANDMARK_ROLES: ReadonlySet<string> = new Set(["banner", "complementary", "contentinfo", "form", "main", "navigation", "region", "search"]);

/**
 * Roles that SCOPE a name. Two "Edit" buttons are unambiguous when they sit in differently-named rows —
 * an agent scopes into the row first. Two "Edit" buttons under the SAME scope chain are not.
 */
const SCOPE_ROLES: ReadonlySet<string> = new Set([
  ...LANDMARK_ROLES,
  "article",
  "dialog",
  "alertdialog",
  "group",
  "list",
  "listitem",
  "menu",
  "row",
  "table",
  "tabpanel",
  "toolbar",
  "tree",
]);

const INDENT_WIDTH = 2;
/** `- role "name":` / `- role:` / `- 'role "na:me"':` — the name is optional, the trailing colon is too. */
const NODE_LINE = /^-\s+(?:'(?<qrole>[a-z]+)\s+"(?<qname>.*)"'|(?<role>[a-z]+)(?:\s+"(?<name>.*?)")?)(?::.*)?$/;

/** Parses one `ariaSnapshot()` YAML into flat nodes carrying their scope chain. */
export function parseAriaSnapshot(snapshot: string): readonly AriaNode[] {
  const nodes: AriaNode[] = [];
  // Index = depth; value = the `role "name"` label contributed at that depth (absent for non-scoping roles).
  const openScopes: (string | undefined)[] = [];
  for (const raw of snapshot.split("\n")) {
    const trimmed = raw.trimStart();
    if (!trimmed.startsWith("- ")) {
      continue;
    }
    const depth = Math.floor((raw.length - trimmed.length) / INDENT_WIDTH);
    const match = NODE_LINE.exec(trimmed);
    if (match?.groups === undefined) {
      continue;
    }
    const role = match.groups["qrole"] ?? match.groups["role"] ?? "";
    const name = match.groups["qname"] ?? match.groups["name"] ?? null;
    openScopes.length = depth;
    nodes.push({ role, name, scope: openScopes.filter((s): s is string => s !== undefined), line: trimmed });
    openScopes[depth] = SCOPE_ROLES.has(role) ? `${role} "${name ?? ""}"` : undefined;
  }
  return nodes;
}

/** `banner`/`contentinfo`/`main` are singletons by spec — a lone one needs no distinguishing name. */
const SINGLETON_LANDMARKS: ReadonlySet<string> = new Set(["banner", "contentinfo", "main"]);

/** A node the tree exposes without a usable name. */
function isNameless(node: AriaNode): boolean {
  return node.name === null || node.name.trim() === "";
}

/** Buckets nodes by an arbitrary key, preserving insertion order. */
function bucketBy(nodes: readonly AriaNode[], key: (node: AriaNode) => string): ReadonlyMap<string, readonly AriaNode[]> {
  const out = new Map<string, AriaNode[]>();
  for (const node of nodes) {
    const bucket = out.get(key(node));
    if (bucket === undefined) {
      out.set(key(node), [node]);
    } else {
      bucket.push(node);
    }
  }
  return out;
}

/** Predicate 1 — every interactive role carries a non-empty accessible name. */
function namelessControlFindings(nodes: readonly AriaNode[]): readonly NameFinding[] {
  return nodes
    .filter((node) => INTERACTIVE_ROLES.has(node.role) && isNameless(node))
    .map((node) => ({ rule: "nameless-control" as const, detail: `${node.line} (scope: ${node.scope.join(" › ") || "<root>"})` }));
}

/**
 * Predicate 2 — no two same-role controls share a name under the same scope chain. Scope-aware by
 * construction: an "Edit" in `listitem "Aria"` and one in `listitem "Bolt"` land in different buckets.
 */
function ambiguousDuplicateFindings(nodes: readonly AriaNode[]): readonly NameFinding[] {
  const candidates = nodes.filter((node) => INTERACTIVE_ROLES.has(node.role) && !isNameless(node));
  const findings: NameFinding[] = [];
  for (const bucket of bucketBy(candidates, (node) => `${node.scope.join(" › ")} ${node.role} ${node.name ?? ""}`).values()) {
    const first = bucket[0];
    if (bucket.length > 1 && first !== undefined) {
      const scope = first.scope.join(" › ");
      findings.push({
        rule: "ambiguous-duplicate",
        detail: `${String(bucket.length)}× ${first.role} "${first.name ?? ""}" under the same scope (${scope === "" ? "<root>" : scope}) — getByRole cannot resolve one`,
      });
    }
  }
  return findings;
}

/** Predicate 3 — every landmark is named (unless a lone singleton) and distinguishable from its twins. */
function landmarkFindings(nodes: readonly AriaNode[]): readonly NameFinding[] {
  const findings: NameFinding[] = [];
  const landmarks = nodes.filter((node) => LANDMARK_ROLES.has(node.role));
  for (const [role, bucket] of bucketBy(landmarks, (node) => node.role)) {
    const needsName = bucket.length > 1 || !SINGLETON_LANDMARKS.has(role);
    for (const node of bucket) {
      if (needsName && isNameless(node)) {
        findings.push({ rule: "unnamed-landmark", detail: `${node.line} — a ${role} landmark needs an accessible name` });
      }
    }
    const names = bucket.map((node) => node.name ?? "");
    for (const dupe of new Set(names.filter((name, at) => names.indexOf(name) !== at))) {
      findings.push({ rule: "duplicate-landmark", detail: `two or more ${role} landmarks are both named "${dupe}"` });
    }
  }
  return findings;
}

/**
 * The three tree-level predicates: every interactive control has a name · no two same-role controls share
 * a name under the same scope chain · every landmark is named and distinguishable from its role-twins.
 * Split into one function per predicate so each stays readable and independently testable — the
 * monolithic version tripped biome's cognitive-complexity ceiling, which was fair.
 */
export function ariaTreeFindings(snapshot: string): readonly NameFinding[] {
  const nodes = parseAriaSnapshot(snapshot);
  return [...namelessControlFindings(nodes), ...ambiguousDuplicateFindings(nodes), ...landmarkFindings(nodes)];
}

/**
 * WCAG 2.5.3 Label in Name, as a mechanical probe: every alphabetic word of a control's VISIBLE text must
 * appear in its accessible name. Scoped to elements with an explicit `aria-label` (the only way the two
 * can diverge — with no `aria-label` the name IS the content), further scoped to `LABEL_IN_NAME_ROLES`,
 * and stripping the `aria-describedby` target (a description is not a label — the Members row's
 * "responding" chip is the founding case) plus any `aria-hidden` subtree.
 *
 * Numeric / symbol tokens are exempt by construction (the word regex is alphabetic, ≥2 letters): a live
 * value inside a control is governed by §13.10's stable-prefix rule, not by this one — and it is why a
 * `⌘K` glyph never trips it.
 */
export async function labelInNameFindings(root: Locator | Page): Promise<readonly NameFinding[]> {
  const scope = "locator" in root ? root.locator("body") : root;
  const raw = await scope.evaluate(
    (el: Element, roles: readonly string[]) => {
      // Everything this callback needs must be DECLARED INSIDE it — the function is serialized and evaluated
      // in the page, where neither this module's scope nor its top-level regexes exist. That is why the
      // regex literals below carry a biome-ignore rather than being hoisted to module scope.
      const governed = new Set(roles);

      /** The explicit role wins; a bare `<button>`/`<a href>` carries its implicit one. */
      const roleOf = (node: Element): string => {
        const explicit = node.getAttribute("role");
        if (explicit !== null) {
          return explicit;
        }
        if (node.tagName === "BUTTON") {
          return "button";
        }
        return node.tagName === "A" && node.hasAttribute("href") ? "link" : "";
      };

      /**
       * The control's VISIBLE label: its text with the `aria-describedby` target and every `aria-hidden`
       * subtree removed. TEXT NODES ARE JOINED WITH A SPACE, never read via `textContent`: two sibling
       * `<span>`s reading "Talks" and "50%" concatenate to "Talks50%", which mints the phantom word
       * "talks50" and misses the real one — measured on the Members row, 2026-08-07.
       */
      const visibleLabelOf = (node: Element): string => {
        const clone = node.cloneNode(true) as HTMLElement;
        const ids = (node.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((s) => s !== "");
        for (const id of ids) {
          for (const described of clone.querySelectorAll(`[id="${CSS.escape(id)}"]`)) {
            described.remove();
          }
        }
        for (const hidden of clone.querySelectorAll("[aria-hidden='true']")) {
          hidden.remove();
        }
        const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
        const parts: string[] = [];
        for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
          parts.push(n.nodeValue ?? "");
        }
        return parts.join(" ").replace(/\s+/g, " ").trim();
      };

      const out: { label: string; visible: string; missing: string[] }[] = [];
      for (const node of el.querySelectorAll("[aria-label]")) {
        const label = node.getAttribute("aria-label") ?? "";
        const hidden = label.trim() === "" || node.closest("[aria-hidden='true'],[inert]") !== null;
        if (hidden || !(node instanceof HTMLElement) || node.offsetParent === null || !governed.has(roleOf(node))) {
          continue;
        }
        const visible = visibleLabelOf(node);
        // TOKENS, NOT SUBSTRINGS (#1492). `lowered.includes(word)` passed the visible word "art" against
        // the accessible name "cart" — WCAG 2.5.3 is about the WORD appearing in the name, and a check
        // that accepts any name merely CONTAINING the letters reports a clean row for a real violation.
        // Both sides are tokenized with the SAME regex, so "Add to cart" still matches "add to cart" and
        // "Cart (3)" still contains "cart".
        const wordsOf = (text: string): string[] => text.toLowerCase().match(/[a-z][a-z']+/g) ?? [];
        // ≥2 letters, which is why a bare "⌘K" glyph never trips this and a live "50%" is exempt by construction.
        const labelWords = new Set(wordsOf(label));
        const words = wordsOf(visible);
        const missing = words.filter((word) => !labelWords.has(word));
        if (missing.length > 0) {
          out.push({ label, visible, missing: [...new Set(missing)] });
        }
      }
      return out;
    },
    [...LABEL_IN_NAME_ROLES],
  );

  return raw.map((r) => ({
    rule: "label-not-in-name" as const,
    detail: `aria-label "${r.label}" drops the visible word(s) ${r.missing.map((w) => `"${w}"`).join(", ")} (visible text: "${r.visible}") — WCAG 2.5.3`,
  }));
}

/** Runs BOTH engines over the page and returns every finding, newest lens last.
 *
 * NO HARNESS CARVE-OUT. There used to be one: `ct-providers.tsx` mounted a `<Toaster />` for EVERY CT
 * (its `region "Alerts"`) while a story ending in a `notify.*` call mounted its own, so two identically
 * named live regions were a HARNESS fact and `duplicate-landmark "Alerts"` had to be filtered out. The
 * harness stopped mounting a global outlet in #247, so — exactly as that carve-out's own note required —
 * the list is deleted rather than grown, and a duplicate "Alerts" is a real finding again. */
export async function nameQualityFindings(page: Page): Promise<readonly NameFinding[]> {
  const snapshot = await page.locator("body").ariaSnapshot();
  return [...ariaTreeFindings(snapshot), ...(await labelInNameFindings(page))];
}

/** Formats findings for an `expect(...)` message that points straight at the fix site. */
export function formatFindings(findings: readonly NameFinding[]): string {
  return findings.map((f) => `  [${f.rule}] ${f.detail}`).join("\n");
}
