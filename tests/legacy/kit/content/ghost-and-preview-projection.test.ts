import { PREVIEW_MAX_CHARS, projectBodyForPreview, scanGhostContent, tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";

describe("scanGhostContent — the §4.5 forming-card ghost scan (P4)", () => {
  test("no card open → one byte-identical text segment", () => {
    expect(scanGhostContent("hello **world**")).toEqual([{ kind: "text", text: "hello **world**" }]);
    expect(scanGhostContent("")).toEqual([{ kind: "text", text: "" }]);
  });

  test("an INCOMPLETE open line (no newline yet) stays text — recognition waits for the completed line", () => {
    expect(scanGhostContent('prose\n:::card title="Zan')).toEqual([{ kind: "text", text: 'prose\n:::card title="Zan' }]);
  });

  test("a completed open line suppresses the accumulating body behind a forming-card segment", () => {
    const segments = scanGhostContent('The letter reads:\n:::card title="Zandik\'s letter"\n<div>half-streamed HT');
    expect(segments).toEqual([
      { kind: "text", text: "The letter reads:\n" },
      { kind: "forming-card", title: "Zandik's letter" },
    ]);
  });

  test("a FORMING card exposes NO body bytes — a renderer structurally cannot paint partial HTML", () => {
    const [segment] = scanGhostContent(':::card title="Terminal"\n<div>half-streamed <img src="https://evil.test/p.png">');
    expect(segment).toEqual({ kind: "forming-card", title: "Terminal" });
    expect(JSON.stringify(segment)).not.toContain("evil.test");
  });

  test("a title-less open forms with title null", () => {
    expect(scanGhostContent(":::card\n<div>")).toEqual([{ kind: "forming-card", title: null }]);
  });

  test("a CLOSED fence mid-stream becomes a real card segment carrying its FINAL body; prose resumes after", () => {
    const segments = scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::\nAnd the crowd gasps');
    expect(segments).toEqual([
      { kind: "card", title: "Poster", body: "<div>done</div>" },
      { kind: "text", text: "And the crowd gasps" },
    ]);
  });

  test("SECURITY: an UNTERMINATED close line is NOT a close — the next token can still revoke it", () => {
    // A trailing `:::` with no newline matches FENCE_CLOSE_RE, so without the termination requirement the
    // ghost would mount a card whose body is not final — and `:::x` on the next token would revoke it,
    // flipping the card back to a chip. A model that types a close-looking line cannot spoof a close.
    expect(scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::')).toEqual([{ kind: "forming-card", title: "Poster" }]);
    // The very next token proves the revocation was real: it was never a close line at all.
    expect(scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::x\n')).toEqual([{ kind: "forming-card", title: "Poster" }]);
    // The newline is what makes it final.
    expect(scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::\n')).toEqual([{ kind: "card", title: "Poster", body: "<div>done</div>" }]);
  });

  test("a closed card's segment is IMMUTABLE under every later token (the one-mount invariant)", () => {
    const closed = ':::card title="Poster"\n<div>done</div>\n:::\n';
    const [first] = scanGhostContent(closed);
    for (const tail of ["A", "And the crowd ", "And the crowd gasps.\n\nThen silence.", '\n:::card title="Second"\n<p>x</p>\n:::\n']) {
      expect(scanGhostContent(closed + tail)[0]).toEqual(first);
    }
  });

  test("the ghost card body is the SAME projection the committed grammar produces (one card, not two)", () => {
    const body = ':::card title="Poster"\n<div>a</div>\n<p>b</p>\n:::\n';
    const ghost = scanGhostContent(body)[0];
    const committed = tokenizeContent(body).find((s) => s.kind === "card");
    expect(ghost).toMatchObject({ kind: "card", title: "Poster" });
    expect(ghost?.kind === "card" ? ghost.body : null).toBe(committed?.kind === "card" ? committed.body : undefined);
  });

  test("a nested `:::` inside the body does not close the card early (balance-aware, same as committed)", () => {
    const segments = scanGhostContent(':::card title="Outer"\n:::choices\n1. a\n:::\n<p>still mine</p>\n:::\ntail');
    expect(segments).toEqual([
      { kind: "card", title: "Outer", body: ":::choices\n1. a\n:::\n<p>still mine</p>" },
      { kind: "text", text: "tail" },
    ]);
  });

  test("a markdown code-fence region never forms a card (the author is SHOWING the syntax)", () => {
    const text = '```\n:::card title="shown"\n```\nprose';
    expect(scanGhostContent(text)).toEqual([{ kind: "text", text }]);
  });

  test("§4h: a tolerated open forms the chip too — the ghost never disagrees with the committed parse", () => {
    // Otherwise a malformed opener would stream as raw HTML and then SNAP into a card at commit.
    expect(scanGhostContent(':::card title="Maintenance Terminal — Login">\n<div>LOG')).toEqual([
      { kind: "forming-card", title: "Maintenance Terminal — Login" },
    ]);
    // …and a genuinely unparseable open still streams as text in both planes.
    const broken = ":::card title='Login'\n<div>LOG";
    expect(scanGhostContent(broken)).toEqual([{ kind: "text", text: broken }]);
  });

  test("a non-card directive open (:::choices) stays text in the ghost", () => {
    const text = ":::choices\n1. Run.\n";
    expect(scanGhostContent(text)).toEqual([{ kind: "text", text }]);
  });
});

// The PREVIEW plane (`ChatSummary.lastMessagePreview`): one line of plain prose, hidden-safe, capped.
describe("projectBodyForPreview", () => {
  test("markdown is FLATTENED to one line — headings, emphasis, lists, quotes, fences, links", () => {
    const body = "# The Gate\n\n> The door **gives way**.\n- `iron` hinges\n\n```ts\nconst x = 1;\n```\nAsh on the [wind](https://example.test/ash).";
    expect(projectBodyForPreview(body)).toBe("The Gate The door gives way. iron hinges const x = 1; Ash on the wind.");
  });

  test("STACKED block markers all come off — a heading inside a quote, a quote inside a bullet", () => {
    // Markdown stacks its leading markers and a single-marker pass left the inner one as literal syntax:
    // "> ### the copper tub" rendered as "### the copper tub" in the corpus Scenes snippets (C1).
    expect(projectBodyForPreview("> ### the copper tub\n\nThey settle in.")).toBe("the copper tub They settle in.");
    expect(projectBodyForPreview("- > she said nothing")).toBe("she said nothing");
  });

  test("HIDDEN-class spans are dropped — a preview is a durable, member-reachable artifact", () => {
    const body = 'She smiles. <lie character="Aria" type="claim" truth="she has the key" reason="cover"/> The room waits.';
    const preview = projectBodyForPreview(body);
    expect(preview).toBe("She smiles. The room waits.");
    expect(preview).not.toContain("she has the key");
  });

  test("structured spans carry no glanceable prose — card / choices / image / unknown-directive drop out", () => {
    expect(projectBodyForPreview(':::card title="Ashfell Night Market"\n<div>stalls</div>\n:::\nYou step out.')).toBe("You step out.");
    expect(projectBodyForPreview("Pick one.\n:::choices\n1. Run.\n:::")).toBe("Pick one.");
    expect(projectBodyForPreview("![a portrait](asset:asset_1)\nShe waits.")).toBe("She waits.");
    expect(projectBodyForPreview('<gmnote to="self" text="not prose"/>\nShe waits.')).toBe("She waits.");
  });

  test("a NARRATOR row's <speaker> markers flatten to plain NAME: attribution — never raw markup in the scent line", () => {
    // The chat-list subtitle is exactly this projection (`ChatSummary.lastMessagePreview`). A group narrator
    // body carries inline `<speaker>NAME</speaker>` markers that the message-list renderer splits + tints; the
    // one-line preview must read as prose, not leak the tag. Reuses the kit speaker engine (`speakerTagsToPlain`).
    const body = "<speaker>Aldric</speaker>The gate holds. <speaker>Sabine</speaker>For now.";
    const preview = projectBodyForPreview(body);
    expect(preview).not.toContain("<speaker>");
    expect(preview).not.toContain("</speaker>");
    expect(preview).toBe("Aldric: The gate holds. Sabine: For now.");
  });

  test("a NON-narrator body carries NO <speaker> markers, so the strip is a byte-for-byte no-op (the fence)", () => {
    // The speaker flatten must touch ONLY narrator rows. A per-speaker / solo / human body has no `<speaker>`
    // tags, so `speakerTagsToPlain` is a no-op and the preview is exactly the pre-change projection. A prose
    // line that merely mentions the word "speaker" (never as a tag) is likewise untouched.
    expect(projectBodyForPreview("She lowers her voice to a whisper. The room stills.")).toBe("She lowers her voice to a whisper. The room stills.");
    expect(projectBodyForPreview("The speaker at the lectern cleared his throat.")).toBe("The speaker at the lectern cleared his throat.");
  });

  test("truncation lands on the FLATTENED string — a long narrator preview caps to the budget, not the raw markup", () => {
    // The cap runs AFTER the speaker flatten, so the budget is spent on readable prose, never on `<speaker>` bytes.
    const body = `<speaker>Aldric</speaker>${"a".repeat(300)}`;
    const preview = projectBodyForPreview(body);
    expect(preview).toHaveLength(PREVIEW_MAX_CHARS);
    expect(preview.startsWith("Aldric: ")).toBe(true);
    expect(preview.endsWith("…")).toBe(true);
  });

  test("an all-structure or empty body previews as the EMPTY string (the caller decides what that means)", () => {
    expect(projectBodyForPreview("")).toBe("");
    expect(projectBodyForPreview('<lie character="Aria" truth="x"/>')).toBe("");
    // The rpg state-anchor slot: an empty body that must never read as a beat.
    expect(projectBodyForPreview("   \n\n  ")).toBe("");
  });

  test("the cap is a CHARACTER budget including the ellipsis — never a longer string than asked for", () => {
    const long = "a".repeat(300);
    expect(projectBodyForPreview(long)).toHaveLength(PREVIEW_MAX_CHARS);
    expect(projectBodyForPreview(long).endsWith("…")).toBe(true);
    // At/below the cap nothing is appended (the common short line is byte-identical).
    expect(projectBodyForPreview("a".repeat(PREVIEW_MAX_CHARS))).toBe("a".repeat(PREVIEW_MAX_CHARS));
    expect(projectBodyForPreview("one two three", 8)).toBe("one two…");
  });

  // ── #188 N-2 — the cut lands BETWEEN WORDS, and the budget is the widest consumer's ──────────────
  // The same field is the chats-list row's one CSS-truncated line AND home's two-line `line-clamp-2`
  // hero. At 120 the hero rendered a server-severed "…she's und…" with ~420px of its own measure empty:
  // a character cap cannot know the rendered width, so the server budget has to be the WIDEST slot's and
  // the narrow ones cut in CSS. Mid-word is the other half — a scent line is prose read at a glance.
  test("a long line cuts on a WORD BOUNDARY, never mid-word", () => {
    const body = `${"word ".repeat(60)}undertow of the whole thing`;
    const preview = projectBodyForPreview(body);
    expect(preview.endsWith("…")).toBe(true);
    // Everything before the ellipsis is whole words: the char before it is not a letter cut in half, i.e.
    // the string the renderer receives ends where the author's word ended.
    expect(preview.slice(0, -1)).toBe("word ".repeat(47).trimEnd());
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS);
  });

  test("the budget serves the TWO-LINE hero, not the one-line row — a 200-char line survives whole", () => {
    const line =
      "She's under the ice again, and the lamp she carries is the only thing the dark has not yet taken " +
      "from her, though the cold is doing its patient work.";
    expect(line.length).toBeGreaterThan(120);
    expect(line.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS);
    expect(projectBodyForPreview(line)).toBe(line);
  });

  test("a line with NO boundary inside the floor is HARD-cut — a boundary cut would throw the line away", () => {
    // One unspaced token after a two-char head: cutting at that space would return "an…" and lose the line.
    const body = `an ${"x".repeat(400)}`;
    const preview = projectBodyForPreview(body);
    expect(preview).toHaveLength(PREVIEW_MAX_CHARS);
    expect(preview.startsWith("an x")).toBe(true);
  });
});
