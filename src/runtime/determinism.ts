/** Locale-independent Unicode scalar-value ordering for engine identifiers and
 * record keys. JavaScript's default string comparison orders UTF-16 code units,
 * which disagrees for supplementary-plane characters. */
export function compareCodepoints(a: string, b: string): number {
  const left = a[Symbol.iterator]();
  const right = b[Symbol.iterator]();
  while (true) {
    const l = left.next();
    const r = right.next();
    if (l.done || r.done) {
      return l.done === r.done ? 0 : l.done ? -1 : 1;
    }
    const lcp = l.value.codePointAt(0)!;
    const rcp = r.value.codePointAt(0)!;
    if (lcp !== rcp) return lcp < rcp ? -1 : 1;
  }
}

export function orderedKeys<T>(record: Readonly<Record<string, T>>): string[] {
  return Object.keys(record).sort(compareCodepoints);
}

export function orderedEntries<T>(
  record: Readonly<Record<string, T>>,
): Array<[string, T]> {
  return orderedKeys(record).map((key) => [key, record[key]!] as [string, T]);
}

export function orderedValues<T>(record: Readonly<Record<string, T>>): T[] {
  return orderedKeys(record).map((key) => record[key]!);
}

export function orderedStrings(values: readonly string[]): string[] {
  return [...values].sort(compareCodepoints);
}

/** Rebuild a JSON-like value with every object key in codepoint order. Arrays
 * retain their authored order; only Record insertion order is normalized. */
export function orderRecordKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => orderRecordKeysDeep(entry)) as T;
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of orderedKeys(input)) {
      output[key] = orderRecordKeysDeep(input[key]);
    }
    return output as T;
  }
  return value;
}
