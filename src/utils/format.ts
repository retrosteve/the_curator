/**
 * Formatting utilities for display values.
 * Provides consistent formatting for currency, numbers, and other game data.
 */

/**
 * Format a number as currency with dollar sign and thousands separators.
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., "$1,500")
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

/**
 * Format a number with thousands separators (no currency symbol).
 * @param value - The value to format
 * @returns Formatted number string (e.g., "1,500")
 */
export function formatNumber(value: number): string {
  return value.toLocaleString();
}
