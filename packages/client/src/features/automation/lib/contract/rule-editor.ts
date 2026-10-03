import { AUTOMATION_RULE_NAME_MAX_CHARS, automationActionSchema, automationRuleEditableSchema } from "@orb/contracts/automation";
import { AUTOMATION_NOTICE_COOLDOWN_SECONDS } from "@orb/contracts/notifications";
import { z } from "zod";

export const RULE_NOTICE_COOLDOWN_ERROR = `Notices need a cooldown of at least ${AUTOMATION_NOTICE_COOLDOWN_SECONDS} seconds.`;

const [variable, transform, lore, reply, notification, turn, image, background, analysis, tool] = automationActionSchema.options;

// Drafts admit unfinished text; only the canonical authoring schema admits a server write.
const draftActionSchema = z.discriminatedUnion("type", [
  variable.extend({ key: z.string(), value: z.string().optional() }),
  transform.extend({ template: z.string() }),
  lore.extend({
    // @orb-waive no-raw-id(bookId): unfinished editor selections are draft text; ruleEditorCommitSchema and ruleEditable validate canonical IDs before transport. Ends if drafts become commit-ready values.
    bookId: z.string(),
    entryKey: z.string(),
    keys: z.array(z.string()),
    contentTemplate: z.string(),
  }),
  reply.extend({ choices: z.array(reply.shape.choices.element.extend({ label: z.string(), sendTemplate: z.string() })) }),
  notification.extend({ messageTemplate: z.string() }),
  // @orb-waive no-raw-id(speakerCharacterId): unfinished editor selections are draft text; ruleEditorCommitSchema and ruleEditable validate canonical IDs before transport. Ends if drafts become commit-ready values.
  turn.extend({ speakerCharacterId: z.string().optional(), guidedTemplate: z.string().optional() }),
  // @orb-waive no-raw-id(subjectCharacterId): unfinished editor selections are draft text; ruleEditorCommitSchema and ruleEditable validate canonical IDs before transport. Ends if drafts become commit-ready values.
  image.extend({ prompt: z.string().optional(), negative: z.string().optional(), subjectCharacterId: z.string().optional(), n: z.number() }),
  background.extend({ instruction: z.string().optional() }),
  analysis.extend({
    brief: z.string(),
    steer: z.string().optional(),
    routes: analysis.shape.routes.extend({
      lore: analysis.shape.routes.shape.lore
        .unwrap()
        .extend({
          // @orb-waive no-raw-id(bookId): unfinished editor selections are draft text; ruleEditorCommitSchema and ruleEditable validate canonical IDs before transport. Ends if drafts become commit-ready values.
          bookId: z.string(),
        })
        .optional(),
      vars: analysis.shape.routes.shape.vars.unwrap().extend({ key: z.string() }).optional(),
    }),
  }),
  tool.extend({ name: z.string(), argsTemplate: z.string(), resultVar: z.string().optional() }),
]);

function rowIdsValid(ids: readonly string[], size: number): boolean {
  return ids.length === size && new Set(ids).size === ids.length;
}

export const ruleEditorDraftSchema = automationRuleEditableSchema
  .extend({
    name: z.string(),
    description: z.string().nullable(),
    predicateCel: z.string().nullable(),
    actions: z.array(draftActionSchema),
    cooldownSeconds: z.number(),
    maxFiresPerHour: z.number(),
    actionIds: z.array(z.string().min(1)),
    choiceIds: z.array(z.array(z.string().min(1))),
    keywordIds: z.array(z.array(z.string().min(1))),
  })
  .superRefine((values, context) => {
    if (
      !rowIdsValid(values.actionIds, values.actions.length) ||
      values.choiceIds.length !== values.actions.length ||
      values.keywordIds.length !== values.actions.length
    ) {
      context.addIssue({ code: "custom", path: ["actionIds"], message: "Action row identities are inconsistent." });
    }
    for (const [index, action] of values.actions.entries()) {
      const choices = values.choiceIds[index] ?? [];
      const keywords = values.keywordIds[index] ?? [];
      if (!rowIdsValid(choices, action.type === "surface_quick_reply" ? action.choices.length : 0)) {
        context.addIssue({ code: "custom", path: ["choiceIds", index], message: "Reply row identities are inconsistent." });
      }
      if (!rowIdsValid(keywords, action.type === "insert_world_info_entry" ? action.keys.length : 0)) {
        context.addIssue({ code: "custom", path: ["keywordIds", index], message: "Keyword row identities are inconsistent." });
      }
    }
  });
export type RuleEditorValues = z.infer<typeof ruleEditorDraftSchema>;

export const ruleEditorCommitSchema = ruleEditorDraftSchema.superRefine((values, context) => {
  const { actionIds: _actions, choiceIds: _choices, keywordIds: _keywords, ...body } = values;
  if (body.actions.some((action) => action.type === "post_notification") && body.cooldownSeconds < AUTOMATION_NOTICE_COOLDOWN_SECONDS) {
    context.addIssue({ code: "custom", path: ["cooldownSeconds"], message: RULE_NOTICE_COOLDOWN_ERROR });
  }
  const result = automationRuleEditableSchema.safeParse(body);
  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: ruleFieldIssue(issue, body.name),
      });
    }
  }
});

/** @public twin: ruleEditorCommitSchema */
export type RuleEditorCommitValues = z.infer<typeof ruleEditorCommitSchema>;

export interface RuleEditorFailure {
  readonly message: string;
  readonly retryable: boolean;
  readonly field?: keyof Pick<RuleEditorValues, "name" | "cooldownSeconds" | "maxFiresPerHour" | "predicateCel">;
}

function ruleFieldIssue(issue: z.ZodError["issues"][number], name: string): string {
  if (issue.path.length === 1 && issue.path[0] === "name") {
    return name.length === 0 ? "Rule name is required." : `Rule name must contain at most ${AUTOMATION_RULE_NAME_MAX_CHARS} characters.`;
  }
  return issue.code === "too_small" && issue.minimum === 1 ? "This field is required." : issue.message;
}
