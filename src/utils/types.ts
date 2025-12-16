export type Primitive = null | undefined | string | number | boolean | bigint | symbol;

export type DeepReadonly<T> =
  // Keep functions callable
  T extends (...args: any[]) => any ? T :
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
