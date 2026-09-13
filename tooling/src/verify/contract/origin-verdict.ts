// The #944 THREE ANSWERS an identity reader gives, as one importable axis.
//
// Every canonical-origin reader answers the same question about a reference — is it the identity I am
// looking for, is it provably a different one, or could I not read it at all — and only the FIRST arm
// varies per reader. `lib/origin-verdict.ts#classifyOriginRefusal` owns the decision between the last two;
// this file owns their SPELLING, so the axis is declared once instead of re-spelled per reader.
//
// It is not a style preference. #1584's own readers minted the same three-member union six times
// (`PathCalleeVerdict`, `KitIdCallVerdict`, `BroadcastChannelVerdict`, `ProcessMemberVerdict`,
// `ProjectHomeVerdict`, `ReactOriginVerdict`), and `no-inline-union-redecl` — a gate this program had just
// converted — reported every one of them on the real tree. Deriving from here is what the gate's own `fix`
// asks for, and it is why a seventh reader cannot quietly disagree about what the second and third answers
// are called.
//
// ALL SIX NOW LIVE HERE (#1988, 2026-09-12). Four of them were still declared in their own `lib/` reader,
// where `no-inline-types` reported them for the separate reason that `lib/` is not a type home — the two
// laws named the same defect from two directions. `RoleAxisVerdict` (`contract/role-vocabulary.ts`) is the
// one deliberate NON-member: its refusal arm is spelled `foreign`, and re-spelling it is a design decision
// nobody has taken, not a re-home.

/** The two answers a refusal resolves to: a PROVEN different identity, or a read that could not be made.
 *  Fail-closed is `unreadable` — only a proven foreign binding earns silence. */
export type OriginRefusalVerdict = "other" | "unreadable";

/** One identity reader's full verdict: its own HIT arm plus the shared refusal pair.
 *  @public knip type-face false positive — the generic behind every named verdict alias in this file (`BroadcastChannelVerdict`,
 *  `ProcessMemberVerdict`, and their siblings): consumers import the alias, never the generic it is an instantiation of. */
export type OriginVerdict<Hit extends string> = Hit | OriginRefusalVerdict;

/** Does this `new` construct the browser's `BroadcastChannel` global? `lib/broadcast-channel-origin.ts`. */
export type BroadcastChannelVerdict = OriginVerdict<"constructs">;

/** Is this member read taken off the real node `process`? `lib/process-member-origin.ts`. */
export type ProcessMemberVerdict = OriginVerdict<"reads">;

/** Is this callee one of node's own path/fs doors? `lib/artifact-filing.ts`. */
export type PathCalleeVerdict = OriginVerdict<"path-call">;

/** Is this candidate call the canonical kit id seam? `lib/id-brand.ts`. `other` is the only silence — a
 *  PROVEN different identity, which is what a local same-named function is. */
export type KitIdCallVerdict = OriginVerdict<"kit">;

/** Does this reference enter through a symbol the located project home owns? `lib/project-home-origin.ts`. */
export type ProjectHomeVerdict = OriginVerdict<"home">;

/** Is this the React export the policy is asking about? `lib/react-origin.ts`. */
export type ReactOriginVerdict = OriginVerdict<"react">;

/** The REPORTABLE React verdicts. `other` is the only silent answer, and it is only reached by a PROVEN
 *  different identity. */
export type ReactExportFinding = Exclude<ReactOriginVerdict, "other">;
