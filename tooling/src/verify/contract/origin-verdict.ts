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

/** The two answers a refusal resolves to: a PROVEN different identity, or a read that could not be made.
 *  Fail-closed is `unreadable` — only a proven foreign binding earns silence. */
export type OriginRefusalVerdict = "other" | "unreadable";

/** One identity reader's full verdict: its own HIT arm plus the shared refusal pair. */
export type OriginVerdict<Hit extends string> = Hit | OriginRefusalVerdict;
