// Selector-to-writer reconciliation for the five product stylesheets.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateRunCtx } from "../contract/gate.ts";
import { cssFamilyFinding, readCensus } from "./css-family-census.ts";
import { selectorDataAttributes, selectorHooks } from "./css-family-selector-provenance.ts";
import { collectSelectorWriters } from "./css-selector-writers.ts";

const STREAMDOWN_SOURCE = "packages/ui/node_modules/streamdown/dist/chunk-BO2N2NFS.js";
const STREAMDOWN_HOOK = 'data-streamdown="code-block"';

interface SelectorIdentity {
  readonly kind: "class" | "data";
  readonly name: string;
  readonly operator: "presence" | "=" | "^=" | "$=" | "*=" | "~=" | "|=";
  readonly value: string | undefined;
  readonly file: string;
  readonly line: number;
}

const CLASS_PREFIX_LENGTH = "class:".length;

function recordSelectorIdentities(out: Map<string, SelectorIdentity>, selector: string, file: string, line: number): void {
  for (const hook of selectorHooks(selector)) {
    if (hook.startsWith("class:")) {
      const name = hook.slice(CLASS_PREFIX_LENGTH);
      out.set(`class:${name}`, { kind: "class", name, operator: "presence", value: undefined, file, line });
    }
  }
  for (const attribute of selectorDataAttributes(selector)) {
    const key = `data:${attribute.name}:${attribute.operator}:${attribute.value ?? ""}`;
    out.set(key, {
      kind: "data",
      name: attribute.name,
      operator: attribute.operator,
      value: attribute.value,
      file,
      line,
    });
  }
}

function identities(ctx: GateRunCtx): readonly SelectorIdentity[] {
  const out = new Map<string, SelectorIdentity>();
  for (const row of readCensus(ctx.root)) {
    for (const rule of row.rules) {
      for (const selector of rule.selectors) {
        recordSelectorIdentities(out, selector, row.rel, rule.line);
      }
    }
  }
  return [...out.values()];
}

function isVendorHook(hook: SelectorIdentity, writers: ReturnType<typeof collectSelectorWriters>, streamdownEmitted: boolean): boolean {
  const baseUiValues = writers.baseUiAttributes.get(hook.name);
  return (
    (baseUiValues !== undefined && matches(hook.operator, hook.value, baseUiValues)) ||
    (hook.name === "data-streamdown" && hook.operator === "=" && hook.value === "code-block" && streamdownEmitted)
  );
}

function reportMissing(hook: SelectorIdentity, ctx: GateRunCtx): void {
  if (hook.kind === "class") {
    ctx.report(cssFamilyFinding(hook.file, hook.line, `class:${hook.name}`, `selector hook .${hook.name} has no semantic class producer`));
    return;
  }
  const suffix = hook.operator === "presence" ? "" : `${hook.operator}${JSON.stringify(hook.value)}`;
  ctx.report(cssFamilyFinding(hook.file, hook.line, `${hook.name}${suffix}`, `selector hook [${hook.name}${suffix}] has no semantic writer`));
}

function reconcileHook(
  hook: SelectorIdentity,
  writers: ReturnType<typeof collectSelectorWriters>,
  streamdownEmitted: boolean,
  ctx: GateRunCtx,
): "written" | "vendor" | "missing" {
  if (hook.kind === "class") {
    if (writers.classes.has(hook.name)) {
      return "written";
    }
    reportMissing(hook, ctx);
    return "missing";
  }
  const authored = writers.data.get(hook.name);
  if (authored !== undefined && matches(hook.operator, hook.value, authored.values)) {
    return "written";
  }
  if (isVendorHook(hook, writers, streamdownEmitted)) {
    return "vendor";
  }
  reportMissing(hook, ctx);
  return "missing";
}

function matches(operator: SelectorIdentity["operator"], expected: string | undefined, values: ReadonlySet<string>): boolean {
  if (operator === "presence") {
    return true;
  }
  if (expected === undefined) {
    return false;
  }
  if (operator === "=") {
    return values.has(expected);
  }
  if (operator === "^=") {
    return [...values].some((value) => value.startsWith(expected));
  }
  if (operator === "$=") {
    return [...values].some((value) => value.endsWith(expected));
  }
  if (operator === "*=") {
    return [...values].some((value) => value.includes(expected));
  }
  if (operator === "~=") {
    return [...values].some((value) => value.split(/\s+/u).includes(expected));
  }
  return [...values].some((value) => value === expected || value.startsWith(`${expected}-`));
}

function streamdownSourceEmits(ctx: GateRunCtx): boolean {
  const path = join(ctx.root, STREAMDOWN_SOURCE);
  return existsSync(path) && readFileSync(path, "utf8").includes(`"data-streamdown":"code-block"`);
}

export function auditCssSelectorWriters(ctx: GateRunCtx): void {
  const hooks = identities(ctx);
  const dataNames = [...new Set(hooks.filter((hook) => hook.kind === "data").map((hook) => hook.name))];
  const writers = collectSelectorWriters(ctx, dataNames);
  let written = 0;
  let vendor = 0;
  const streamdownSelected = hooks.some(
    (hook) => hook.kind === "data" && hook.name === "data-streamdown" && hook.operator === "=" && hook.value === "code-block",
  );
  const streamdownEmitted = streamdownSourceEmits(ctx);

  for (const hook of hooks) {
    const disposition = reconcileHook(hook, writers, streamdownEmitted, ctx);
    if (disposition === "written") {
      written += 1;
    } else if (disposition === "vendor") {
      vendor += 1;
    }
  }

  if (streamdownEmitted !== streamdownSelected) {
    ctx.report(
      cssFamilyFinding(
        STREAMDOWN_SOURCE,
        1,
        STREAMDOWN_HOOK,
        streamdownEmitted
          ? "Streamdown still emits the contracted code-block hook but no product stylesheet selects it"
          : "the product stylesheet selects Streamdown's code-block hook but the installed vendor source no longer emits it",
      ),
    );
  }
  for (const name of writers.baseUiManifestOnly) {
    ctx.report(
      cssFamilyFinding(
        "tooling/src/verify/gates/baseui-surface.manifest.json",
        1,
        `baseui-manifest-only:${name}`,
        "Base UI state attribute remains in the manifest but not the installed surface",
      ),
    );
  }
  for (const name of writers.baseUiInstalledOnly) {
    ctx.report(
      cssFamilyFinding(
        "packages/ui/node_modules/@base-ui/react",
        1,
        `baseui-installed-only:${name}`,
        "installed Base UI state attribute is absent from the committed manifest",
      ),
    );
  }
  if (hooks.length === 0) {
    ctx.report(cssFamilyFinding("packages/ui/src/styles/globals.css", 1, "selector-population:0", "selector census learned zero authored hooks"));
  }
  ctx.scan({
    unit: `selector hook; writers=${written}; vendor=${vendor}; opaque=${writers.opaque}; unresolved=${writers.unresolved}`,
    candidates: hooks.length,
    scanned: hooks.length,
  });
}
