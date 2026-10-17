/** Where the https listener binds, what it serves, and the app listener it forwards to. */
export interface TlsTerminatorOptions {
  readonly port: number;
  /** The app listener's own interface; undefined binds every interface. */
  readonly host: string | undefined;
  readonly certificatePem: string;
  readonly keyPem: string;
  /** The app listener's loopback origin, such as `http://127.0.0.1:8788`, read per request. */
  readonly upstream: () => string;
}

/** A listening terminator. A renewal swaps the certificate in place; `close` ends every connection. */
export interface TlsTerminator {
  readonly port: number;
  readonly replaceCertificate: (certificatePem: string, keyPem: string) => void;
  readonly close: () => Promise<void>;
}
