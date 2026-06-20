import { describe, it, expect } from "vitest";
import { toCsv, type CsvColumn } from "@/lib/export-csv";

interface Row {
  metric: string;
  value: number | string;
}

const cols: CsvColumn<Row>[] = [
  { key: "metric", header: "Métrica" },
  { key: "value", header: "Valor" },
];

describe("export-csv toCsv", () => {
  it("monta header + linhas com separador ';'", () => {
    const rows: Row[] = [
      { metric: "Total", value: 5 },
      { metric: "Ganhos", value: 2 },
    ];
    const csv = toCsv(rows, cols);
    expect(csv).toBe("Métrica;Valor\r\nTotal;5\r\nGanhos;2");
  });

  it("escapa valores com separador, aspas e quebras de linha", () => {
    const rows: Row[] = [
      { metric: 'Crédito; "negado"', value: "linha1\nlinha2" },
    ];
    const csv = toCsv(rows, cols);
    // valor com ; e aspas -> envolto em aspas, aspas internas duplicadas
    expect(csv).toContain('"Crédito; ""negado"""');
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it("trata null/undefined como célula vazia", () => {
    const rows = [{ metric: "x", value: null as unknown as string }];
    const csv = toCsv(rows, cols);
    expect(csv).toBe("Métrica;Valor\r\nx;");
  });

  it("aplica format() quando fornecido", () => {
    const rows: Row[] = [{ metric: "Receita", value: 1000 }];
    const csv = toCsv(rows, [
      { key: "metric", header: "M" },
      { key: "value", header: "V", format: (r) => `R$ ${r.value}` },
    ]);
    expect(csv).toBe("M;V\r\nReceita;R$ 1000");
  });

  it("gera apenas header quando não há linhas", () => {
    expect(toCsv([], cols)).toBe("Métrica;Valor");
  });
});
