import type { AutomationRuleCreationId, AutomationRuleId, UserId } from "@orb/kit/ids";
import { hashServerBaseline } from "#forms";
import type { RuleCreation } from "#state";
import {
  acknowledgeRuleCreation,
  activeDurableLocalUserId,
  assertRuleDraftOwner,
  clearRuleRecoveryCheckpoint,
  createEntityDraftStore,
  readRuleCreation,
  ruleDraftOwnerCurrent,
} from "#state";
import type { RuleEditorValues } from "./contract/rule-editor.ts";
import { ruleEditorDraftSchema } from "./contract/rule-editor.ts";

/** Invalid templates and unfinished actions survive navigation without becoming valid server rows. */
const MODEL_VERSION = 1;
const store = createEntityDraftStore<RuleEditorValues>({
  name: "automation-rule-editor",
  schemaVersion: MODEL_VERSION,
  validate: (value) => ruleEditorDraftSchema.safeParse(value).data,
});

// Parallel UI keys do not identify server truth; a reopened editor may regenerate those keys.
function wireBaseline(hash: string | undefined): string | undefined {
  if (hash === undefined) {
    return;
  }
  return ruleEditorBaseline(ruleEditorDraftSchema.parse(JSON.parse(hash)));
}

/** Form row identities are local; only authored values identify the server baseline. */
function ruleEditorBaseline(values: RuleEditorValues): string {
  const { actionIds: _actions, choiceIds: _choices, keywordIds: _keywords, ...body } = values;
  return hashServerBaseline(body);
}

function retireCheckpoint(creation: RuleCreation): void {
  const owner = activeDurableLocalUserId();
  if (owner !== null) {
    clearRuleRecoveryCheckpoint(creation.requestId, owner);
  }
}

function checkpointValues(checkpoint: NonNullable<RuleCreation["checkpoint"]>): RuleEditorValues | undefined {
  if (checkpoint.modelVersion !== MODEL_VERSION) {
    return;
  }
  let values: RuleEditorValues | undefined;
  try {
    values = ruleEditorDraftSchema.safeParse(JSON.parse(checkpoint.draftJson)).data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return;
    }
    throw error;
  }
  return values;
}

function recoveryCheckpoint(
  id: string,
): { readonly creation: RuleCreation; readonly checkpoint: NonNullable<RuleCreation["checkpoint"]>; readonly values: RuleEditorValues } | undefined {
  const creation = readRuleCreation(id);
  if (creation === undefined || creation.checkpoint === null) {
    return;
  }
  const values = checkpointValues(creation.checkpoint);
  if (creation.ruleId === null || values === undefined) {
    retireCheckpoint(creation);
    return;
  }
  return { creation, checkpoint: creation.checkpoint, values };
}

/** Identity and the still-unsaved draft cross recovery atomically; no form value is reseeded or marked saved. */
export function acknowledgeRuleDraft(requestId: AutomationRuleCreationId, ruleId: AutomationRuleId, owner: UserId, confirmed: RuleEditorValues): void {
  const values = ruleEditorDraftSchema.safeParse(store.readDraft(requestId)).data;
  const predecessor = store.readDraftBaseline(requestId);
  const previous = recoveryCheckpoint(requestId);
  const baseline = wireBaseline(hashServerBaseline(confirmed));
  if (baseline === undefined) {
    throw new Error("A confirmed rule needs a draft baseline.");
  }
  const checkpoint =
    values === undefined
      ? null
      : {
          modelVersion: MODEL_VERSION,
          baseline,
          predecessor: previous === undefined ? (predecessor ?? null) : previous.checkpoint.predecessor,
          draftJson: JSON.stringify(values),
        };
  acknowledgeRuleCreation(requestId, ruleId, owner, checkpoint);
  if (values !== undefined) {
    store.setDraft(requestId, values, baseline);
  }
}

/** Discard only a closed draft; birth identity survives ambiguous responses and Undo never overwrites newer work. */
export function discardRuleDraft(requestId: AutomationRuleCreationId, owner: UserId): (() => boolean) | undefined {
  assertRuleDraftOwner(owner);
  const creation = readRuleCreation(requestId);
  const values = store.readDraft(requestId);
  const baseline = store.readDraftBaseline(requestId);
  if (creation === undefined || values === undefined) {
    return;
  }
  store.clearDraft(requestId);
  clearRuleRecoveryCheckpoint(requestId, owner);
  return (): boolean => {
    if (!ruleDraftOwnerCurrent(owner)) {
      return false;
    }
    const current = readRuleCreation(requestId);
    if (current === undefined || current.ruleId !== creation.ruleId || store.hasDraft(requestId)) {
      return false;
    }
    if (creation.ruleId !== null) {
      acknowledgeRuleCreation(requestId, creation.ruleId, owner, creation.checkpoint);
    }
    store.setDraft(requestId, values, baseline);
    return true;
  };
}

/** Preserve the canonical draft envelope while comparing only server-owned form fields. */
export const ruleEditorDrafts = {
  ...store,
  readDraft: (id: string, hash?: string): Readonly<Partial<RuleEditorValues>> | undefined => {
    const baseline = wireBaseline(hash);
    const recovery = recoveryCheckpoint(id);
    if (recovery !== undefined) {
      if (baseline === recovery.checkpoint.baseline) {
        const mirrored = store.readDraft(id);
        const mirroredBaseline = store.readDraftBaseline(id);
        if (mirrored !== undefined && mirroredBaseline !== baseline && (mirroredBaseline ?? null) !== recovery.checkpoint.predecessor) {
          retireCheckpoint(recovery.creation);
          return store.readDraft(id, baseline);
        }
        const latest = mirrored ?? recovery.values;
        store.setDraft(id, latest, baseline);
        retireCheckpoint(recovery.creation);
        return latest;
      }
      retireCheckpoint(recovery.creation);
    }
    return store.readDraft(id, baseline);
  },
  setDraft: (id: string, values: Partial<RuleEditorValues>, hash?: string): void => {
    const supplied = wireBaseline(hash);
    const recovery = recoveryCheckpoint(id);
    const predecessor = recovery !== undefined && (supplied ?? null) === recovery.checkpoint.predecessor;
    store.setDraft(id, values, predecessor ? recovery.checkpoint.baseline : supplied);
    // A canonical completion or an adopted newer server echo ends the pre-recovery lineage.
    if (recovery !== undefined && !predecessor) {
      retireCheckpoint(recovery.creation);
    }
  },
  clearDraft: (id: string): void => {
    store.clearDraft(id);
    const recovery = recoveryCheckpoint(id);
    if (recovery !== undefined) {
      retireCheckpoint(recovery.creation);
    }
  },
};
