/**
 * Collision-resistant, sortable-ish identifiers.
 *
 * Deliberately dependency-free: ids are generated in the domain layer, in
 * seeds, and in tests, and we never want that to pull in a runtime.
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  // Available in Node 20+, edge runtimes and browsers.
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

/**
 * Prefixed id, e.g. `car_lq7f3k...`. The prefix makes ids self-describing in
 * logs, event payloads and the world-control inspector.
 */
export function createId(prefix: string): string {
  const time = Date.now().toString(36);
  return `${prefix}_${time}${randomString(12)}`;
}

export const ids = {
  user: () => createId("usr"),
  session: () => createId("ses"),
  world: () => createId("wld"),
  career: () => createId("car"),
  artist: () => createId("art"),
  group: () => createId("grp"),
  membership: () => createId("mem"),
  event: () => createId("evt"),
  job: () => createId("job"),
  notification: () => createId("ntf"),
  soundProfile: () => createId("snd"),
  discovery: () => createId("dsc"),
  trait: () => createId("trt"),
  generic: () => createId("id"),
};

/** Opaque token (session cookies, invite links). */
export function createToken(length = 32): string {
  return randomString(length);
}
