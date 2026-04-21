// Helpers de sanitização compartilhados pelo frontend
// Mantém paridade com supabase/functions/_shared/sanitize.ts (backend)

const HTML_TAG_RE = /<[^>]*>/g;
// Caracteres de controle (exceto \n e \t que removemos via colapso de whitespace)
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const WHITESPACE_RE = /\s+/g;
const USERNAME_INVALID_RE = /[^a-z0-9._-]/g;

/** Remove tags HTML, caracteres de controle e colapsa espaços. */
export function stripHtmlAndNormalize(input: string): string {
  return String(input ?? '')
    .replace(HTML_TAG_RE, '')
    .replace(CONTROL_CHARS_RE, '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

/** Pergunta de segurança: texto limpo, espaço único entre palavras. */
export function sanitizeQuestion(input: string): string {
  return stripHtmlAndNormalize(input).slice(0, 200);
}

/** Resposta: limpa + lowercase (comparação case-insensitive). */
export function sanitizeAnswer(input: string): string {
  return stripHtmlAndNormalize(input).toLowerCase().slice(0, 200);
}

/** Username: lowercase + apenas [a-z0-9._-]. */
export function sanitizeUsername(input: string): string {
  return stripHtmlAndNormalize(input)
    .toLowerCase()
    .replace(USERNAME_INVALID_RE, '')
    .slice(0, 60);
}
