import { createHiddenSpanStreamScrubber, stripHiddenSpans } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";

describe("createHiddenSpanStreamScrubber — the §3.6 MID-STREAM member scrubber", () => {
  const hidden = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';

  /** Drive a full body through the scrubber one CHAR at a time (the adversarial worst case: every prefix
   *  boundary is observed) and return the member's full observed stream. */
  function scrubCharByChar(body: string): { readonly observed: string; readonly prefixes: readonly string[] } {
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = "";
    const prefixes: string[] = [];
    for (const ch of body) {
      observed += scrubber.push(ch);
      prefixes.push(observed);
    }
    observed += scrubber.flush();
    prefixes.push(observed);
    return { observed, prefixes };
  }

  test("a member's observed DELTA stream never contains hidden bytes at ANY prefix point (char-by-char)", () => {
    const { observed, prefixes } = scrubCharByChar(`He nods. ${hidden} "Nothing," he says.`);
    // The final observed stream equals the at-commit strip — one verdict for the whole body.
    expect(observed).toBe(stripHiddenSpans(`He nods. ${hidden} "Nothing," he says.`).content);
    expect(observed).toBe('He nods.  "Nothing," he says.');
    // EVERY intermediate prefix is leak-free — not just the final frame.
    for (const p of prefixes) {
      expect(p).not.toContain("crypt");
      expect(p).not.toContain("<lie");
      expect(p).not.toContain("truth=");
    }
  });

  test("chunk-boundary invariance: an arbitrary split of the same body yields the SAME leak-free stream", () => {
    const body = `A ${hidden} B`;
    // A pathological split straddling the tag open, name, and close.
    for (const size of [1, 2, 3, 5, 7, 13]) {
      const scrubber = createHiddenSpanStreamScrubber();
      let observed = "";
      for (let i = 0; i < body.length; i += size) {
        observed += scrubber.push(body.slice(i, i + size));
        expect(observed).not.toContain("crypt");
      }
      observed += scrubber.flush();
      expect(observed).toBe("A  B");
    }
  });

  test("the HOST stream is unchanged — a host never constructs a scrubber (verbatim); assert the plain-text passthrough is byte-identical", () => {
    // The scrubber is member-only; a plain body with no hidden spans round-trips byte-identically.
    const { observed } = scrubCharByChar("plain prose with a <div>tag</div> and ![a](asset:x)");
    expect(observed).toBe("plain prose with a <div>tag</div> and ![a](asset:x)");
  });

  test("a TRUNCATED/aborted hidden span is DROPPED, never wedges the stream (fail-closed at flush)", () => {
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = scrubber.push("The truth is ");
    observed += scrubber.push('<lie character="Z" truth="the cryp'); // stream aborts mid-attr
    // Nothing hidden emitted mid-stream…
    expect(observed).toBe("The truth is ");
    // …and the held in-progress open is DROPPED at flush (the member keeps the at-commit-stripped view).
    observed += scrubber.flush();
    expect(observed).toBe("The truth is ");
    expect(observed).not.toContain("cryp");
  });

  test("a non-hidden tag whose name PREFIXES a hidden tag is held then RELEASED (`<li>`/`<link>` are not `<lie>`)", () => {
    // `<li` is a live prefix of `<lie` and is held until the next char disqualifies it.
    const { observed } = scrubCharByChar("item <li>one</li> and <link/> done");
    expect(observed).toBe("item <li>one</li> and <link/> done");
  });

  test("two hidden tags in one stream both vanish; interleaved prose survives", () => {
    const l1 = '<lie character="A" truth="secretOne"/>';
    const l2 = '<ofilter event="secretTwo" reason="r"/>';
    const { observed, prefixes } = scrubCharByChar(`start ${l1} mid ${l2} end`);
    expect(observed).toBe("start  mid  end");
    for (const p of prefixes) {
      expect(p).not.toContain("secretOne");
      expect(p).not.toContain("secretTwo");
    }
  });

  test("a lone trailing `<` at stream end is DROPPED (fail-closed: it could have opened a hidden tag); the safe prefix already emitted", () => {
    const scrubber = createHiddenSpanStreamScrubber();
    // The `<` is held (it could still begin `<lie`); nothing after it arrives, so flush drops it. The one lost
    // byte is cosmetic — the committed view is authoritative — and never a leak.
    expect(scrubber.push("done <")).toBe("done ");
    expect(scrubber.flush()).toBe("");
  });

  test("a real `<` followed by a non-tag char is RELEASED, not dropped (only a stream-final bare `<` is lost)", () => {
    // `5 < 3` — the space after `<` disqualifies a hidden-tag open, so the `<` streams through.
    const { observed } = scrubCharByChar("the count is 5 < 3 today");
    expect(observed).toBe("the count is 5 < 3 today");
  });

  test("SECURITY: a `<` INSIDE a hidden tag's attr value never releases the enclosing open's prefix (D106 mid-stream leak)", () => {
    // The `<lie truth="<ofilter …"/>` attr value carries a literal `<`. The rightmost-cut logic used to split
    // the tag at that inner `<`, releasing the `<lie truth="` prefix AND, once the outer `/>` arrived, the whole
    // secret as literal — a byte the commit strip drops. The quote-aware hold must keep the ENTIRE run held.
    const body = '<lie truth="<ofilter event=xyz secret"/> visible';
    const { observed, prefixes } = scrubCharByChar(body);
    expect(observed).toBe(stripHiddenSpans(body).content); // == " visible" (the whole hidden tag dropped)
    for (const p of prefixes) {
      expect(p).not.toContain("secret");
      expect(p).not.toContain("<lie");
      expect(p).not.toContain("ofilter");
    }
  });

  test("SECURITY: a hidden tag whose attr value contains an unclosed `<` and NEVER closes is dropped at flush (not leaked)", () => {
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = scrubber.push('<lie truth="a<b secret and more'); // a `<` mid-attr, stream aborts
    observed += scrubber.flush();
    expect(observed).toBe("");
    expect(observed).not.toContain("secret");
  });

  test("SECURITY: a `/>` INSIDE a quoted attr value does not false-close and leak the tag (quote-aware completion)", () => {
    const body = '<lie truth="path a/>b secret"/> tail';
    const { observed, prefixes } = scrubCharByChar(body);
    expect(observed).toBe(stripHiddenSpans(body).content); // == " tail"
    for (const p of prefixes) {
      expect(p).not.toContain("secret");
    }
  });

  // #1352 — the hold-back run used to be FORCE-RELEASED past 4096 bytes, opening tag included, on the theory
  // that an attr value that huge is model garbage. Garbage or not, those bytes are the concealed field.
  test("SECURITY: an over-cap hidden tag is NOT force-released mid-stream (4096- and 4097-char `truth`, 512-byte deltas)", () => {
    for (const secretLen of [4096, 4097]) {
      const secret = `SECRET-${"x".repeat(secretLen - 11)}-END`;
      const body = `before <lie character="A" truth="${secret}" reason="r"/> after`;
      const scrubber = createHiddenSpanStreamScrubber();
      let observed = "";
      const prefixes: string[] = [];
      for (let i = 0; i < body.length; i += 512) {
        observed += scrubber.push(body.slice(i, i + 512));
        prefixes.push(observed);
      }
      observed += scrubber.flush();
      prefixes.push(observed);
      // The tag closes, so the member still gets the surrounding prose — and never one byte of the secret.
      expect(observed).toBe(stripHiddenSpans(body).content);
      expect(observed).toBe("before  after");
      for (const p of prefixes) {
        expect(p).not.toContain("SECRET-");
        expect(p).not.toContain("<lie");
        expect(p).not.toContain("truth=");
      }
    }
  });

  // #1524's stream half. The scrubber released this body because its own walker saw a complete tag and handed
  // it to `stripHiddenSpans`, which could not classify it — so the leak needed BOTH passes to agree.
  test("SECURITY: a ``` inside a hidden tag's attr value never leaks the tag mid-stream (char-by-char)", () => {
    const fence = "`".repeat(3);
    const body = `before <lie truth="SECRET\n${fence}\nmore"/> after`;
    const { observed, prefixes } = scrubCharByChar(body);
    expect(observed).toBe(stripHiddenSpans(body).content);
    expect(observed).toBe("before  after");
    for (const p of prefixes) {
      expect(p).not.toContain("SECRET");
      expect(p).not.toContain("<lie");
      expect(p).not.toContain("truth=");
    }
  });

  test("SECURITY: a hidden open past the hidden scan bound conceals the REST OF THE TURN (never a late release)", () => {
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = scrubber.push('visible. <lie truth="');
    expect(observed).toBe("visible. ");
    for (let i = 0; i < 40; i += 1) {
      observed += scrubber.push("SECRET".repeat(100)); // 24 KiB total — past the 16 KiB hidden bound
    }
    // A late close must not resurrect the stream: the bytes between are still inside the attr value.
    observed += scrubber.push('"/> tail');
    observed += scrubber.flush();
    expect(observed).toBe("visible. ");
    expect(observed).not.toContain("SECRET");
  });
});
