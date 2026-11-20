// Whether framed markup needs its own scripts to work, read by the host from the same text the frame gets, so the
// reader can be told why a control does nothing when the frame's posture runs no script. It decides no posture: the
// frame's own CSP refuses the script whatever this answers, so a wrong answer only shows or hides the notice.
//
// The markup is parsed into a `DOMParser` document, which runs no script and loads no resource. Script is a script
// element the browser would run, an inline event handler attribute, or a `javascript:` address on an element that
// follows one.
//
// Cost: one parse of the markup and one forward walk over its elements, reading each element's attributes once. The
// answer stops at the first hit.
//
// Not seen: script a stylesheet cannot carry anyway, and a handler a frame script would attach at run time, which
// needs a script element this reads first.

// The script `type` values a browser runs: none, empty, a JavaScript MIME type, or a module.
const RUNNABLE_SCRIPT_TYPE = /^(?:module|(?:text|application)\/(?:x-)?(?:java|ecma)script)?$/iu;
const HANDLER_ATTRIBUTE = /^on[a-z]/iu;
// A browser strips leading control characters and spaces and every tab or newline from an address before it reads its
// scheme, so ` java\tscript:` runs too. Dropping every such character keeps that reading and adds no false scheme.
const LAST_ADDRESS_NOISE = 0x20;
const SCRIPT_SCHEME = "javascript:";
const ADDRESS_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src", "action", "formaction", "xlink:href"]);

function namesScriptScheme(address: string): boolean {
  let read = "";
  for (const char of address) {
    if ((char.codePointAt(0) ?? 0) > LAST_ADDRESS_NOISE) {
      read += char.toLowerCase();
      if (read.length >= SCRIPT_SCHEME.length) {
        return read === SCRIPT_SCHEME;
      }
    }
  }
  return false;
}

function runsScript(element: Element): boolean {
  if (element.localName === "script") {
    return RUNNABLE_SCRIPT_TYPE.test((element.getAttribute("type") ?? "").trim());
  }
  for (const attribute of element.attributes) {
    // An element of a parsed document carries its interface, so `onclick in element` names a real handler and an
    // attribute such as `one` is none.
    if (HANDLER_ATTRIBUTE.test(attribute.name) && attribute.name.toLowerCase() in element) {
      return true;
    }
    if (ADDRESS_ATTRIBUTES.has(attribute.name.toLowerCase()) && namesScriptScheme(attribute.value)) {
      return true;
    }
  }
  return false;
}

/** Whether a frame document built from `html` carries script its controls need: a runnable script element, an inline
 *  event handler or a `javascript:` address. */
export function holdsScript(html: string): boolean {
  const document = new DOMParser().parseFromString(html, "text/html");
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Element && runsScript(node)) {
      return true;
    }
  }
  return false;
}
