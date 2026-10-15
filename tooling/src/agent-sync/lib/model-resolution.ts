import type { ModelCatalog } from "../contract/types.ts";
import { MODEL_FAMILIES } from "../contract/types.ts";
import { ROLE_FAMILIES } from "./paths.ts";

const MODEL_SLUG = new RegExp(`^gpt-([0-9]+(?:\\.[0-9]+)*)-(${MODEL_FAMILIES.join("|")})$`, "u");

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(BigInt);
  const b = right.split(".").map(BigInt);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0n) - (b[index] ?? 0n);
    if (difference !== 0n) {
      return difference > 0n ? 1 : -1;
    }
  }
  return 0;
}

/** Resolve one stable, visible model per family, then require every role's requested effort. */
export function resolveRoleModels(catalog: ModelCatalog, roleEfforts: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const selections: Record<string, string> = {};
  for (const [role, effort] of Object.entries(roleEfforts)) {
    const family = ROLE_FAMILIES[role];
    if (family === undefined) {
      throw new Error(`${role}: missing Codex model family mapping`);
    }
    const candidates = catalog.models.flatMap((model) => {
      const match = MODEL_SLUG.exec(model.slug);
      return model.visibility === "list" && match?.[2] === family && match[1] !== undefined ? [{ model, version: match[1] }] : [];
    });
    candidates.sort((a, b) => compareVersions(b.version, a.version));
    const newest = candidates[0]?.model;
    if (newest === undefined) {
      throw new Error(`${role}: no visible stable Codex model in ${family} family`);
    }
    if (!newest.supportedReasoningLevels.some((level) => level.effort === effort)) {
      throw new Error(`${role}: ${newest.slug} does not support requested effort ${effort}`);
    }
    selections[role] = newest.slug;
  }
  return selections;
}

/** Check a persisted selection without consulting the live catalog. */
export function isFamilyModel(model: string, family: string): boolean {
  return MODEL_SLUG.exec(model)?.[2] === family;
}
