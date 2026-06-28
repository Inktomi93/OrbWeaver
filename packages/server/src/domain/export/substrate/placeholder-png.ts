// domain/export/substrate/placeholder-png — the 256×256 base PNG embedded into a card when the character
// has no avatar (export.md Esoteric — the placeholder half of `basePng`). Pure / zero I/O: a precomputed
// solid-color PNG decoded ONCE from a base64 constant at module load. Deterministic (fixed bytes — no
// clock, no random, no per-call work).
//
// Why a constant rather than generating it: the only PNG encoder in the stack is `sharp` (sealed in
// `infra/image`, D6), and the injected `imageTransform` op transcodes an EXISTING image — it cannot
// synthesize one from raw pixels. Rather than re-import `sharp` into the domain (the infra seal) just to
// emit a fixed placeholder, the bytes are baked here. The blob was produced once via the infra adapter:
// `sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 40, g: 40, b: 50 } } }).png()`.

import { Buffer } from "node:buffer";

// biome-ignore format: keep the blob on one line so the noSecrets suppression attaches to it.
// biome-ignore lint/security/noSecrets: a base64-encoded PNG image blob, not a credential.
const PLACEHOLDER_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAFMUlEQVR4nO3csQ3EMAwEQZWzMfsvzjU4YsABVMBjvYIt8e5fjYVAVzV467/AQiAbgAQI5A1AAgTyCUQCBHIGIAECOQSTAIHcApEAgVyDkgCBzAFIgEAGYSRAIJNgEiCQKAQJEEgWiAQIJAxHAgSSBiUBAolDkwCB9AFIgEAKMSRAII0wEiCQSiQJEEgnmAQpZCvFk6Db28C/Quw/AysbgAQI5A1AAgTyCUQCBHIGIAECOQSTAIHcApEAgVyDkgCBzAFIgEAGYSRAIJNgEiCQKAQJEEgWiAQIJAxHAgSSBiUBAolDkwCB9AFIgEAKMSRAII0wEiCQSiQJEEgnmASpIyvFk6Db28C/Quw/AysbgAQI5A1AAgTyCUQCBHIGIAECOQSTAIHcApEAgVyDkgCBzAFIgEAGYSRAIJNgEiCQKAQJEEgWiAQIJAxHAgSSBiUBAolDkwCB9AFIgEAKMSRAII0wEiCQSiQJEEgnmASpIyvFk6Db28C/Quw/AysbgAQI5A1AAgTyCUQCBHIGIAECOQSTAIHcApEAgVyDkgCBzAFIgEAGYSRAIJNgEiCQKAQJEEgWiAQIJAxHAgSSBiUBAolDkwCB9AFIgEAKMSRAQCOMBAiMSiQJEBidYBIgoBRPgq5vA/8Ksf8MrGwAEiCQNwAJEMgnEAkQyBmABAjkEEwCBHILRAIEcg1KAgQyByABAhmEkQCBTIJJgECiECRAIFkgEiCQMBwJEEgalAQIJA5NAgTSByABAinEkACBNMJIgEAqkSRAIJ1gEqSOrBRPgm5vA/8Ksf8MrGwAEiCQNwAJEMgnEAkQyBmABAjkEEwCBHILRAIEcg1KAgQyByABAhmEkQCBTIJJgECiECRAIFkgEiCQMBwJEEgalAQIJA5NAgTSByABAinEkACBNMJIgEAqkSRAIJ1gEqSOrBRPgm5vA/8Ksf8MrGwAEiCQNwAJEMgnEAkQyBmABAjkEEwCBHILRAIEcg1KAgQyByABAhmEkQCBTIJJgECiECRAIFkgEiCQMBwJEEgalAQIJA5NAgTSByABAinEkACBNMJIgEAqkSRAIJ1gEqSOrBRPgm5vA/8Ksf8MrGwAEiCQNwAJEMgnEAkQyBmABAjkEEwCBHILRAIEcg1KAgQyByABAhmEkQCBTIJJgECiECRAIFkgEiCQMBwJEEgalAQIJA5NAgTSByABAinEkACBNMJIgEAqkSRAIJ1gEqSOrBRPgm5vA/8Ksf8MrGwAEiCQNwAJEMgnEAkQyBmABAjkEEwCBHILRAIEcg1KAgQyByABAhmEkQCBTIJJgECiECRAIFkgEiCQMBwJEEgalAQIJA5NAgTSByABAinEkACBNMJIgEAqkSRAIJ1gEqSOrBRPgm5vA/8Ksf8MrGwAEiCQNwAJEMgnEAkQyBmABAjkEEwCBHILRAIEcg1KAgQyByABAhmEkQCBTIJJgECiECRAIFkgEiCQMBwJEJAGJQECIw5NAgRGH4AECIxCDAkQGI0wEiAwKpEkQGB0gkmAgFI8Cbq+DfwrxP4zsLIBSIBA3gAkQCCfQCRAIGcAEiCQQzAJEMgtEAkQyDUoCRDIHIAECGQQRgIEMgkmAQKJQpAAgWSBSIBAwnAkQCBpUBIgkDg0CRBIH4AECKQQQwIE0ggjAQKpRJIAgXSCSZA6slI8Cbq9DfwrxP4zsLIBSIBA3gAkQCCfQCRAIGcAEiCQQzAJEMgtEAkQyDUoCRDIHIAECGQQRgIEMgkmAQKJQpAAgWSBSIBA/7fBB3s2B5+uNjHjAAAAAElFTkSuQmCC";

/** The 256×256 placeholder PNG bytes — the base image when a character has no avatar. */
export const PLACEHOLDER_PNG: Uint8Array = new Uint8Array(
  Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"),
);
