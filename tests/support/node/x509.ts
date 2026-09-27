// Just enough DER for the IP certificate tests (D269), written apart from the library under test so its CSR and
// certificates are read by other code: an X.509 v3 certificate with one iPAddress SAN signed by an ECDSA key, and a
// PKCS#10 reader that returns the public key and the SAN GeneralNames as tag and bytes.

import type { KeyObject } from "node:crypto";
import { createPublicKey, sign } from "node:crypto";

const TAG = { integer: 0x02, bitString: 0x03, octetString: 0x04, oid: 0x06, utf8: 0x0c, sequence: 0x30, set: 0x31, utcTime: 0x17 } as const;
/** The context tag of a GeneralName iPAddress: `[7]`, primitive. */
export const GENERAL_NAME_IP_TAG = 0x87;
/** The context tag of a GeneralName dNSName: `[2]`, primitive. */
export const GENERAL_NAME_DNS_TAG = 0x82;

const OID = {
  commonName: "2.5.4.3",
  subjectAltName: "2.5.29.17",
  ecdsaWithSha256: "1.2.840.10045.4.3.2",
  extensionRequest: "1.2.840.113549.1.9.14",
} as const;

const SHORT_LENGTH_MAX = 0x7f;
const LONG_LENGTH_FLAG = 0x80;
const BYTE = 256;
const OID_BASE = 40;
const BASE128 = 128;
const EXPLICIT_CONTEXT = 0xa0;

function length(n: number): Buffer {
  if (n <= SHORT_LENGTH_MAX) {
    return Buffer.from([n]);
  }
  const bytes: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / BYTE)) {
    bytes.unshift(rest % BYTE);
  }
  return Buffer.from([LONG_LENGTH_FLAG + bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), length(content.length), content]);
}

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const bytes = [first * OID_BASE + second];
  for (const arc of rest) {
    const group: number[] = [arc % BASE128];
    for (let high = Math.floor(arc / BASE128); high > 0; high = Math.floor(high / BASE128)) {
      group.unshift((high % BASE128) + BASE128);
    }
    bytes.push(...group);
  }
  return tlv(TAG.oid, Buffer.from(bytes));
}

function sequence(...items: Buffer[]): Buffer {
  return tlv(TAG.sequence, Buffer.concat(items));
}

function name(commonName: string): Buffer {
  return sequence(tlv(TAG.set, sequence(oid(OID.commonName), tlv(TAG.utf8, Buffer.from(commonName, "utf-8")))));
}

function utcTime(ms: number): Buffer {
  const iso = new Date(ms).toISOString();
  const text = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return tlv(TAG.utcTime, Buffer.from(text, "ascii"));
}

/** The 4 or 16 bytes of an IP literal, as a GeneralName iPAddress carries them. */
export function ipBytes(address: string): Buffer {
  if (!address.includes(":")) {
    return Buffer.from(address.split(".").map(Number));
  }
  const [head = "", tail = ""] = address.split("::");
  const groups = (part: string): number[] => (part === "" ? [] : part.split(":").map((group) => Number.parseInt(group, 16)));
  const left = groups(head);
  const right = groups(tail);
  const words = [...left, ...new Array<number>(8 - left.length - right.length).fill(0), ...right];
  return Buffer.from(words.flatMap((word) => [Math.floor(word / BYTE), word % BYTE]));
}

/** A PEM certificate for `address` over `subjectPublicKey`, signed by `issuerKey` (a P-256 key). */
export function ipCertificatePem(options: {
  readonly address: string;
  readonly subjectPublicKey: KeyObject;
  readonly issuerKey: KeyObject;
  readonly issuerName: string;
  readonly serial: number;
  readonly notBefore: number;
  readonly notAfter: number;
}): string {
  const algorithm = sequence(oid(OID.ecdsaWithSha256));
  const san = sequence(oid(OID.subjectAltName), tlv(TAG.octetString, sequence(tlv(GENERAL_NAME_IP_TAG, ipBytes(options.address)))));
  const tbs = sequence(
    tlv(EXPLICIT_CONTEXT, tlv(TAG.integer, Buffer.from([2]))),
    tlv(TAG.integer, Buffer.from([options.serial])),
    algorithm,
    name(options.issuerName),
    sequence(utcTime(options.notBefore), utcTime(options.notAfter)),
    name(options.address),
    options.subjectPublicKey.export({ type: "spki", format: "der" }),
    tlv(EXPLICIT_CONTEXT + 3, sequence(san)),
  );
  const signature = sign("sha256", tbs, options.issuerKey);
  const der = sequence(tbs, algorithm, tlv(TAG.bitString, Buffer.concat([Buffer.from([0]), signature])));
  const body = der.toString("base64").replace(/(.{64})/gu, "$1\n");
  return `-----BEGIN CERTIFICATE-----\n${body.trimEnd()}\n-----END CERTIFICATE-----\n`;
}

interface Node {
  readonly tag: number;
  readonly start: number;
  readonly contentStart: number;
  readonly end: number;
}

function readNode(der: Buffer, at: number): Node {
  const tag = der[at] ?? 0;
  const first = der[at + 1] ?? 0;
  if (first <= SHORT_LENGTH_MAX) {
    return { tag, start: at, contentStart: at + 2, end: at + 2 + first };
  }
  const count = first - LONG_LENGTH_FLAG;
  let size = 0;
  for (let i = 0; i < count; i++) {
    size = size * BYTE + (der[at + 2 + i] ?? 0);
  }
  return { tag, start: at, contentStart: at + 2 + count, end: at + 2 + count + size };
}

function children(der: Buffer, parent: Node): Node[] {
  const nodes: Node[] = [];
  for (let at = parent.contentStart; at < parent.end; ) {
    const node = readNode(der, at);
    nodes.push(node);
    at = node.end;
  }
  return nodes;
}

function child(der: Buffer, parent: Node, index: number): Node {
  const found = children(der, parent)[index];
  if (found === undefined) {
    throw new Error(`DER node has no child ${String(index)}`);
  }
  return found;
}

function isOid(der: Buffer, node: Node | undefined, expected: Buffer): boolean {
  return node !== undefined && der.subarray(node.start, node.end).equals(expected);
}

// The GeneralNames inside one Extensions SEQUENCE's SAN extension, if it carries one.
function sanFromExtensions(der: Buffer, extensions: Node): { tag: number; bytes: Buffer }[] {
  const sanOid = oid(OID.subjectAltName);
  const names: { tag: number; bytes: Buffer }[] = [];
  for (const extension of children(der, extensions)) {
    const parts = children(der, extension);
    const value = parts.at(-1);
    if (!isOid(der, parts[0], sanOid) || value === undefined) {
      continue;
    }
    for (const generalName of children(der, readNode(der, value.contentStart))) {
      names.push({ tag: generalName.tag, bytes: der.subarray(generalName.contentStart, generalName.end) });
    }
  }
  return names;
}

/** A CSR's subject public key and the GeneralNames of its requested SAN extension. */
export function readCsr(der: Buffer): { readonly publicKey: KeyObject; readonly sanNames: readonly { readonly tag: number; readonly bytes: Buffer }[] } {
  const info = child(der, readNode(der, 0), 0);
  const spki = child(der, info, 2);
  const publicKey = createPublicKey({ key: der.subarray(spki.start, spki.end), format: "der", type: "spki" });
  const extensionRequestOid = oid(OID.extensionRequest);
  const sanNames: { tag: number; bytes: Buffer }[] = [];
  // CertificationRequestInfo is version, subject, key, then the [0] attributes.
  for (const attributes of children(der, info).slice(3)) {
    for (const attribute of children(der, attributes)) {
      const [type, values] = children(der, attribute);
      if (values !== undefined && isOid(der, type, extensionRequestOid)) {
        sanNames.push(...sanFromExtensions(der, child(der, values, 0)));
      }
    }
  }
  return { publicKey, sanNames };
}
