// Macro editor identities are draft metadata, parallel to the canonical macro/argument/input arrays.
// Admission retains a valid tree; new draft rows mint identities independently of positions and names.

import type { UserMacroSpec } from "@orb/contracts/preset";
import { z } from "zod";
import { formValuesEqual } from "#forms";

const rowId = z.uuid();
export const macroRowIdsSchema = z.object({
  id: rowId,
  args: z.array(rowId),
  inputs: z.array(z.object({ id: rowId, options: z.array(rowId) })),
});

export interface UserMacrosFormValues {
  readonly userMacros: UserMacroSpec[];
  readonly macroRowIds: z.infer<typeof macroRowIdsSchema>[];
}

export function macroRowIdsMatch(values: UserMacrosFormValues): boolean {
  const parsed = macroRowIdsSchema.array().safeParse(values.macroRowIds);
  if (!parsed.success || parsed.data.length !== values.userMacros.length) {
    return false;
  }
  const ids: string[] = [];
  for (const [index, row] of parsed.data.entries()) {
    const macro = values.userMacros[index];
    if (macro === undefined || row.args.length !== macro.args.length || row.inputs.length !== macro.inputs.length) {
      return false;
    }
    ids.push(row.id, ...row.args);
    for (const [inputIndex, input] of row.inputs.entries()) {
      if (input.options.length !== macro.inputs[inputIndex]?.options.length) {
        return false;
      }
      ids.push(input.id, ...input.options);
    }
  }
  return new Set(ids).size === ids.length;
}

export function newMacroRowIds(macro: UserMacroSpec): UserMacrosFormValues["macroRowIds"][number] {
  return {
    id: crypto.randomUUID(),
    args: macro.args.map(() => crypto.randomUUID()),
    inputs: macro.inputs.map((input) => ({ id: crypto.randomUUID(), options: input.options.map(() => crypto.randomUUID()) })),
  };
}

export function admitUserMacroValues(values: UserMacrosFormValues, previousAdmitted?: UserMacrosFormValues): UserMacrosFormValues {
  if (macroRowIdsMatch(values)) {
    return values;
  }
  const macroRowIds =
    previousAdmitted !== undefined && formValuesEqual(values.userMacros, previousAdmitted.userMacros)
      ? previousAdmitted.macroRowIds
      : values.userMacros.map(newMacroRowIds);
  return { ...values, macroRowIds };
}

export function canonicalUserMacroValues(values: UserMacrosFormValues): Pick<UserMacrosFormValues, "userMacros"> {
  return { userMacros: values.userMacros };
}
