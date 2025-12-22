export const debugLog = (...args: unknown[]): void => {
  if (!import.meta.env.DEV) return;
  console.log(...args);
};

export const warnLog = (...args: unknown[]): void => {
  console.warn(...args);
};

export const errorLog = (...args: unknown[]): void => {
  console.error(...args);
};
