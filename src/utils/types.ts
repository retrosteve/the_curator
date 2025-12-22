export type Primitive = null | undefined | string | number | boolean | bigint | symbol;

export type DeepReadonly<T> =
  // Keep functions callable
  T extends (...args: infer A) => infer R ? (...args: A) => R :
  // Primitives are already immutable
  T extends Primitive ? T :
  // Arrays
  T extends ReadonlyArray<infer R> ? ReadonlyArray<DeepReadonly<R>> :
  // Maps/Sets
  T extends ReadonlyMap<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>> :
  T extends ReadonlySet<infer U> ? ReadonlySet<DeepReadonly<U>> :
  // Objects
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hasOwn<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
