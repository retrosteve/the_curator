const QUOTES_NORMALIZATION: Array<[from: string, to: string]> = [
  ['\u201C', '"'],
  ['\u201D', '"'],
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u00A0', ' '],
];

export function normalizeCharacterKey(input: string): string {
  let s = input.trim();

  for (const [from, to] of QUOTES_NORMALIZATION) {
    // Avoid String.prototype.replaceAll to keep compatibility with current TS lib settings.
    s = s.split(from).join(to);
  }

  // Collapse whitespace and case-fold for stable lookups.
  s = s.replace(/\s+/g, ' ').toLowerCase();

  // Many character names include nicknames in quotes, but filenames may omit them.
  // Drop straight quotes to make lookups tolerant either way.
  s = s.replace(/["']/g, '');
  return s;
}
