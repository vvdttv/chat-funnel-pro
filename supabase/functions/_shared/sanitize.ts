// Helpers de sanitização compartilhados pelas edge functions
// Mantém paridade com src/lib/sanitize.ts (frontend)

const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const WHITESPACE_RE = /\s+/g;
const USERNAME_INVALID_RE = /[^a-z0-9._-]/g;

export function stripHtmlAndNormalize(input: unknown): string {
  return String(input ?? '')
    .replace(HTML_TAG_RE, '')
    .replace(CONTROL_CHARS_RE, '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

export function sanitizeQuestion(input: unknown): string {
  return stripHtmlAndNormalize(input).slice(0, 200);
}

export function sanitizeAnswer(input: unknown): string {
  return stripHtmlAndNormalize(input).toLowerCase().slice(0, 200);
}

export function sanitizeUsername(input: unknown): string {
  return stripHtmlAndNormalize(input)
    .toLowerCase()
    .replace(USERNAME_INVALID_RE, '')
    .slice(0, 60);
}
