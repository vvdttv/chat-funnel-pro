/**
 * Utilitário de exportação CSV (client-side, sem dependências externas).
 * Gera um arquivo CSV a partir de linhas de objeto e dispara o download.
 */

type CsvValue = string | number | boolean | null | undefined;

/** Escapa um valor para CSV (RFC 4180): aspas duplas + escape de aspas internas. */
function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvColumn<T> {
  key: keyof T | string;
  header: string;
  /** transformação opcional do valor antes de escapar */
  format?: (row: T) => CsvValue;
}

/**
 * Converte um array de objetos em string CSV.
 * Usa ';' como separador (padrão BR, abre direto no Excel pt-BR).
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
  separator = ';',
): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(separator);
  const dataLines = rows.map((row) =>
    columns
      .map((c) => {
        const raw = c.format ? c.format(row) : (row[c.key as keyof T] as CsvValue);
        return escapeCell(raw);
      })
      .join(separator),
  );
  return [headerLine, ...dataLines].join('\r\n');
}

/** Dispara o download de um conteúdo CSV no navegador. BOM garante acentos no Excel. */
export function downloadCsv(filename: string, csvContent: string): void {
  const BOM = '﻿';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Atalho: monta o CSV e dispara o download em uma chamada. */
export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  downloadCsv(filename, toCsv(rows, columns));
}
