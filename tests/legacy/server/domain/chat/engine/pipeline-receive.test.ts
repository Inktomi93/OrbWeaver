// engine/pipeline — RECEIVE (D53 step 2): the <think> demux, the AI_OUTPUT regex, post-process and the REASONING regex.

import type { AssembleContext } from "@orb/contracts/chat";
import { pipelineStepKey, RECEIVE_POST_PROCESS_ORDER, REPLY_LANE_STEPS } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { getLog } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import type { TurnRequest } from "./_pipeline-support.ts";
import { ARIA, baseArgs, cfgWith, ctxOf, finalTurn, historyText, KAI, runTurnPipeline, script } from "./_pipeline-support.ts";

describe("runTurnPipeline — RECEIVE regex + post-process", () => {
  test("AI_OUTPUT regex transforms the content (host-tier scripts)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("Hello world"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [script("ai", "world", "there", "AI_OUTPUT")],
      }),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("Hello there");
  });

  test("post-process runs AFTER the AI_OUTPUT regex (regex → dropIncompleteSentence)", async () => {
    // AI_OUTPUT rewrites the marker to "Done. tail"; dropIncompleteSentence then cuts the trailing fragment.
    const { args } = baseArgs({
      runChatTurn: finalTurn("MARK"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [script("x", "MARK", "Done. tail", "AI_OUTPUT")],
        promptConfig: cfgWith({
          postProcess: {
            collapseNewlines: false,
            trimTrailingWhitespace: false,
            dropIncompleteSentence: true,
            singleLine: false,
          },
        }),
      }),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("Done.");
  });

  // ── THE RECEIVE ORDER PIN (D121-E's order table) ──────────────────────────────────────────────────
  // The law: think-demux → AI_OUTPUT regex → postProcess → per-speaker clean → REASONING regex. The tests
  // around this one pin adjacent PAIRS; this one pins the whole CHAIN in a single turn, so a reorder
  // anywhere along it breaks here even when every neighbouring pair still looks locally right.
  //
  // Order-as-prose rots — that is exactly how the Transforms readout came to print REASONING before
  // AI_OUTPUT while the engine ran the reverse. This is the executable version of the table.
  test("RECEIVE ORDER: think-demux → AI_OUTPUT regex → postProcess → REASONING regex, in that order", async () => {
    const { args } = baseArgs({
      // The model emits an INLINE <think> block plus a content marker; the reasoning channel is inline, so
      // the demux must run FIRST or the AI_OUTPUT script would see (and rewrite) the reasoning text too.
      runChatTurn: finalTurn("<think>ponder RAW</think>SEED"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [
          // AI_OUTPUT turns the marker into a two-sentence string whose tail is a fragment …
          script("ai", "SEED", "Kept. frag", "AI_OUTPUT"),
          // … and REASONING rewrites a token that ONLY exists inside the demuxed reasoning channel.
          script("re", "RAW", "refined", "REASONING"),
        ],
        promptConfig: cfgWith({
          postProcess: { collapseNewlines: false, trimTrailingWhitespace: false, dropIncompleteSentence: true, singleLine: false },
          reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" },
        }),
      }),
    });

    const result = await runTurnPipeline(args);

    // CONTENT proves demux-before-regex AND regex-before-postProcess: the reasoning text never reached the
    // AI_OUTPUT pass, the marker WAS rewritten, and the fragment the rewrite created was then dropped.
    expect(result.content).toBe("Kept.");
    // REASONING proves the reasoning pass ran on the DEMUXED channel — a token only present in it.
    expect(result.reasoning).toBe("ponder refined");
  });

  // ── THE DECLARATION vs THE ENGINE ────────────────────────────────────────────────────────────────
  // `REPLY_LANE_STEPS` (@orb/contracts/preset) is what the preset editor's Transforms readout RENDERS —
  // it replaced nine hand-numbered rows that had drifted into four untruths at once. A declaration of
  // someone else's order is worth exactly as much as the test that binds it to that order, so this one
  // OBSERVES the engine and compares the observation to the declaration; neither side is hardcoded here.
  //
  // WHAT IS OBSERVABLE, and what is not: the regex passes are observable through the INJECTED watchdog
  // (`applyRegexReplace` sees every compiled pattern, in call order), and post-process-after-AI_OUTPUT is
  // observable in the content (the test above). The post-process block's position relative to the
  // REASONING pass is NOT observable by construction — they operate on different channels and can never
  // interact — so it is held by the source order plus the contracts-side lane pins, and this test says so
  // rather than faking a proof of it.
  test("DECLARATION vs ENGINE: the declared reply lane's server-side legs fire in the declared order", async () => {
    const fired: string[] = [];
    const { args } = baseArgs({
      // A patterned watchdog: it records which leg is running (by the script's own pattern) and then does
      // the real replace, so the turn's output stays honest while the ORDER is captured.
      applyRegexReplace: (text, regex, replacer) => {
        fired.push(regex.source);
        return text.replace(regex, replacer);
      },
      runChatTurn: finalTurn("<think>ponder RAW</think>SEED"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [
          script("ai", "SEED", "Kept. frag", "AI_OUTPUT"),
          script("re", "RAW", "refined", "REASONING"),
          // A DISPLAY script is attached too: the reply-side lane declares it LAST and CLIENT-side, so the
          // server must never fire it. A leg that ran here would be the readout's claim made false the
          // other way round — "never touches the wire" is the whole point of that row.
          script("disp", "Kept", "SHOWN", "DISPLAY"),
        ],
        promptConfig: cfgWith({
          postProcess: { collapseNewlines: false, trimTrailingWhitespace: false, dropIncompleteSentence: true, singleLine: false },
          reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" },
        }),
      }),
    });

    const result = await runTurnPipeline(args);

    // The DECLARED order of the server-side regex legs — read off the tuple, never spelled here.
    const declaredLegs = REPLY_LANE_STEPS.filter((step) => step.kind === "regex" && step.placement !== "DISPLAY").map(pipelineStepKey);
    // The OBSERVED order, named by the pattern each leg's script carries (a Map — the keys are regex
    // sources, not identifiers, and an object literal of them is a naming-convention violation).
    const legOfPattern = new Map([
      ["SEED", "regex:AI_OUTPUT"],
      ["RAW", "regex:REASONING"],
    ]);
    expect(fired.map((source) => legOfPattern.get(source) ?? `regex:UNKNOWN(${source})`)).toEqual(declaredLegs);
    // The DISPLAY leg is declared last AND client-side: it must not have fired, and the content proves it.
    expect(fired).not.toContain("Kept");
    expect(result.content).toBe("Kept.");
    // post-process ran AFTER the AI_OUTPUT pass (the fragment its rewrite created is gone), which is the
    // one ordering the declaration asserts between a regex leg and the switch block that IS observable.
    const declaredReply = REPLY_LANE_STEPS.map(pipelineStepKey);
    for (const flag of RECEIVE_POST_PROCESS_ORDER) {
      expect(declaredReply.indexOf(`post-process:${flag}`)).toBeGreaterThan(declaredReply.indexOf("regex:AI_OUTPUT"));
    }
    expect(result.reasoning).toBe("ponder refined");
  });

  test("the AI_OUTPUT pass does NOT reach the reasoning channel (the demux boundary holds)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>SHARED</think>SHARED"),
      // ONE token present in BOTH channels, rewritten by an AI_OUTPUT script only.
      assembleContext: ctxOf({
        hostTierRegexScripts: [script("ai", "SHARED", "content-only", "AI_OUTPUT")],
        promptConfig: cfgWith({ reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" } }),
      }),
    });

    const result = await runTurnPipeline(args);

    expect(result.content).toBe("content-only");
    // If the pass ran before the demux (or on the whole envelope), the reasoning would read "content-only".
    expect(result.reasoning).toBe("SHARED");
  });

  test("REASONING regex transforms the reasoning channel (content untouched)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("reply", "think hard"),
      assembleContext: ctxOf({ hostTierRegexScripts: [script("r", "hard", "soft", "REASONING")] }),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("think soft");
    expect(result.content).toBe("reply");
  });

  test("the AI_OUTPUT regex runs through the INJECTED watchdog (a throwing fake skips the script)", async () => {
    // A throwing applyRegexReplace → the kit executor's per-script try/catch skips it → content UNCHANGED. The
    // default native replace would have produced "X" — so the unchanged output proves the seam was used (D53).
    const { args } = baseArgs({
      applyRegexReplace: () => {
        throw new Error("timed out");
      },
      runChatTurn: finalTurn("Hello"),
      assembleContext: ctxOf({ hostTierRegexScripts: [script("evil", "Hello", "X", "AI_OUTPUT")] }),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("Hello");
  });

  test("F9: a watchdog trip is OBSERVABLE — the swallowed throw is logged with the placement + pattern", async () => {
    // Fail-open (content unchanged) is by design; F9 adds the missing OBSERVABILITY — the D53 watchdog's
    // deliberate throw must reach the operator log, not the kit executor's `onScriptFailure?.()` no-op.
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      const { args } = baseArgs({
        applyRegexReplace: () => {
          throw new Error("timed out");
        },
        runChatTurn: finalTurn("Hello"),
        assembleContext: ctxOf({
          hostTierRegexScripts: [script("evil", "Hello", "X", "AI_OUTPUT")],
        }),
      });
      await runTurnPipeline(args);
      expect(warnSpy).toHaveBeenCalled();
      const [payload] = warnSpy.mock.calls[0] ?? [];
      expect(payload).toMatchObject({ placement: "AI_OUTPUT", findRegex: "Hello" });
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("runTurnPipeline — RECEIVE per-speaker canon clean (F1)", () => {
  const groupCtx = (): AssembleContext =>
    ctxOf({
      character: { name: "Kai", description: "a rogue" },
      characters: [
        { name: "Kai", description: "a rogue" },
        { name: "Aria", description: "a knight" },
      ],
      speakerRefs: [
        { kind: "character", characterId: KAI },
        { kind: "character", characterId: ARIA },
      ],
    });
  const perSpeaker = {
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    speakerName: "Kai",
    speakerRef: { kind: "character", characterId: KAI },
  } as const;

  test("a per-speaker turn that drifts into a castmate's line persists ONLY the own speaker's content", async () => {
    // The exact failure cleanPerSpeakerReply exists to fix: the model rolls Kai's turn on into Aria's line.
    const { args } = baseArgs({
      runChatTurn: finalTurn("I attack the goblin.\nAria: I characters a shield."),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin.");
  });

  test("a per-speaker turn that echoes its OWN leading label has it stripped from canon", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("Kai: I attack the goblin."),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin.");
  });

  test("a mid-word self-tag splice never persists to canon (the dumJFC word-boundary case)", async () => {
    // P1 corruption regression, fixture synthetic assistant message (seq 5): a speakerTags group
    // turn trained the model to echo its own `Kai:` tag, and it spat one MID-WORD at a token boundary
    // (`dum` + `Kai: —` + `b`). The `^`-anchored leading strip can't reach it — RED before the inline scrub.
    const { args } = baseArgs({
      runChatTurn: finalTurn("ship the dumKai: —b version by Friday"),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("ship the dumb version by Friday");
    expect(result.content).not.toContain("Kai:");
  });

  test("merged/narrator output is NOT cleaned — foreign labels are the intended transcript", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("I attack the goblin.\nAria: I characters a shield."),
      assembleContext: groupCtx(),
      shape: { ...perSpeaker, output: "narrator", speakerName: "Kai & Aria" },
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin.\nAria: I characters a shield.");
  });

  test("a legitimate single-speaker reply with no drift is untouched", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("I attack the goblin and take cover."),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin and take cover.");
  });

  // Owner ruling (the stable merged layout): every speaker of a merged room sends the SAME system block, so the
  // room writes one cache entry instead of one per speaker, and the round cue is the only place the speaker is
  // named — so a turn whose round sent no cue (one speaker, a regenerate) still carries one.
  test("merged: Kai's and Aria's turns send byte-identical system blocks, and each cue names its own speaker", async () => {
    const run = async (speakerName: string, characterId: CharacterId): Promise<TurnRequest> => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("ok"),
        assembleContext: groupCtx(),
        shape: { ...perSpeaker, speakerName, speakerRef: { kind: "character", characterId } },
      });
      return (await runTurnPipeline(args)).request;
    };
    const kai = await run("Kai", KAI);
    const aria = await run("Aria", ARIA);
    expect(aria.prompt.static).toBe(kai.prompt.static);
    expect(kai.prompt.static).toContain("[Character — Aria]");
    expect(kai.prompt.static).not.toContain("[Also present");
    expect(historyText(kai)).toContain("[Write the next reply only as Kai.");
    expect(historyText(aria)).toContain("[Write the next reply only as Aria.");
  });

  // IMP-1 layer 2b — an impersonate draft is the USER's line, so "self" is the PERSONA and EVERY CHARACTER is
  // foreign. An impersonate turn carries no `shape`, which is exactly why the pre-IMP-1 fallback (self = the
  // character) ran the inverted configuration on it.
  describe("impersonate — self is the persona, every character is foreign", () => {
    test("a leading CHARACTER label is NOT stripped — the composer must SEE the bleed, not receive it laundered", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn('Kai: "You are paying, or you sleep outside."'),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe('Kai: "You are paying, or you sleep outside."');
    });

    test("a draft that rolls on into ANY other character's line is truncated — including the primary character", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("I drop the satchel by the fire.\nKai: I watch her do it."),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe("I drop the satchel by the fire.");
    });

    test("the drafter's OWN persona label is stripped (the user never types their own name)", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("Alex: I drop the satchel by the fire."),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe("I drop the satchel by the fire.");
    });

    test("a clean first-person draft is untouched", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("I shake the rain off my coat and ask Kai about the ford."),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe("I shake the rain off my coat and ask Kai about the ford.");
    });
  });
});

describe("runTurnPipeline — RECEIVE <think> demux (D47 #3)", () => {
  const reasoningCfg = cfgWith({
    reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" },
  });

  test("splits inline reasoning when native reasoning is empty + autoParse on", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>planning</think>The reply."),
      assembleContext: ctxOf({ promptConfig: reasoningCfg }),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("planning");
    expect(result.content).toBe("The reply.");
  });

  test("is SKIPPED when native reasoning is present (native-first — no double-count)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>x</think>visible", "native trace"),
      assembleContext: ctxOf({ promptConfig: reasoningCfg }),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("native trace");
    expect(result.content).toBe("<think>x</think>visible");
  });

  test("autoParse off (default config) → the <think> block stays in content", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>x</think>y"),
      assembleContext: ctxOf(),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("<think>x</think>y");
    expect(result.reasoning).toBeNull();
  });
});
