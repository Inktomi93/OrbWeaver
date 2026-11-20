// The dialogue lines the colour suite renders: author content as SillyTavern presets ask a model to write it, each
// colour the author's own and never a design token.
import { TOKENS } from "@orb/ui/tokens";

/** A line whose colour the seal keeps, the markup that carries it, and the authored colour value. */
export interface AcceptedColourLine {
  readonly words: string;
  readonly colour: string;
  readonly markup: (text: string) => string;
}

export const ACCEPTED_COLOUR_LINES: readonly AcceptedColourLine[] = [
  { words: "Hex font line", colour: "#ff0000", markup: (text) => `<font color="#ff0000">${text}</font>` },
  { words: "Named font line", colour: "Blue", markup: (text) => `<font color="Blue">${text}</font>` },
  { words: "Rgb span line", colour: "rgb(0, 128, 0)", markup: (text) => `<span style="color: rgb(0, 128, 0);">${text}</span>` },
  { words: "Hsl span line", colour: "hsl(240deg 100% 25%)", markup: (text) => `<span style="color:hsl(240deg 100% 25%)">${text}</span>` },
];

/** Lines whose style the seal drops whole: a second declaration, an injection, a url, an expression, a variable, an
 *  escape, a comment, or no colour at all. */
export const REFUSED_COLOUR_LINES: readonly { readonly words: string; readonly markup: (text: string) => string }[] = [
  { words: "Second declaration line", markup: (text) => `<span style="color:red; font-size:40px">${text}</span>` },
  { words: "Injected semicolon line", markup: (text) => `<font color="red;background:blue">${text}</font>` },
  { words: "Url colour line", markup: (text) => `<span style="color:url(https://example.test/x)">${text}</span>` },
  { words: "Background url line", markup: (text) => `<span style="color:red;background:url(https://example.test/x)">${text}</span>` },
  { words: "Expression line", markup: (text) => `<span style="color:expression(alert(1))">${text}</span>` },
  { words: "Variable line", markup: (text) => `<font color="var(${TOKENS["color.primary"].cssVar})">${text}</font>` },
  { words: "Escaped keyword line", markup: (text) => `<span style="color:\\72 ed">${text}</span>` },
  { words: "Escaped url line", markup: (text) => `<span style="color:\\75rl(x)">${text}</span>` },
  { words: "Comment line", markup: (text) => `<span style="color:red/**/">${text}</span>` },
  { words: "Background only line", markup: (text) => `<span style="background:red">${text}</span>` },
];
