const MIN_TCP_PORT = 1;
const MAX_TCP_PORT = 65_535;
const TCP_PORT_PATTERN = /^\d{1,5}$/u;
const HTTP_DEFAULT_PORT = 80;
const HTTPS_DEFAULT_PORT = 443;

/** Parse a TCP port without accepting whitespace, signs or out-of-range values. */
export function parseTcpPort(text: string): number | null {
  if (!TCP_PORT_PATTERN.test(text)) {
    return null;
  }
  const port = Number.parseInt(text, 10);
  return port >= MIN_TCP_PORT && port <= MAX_TCP_PORT ? port : null;
}

/** Resolve the actual HTTP endpoint port, including normalized-away explicit default ports. */
export function effectiveHttpPort(protocol: string, port: string): number | null {
  if (protocol !== "http:" && protocol !== "https:") {
    return null;
  }
  if (port !== "") {
    return parseTcpPort(port);
  }
  return protocol === "http:" ? HTTP_DEFAULT_PORT : HTTPS_DEFAULT_PORT;
}
