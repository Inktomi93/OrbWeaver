// Reviewed grants: zod-error-issues-home.
// Split from reviewed-grants-tooling-to-permission.ts at the 450-line cap — see reviewed-grants.ts for
// the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_ZODERRORISSUES_ZINDEX: readonly ReviewedGateGrant[] = [
  {
    id: "zod-error-issues-home:persona-write-guard",
    policyId: "zod-error-issues-home",
    subject: "packages/contracts/src/persona/index.ts",
    operation: "error-issues-read",
    why: "a write-guard RE-EMIT, not a message render: `personaMetadataWriteSchema`'s superRefine forwards each inner issue as `ctx.addIssue({code:'custom', message, path})`. It keeps `path`, which `prettifyError` cannot — that returns a STRING and would collapse the whole issue array into one opaque message on the outer error.",
    endsWhen: "the metadata write guard stops re-emitting inner issues (the inner schema is composed directly into the outer one).",
  },
  {
    id: "zod-error-issues-home:rpg-extraction",
    policyId: "zod-error-issues-home",
    subject: "packages/contracts/src/rpg/extraction.ts",
    operation: "error-issues-read",
    why: "STRUCTURED LOSSES: issue paths select invalid top-level fields for salvage; per-plane drops retain separate path/message entries; recorded tool-call diagnostics append the model-sent value behind the canonical marker so the server can decode and strip hidden content for members. These feed loss records, logs and the viewer disclosure, not just a model correction. A prettified string cannot replace the salvage paths or the per-loss/sent-value protocol.",
    endsWhen: "salvage and recorded-loss consumers no longer require per-issue paths/messages or the member-safe sent-value projection.",
  },
  {
    id: "zod-error-issues-home:rule-editor-commit",
    policyId: "zod-error-issues-home",
    subject: "packages/client/src/features/automation/lib/contract/rule-editor.ts",
    operation: "error-issues-read",
    why: "a write-guard RE-EMIT, not a message render: `ruleEditorCommitSchema`'s superRefine forwards each `automationRuleEditableSchema` issue as `ctx.addIssue({code:'custom', path, message})` so the form resolver lands it on the offending field. It keeps `path`, which `prettifyError` cannot — that returns a STRING and would collapse every field error into one opaque message.",
    endsWhen: "the commit schema stops re-emitting inner issues (the editable schema is composed directly into the draft schema).",
  },
  {
    id: "zod-error-issues-home:structured-turn",
    policyId: "zod-error-issues-home",
    subject: "packages/inference/src/roles/structured-turn.ts",
    operation: "error-issues-read",
    why: "MODEL-facing: the issue summary is fed straight BACK to the model as the retry prompt (`args.run(first.issues)`), so it must be the schema-addressable `path: message` form rather than a human-formatted tree.",
    endsWhen: "the structured-turn retry stops re-prompting with the parse issues.",
  },
  {
    id: "zod-error-issues-home:tool-register",
    policyId: "zod-error-issues-home",
    subject: "packages/server/src/domain/tool-use/verbs/register.ts",
    operation: "error-issues-read",
    why: "MODEL-facing: the tool registry hands the failing model `path.join('.') + ': ' + message` so it can match the refusal against its own arg schema. The path is CARRIED, not dropped — the opposite of the F4 defect — and `z.prettifyError`'s human layout is the wrong shape for a wire the model re-reads.",
    endsWhen: "tool refusals stop being fed back to a model verbatim, at which point the human renderer is the right one.",
  },
  {
    id: "zod-error-issues-home:tool-register-plugin",
    policyId: "zod-error-issues-home",
    subject: "packages/server/src/domain/tool-use/verbs/register-plugin-tool.ts",
    operation: "error-issues-read",
    why: "MODEL-facing, the plugin twin of `register.ts` — the identical `path: message` convention, deliberately kept byte-identical between the two registration doors so a model sees one refusal vocabulary.",
    endsWhen: "the two registration doors stop sharing a refusal vocabulary, or tool refusals stop being model-facing.",
  },
  {
    id: "zod-error-issues-home:versioned-config",
    policyId: "zod-error-issues-home",
    subject: "packages/contracts/src/versioned-config/index.ts",
    operation: "error-issues-read",
    why: "the first issue becomes the typed VersionedParseIssue path/message payload, not a rendered ZodError. The ST preset importer resolves sections.<n> paths back to the authored prompt identifier before rendering its refusal, while stored-config write guards report only the failure kind and row scope, never blob contents. Replacing that payload with prettified prose would erase the importer's field-to-source mapping.",
    endsWhen: "the degraded-parse payload stops carrying a field path (the caller renders the whole refusal itself).",
  },
  {
    id: "zod-error-issues-home:world-info-write-guard",
    policyId: "zod-error-issues-home",
    subject: "packages/contracts/src/world-info/index.ts",
    operation: "error-issues-read",
    why: "the same write-guard RE-EMIT for `entryMetadataWriteSchema`, whose header cites the persona rationale verbatim — issues forwarded structurally with their paths, never flattened to a display string.",
    endsWhen: "the entry write guard stops re-emitting inner issues (the inner schema is composed directly into the outer one).",
  },
];
