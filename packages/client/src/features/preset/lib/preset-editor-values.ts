// Preset editor values derive the canonical configuration and carry parallel draft-only list identities.

import type { PromptConfig } from "@orb/contracts/preset";
import { z } from "zod";
import { formValuesEqual } from "#forms";
import type { UserMacrosFormValues } from "../../../components/user-macro-editor-model.ts";
import { admitUserMacroValues, macroRowIdsMatch, macroRowIdsSchema } from "../../../components/user-macro-editor-model.ts";

const variableRowIdsSchema = z.object({ id: z.uuid(), options: z.array(z.uuid()) });
const metadataSchema = z.object({ macroRowIds: macroRowIdsSchema.array(), variableRowIds: variableRowIdsSchema.array() });

export interface PresetEditorValues extends PromptConfig {
  readonly macroRowIds: UserMacrosFormValues["macroRowIds"];
  readonly variableRowIds: z.infer<typeof variableRowIdsSchema>[];
}

export function presetEditorValues(config: PromptConfig): PresetEditorValues {
  return { ...config, macroRowIds: [], variableRowIds: [] };
}

export function canonicalPresetValues(values: PresetEditorValues): PromptConfig {
  const { macroRowIds: _macros, variableRowIds: _variables, ...config } = values;
  return config;
}

function presetRowIdsMatch(values: PresetEditorValues): boolean {
  const parsed = metadataSchema.safeParse(values);
  if (!(parsed.success && macroRowIdsMatch(values)) || parsed.data.variableRowIds.length !== values.variables.length) {
    return false;
  }
  const ids: string[] = [];
  for (const [index, row] of parsed.data.variableRowIds.entries()) {
    if (row.options.length !== values.variables[index]?.options.length) {
      return false;
    }
    ids.push(row.id, ...row.options);
  }
  return new Set(ids).size === ids.length;
}

export function admitPresetValues(values: PresetEditorValues, previousAdmitted?: PresetEditorValues): PresetEditorValues {
  if (presetRowIdsMatch(values)) {
    return values;
  }
  const variableRowIds =
    previousAdmitted !== undefined && formValuesEqual(values.variables, previousAdmitted.variables)
      ? previousAdmitted.variableRowIds
      : values.variables.map((variable) => ({ id: crypto.randomUUID(), options: variable.options.map(() => crypto.randomUUID()) }));
  return {
    ...values,
    ...admitUserMacroValues(values, previousAdmitted),
    variableRowIds,
  };
}
