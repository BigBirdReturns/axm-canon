import { orderRecordKeysDeep } from "./determinism.js";

function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const value = String(part);
    for (let index = 0; index < value.length; index += 1) {
      h ^= value.charCodeAt(index);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function narrativeFingerprint(value: unknown): string {
  const canonical = JSON.stringify(orderRecordKeysDeep(value));
  return `fnv1a32:${hashSeed(canonical).toString(16).padStart(8, "0")}`;
}
