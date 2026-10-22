/**
 * Normalizes text for forgiving, case-insensitive search.
 * Handles Arabic diacritics and common letter variants (أ/إ/آ → ا, ى → ي, ة → ه)
 * so users do not have to type exact orthography.
 */
export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return "";

  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "") // Arabic diacritics
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}
