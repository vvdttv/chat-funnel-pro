// _shared/pdf.ts
// Conversão PDF -> PNG (base64) para envio a modelos de visão.
//
// Motivo: o kiro-gateway lê IMAGEM (image_url) mas NÃO lê PDF (testado: ignora
// document/file/input_file). Para a IA extrair dados de uma devolutiva bancária
// que veio em PDF, renderizamos as páginas como PNG e mandamos como imagem.
//
// Implementação: mupdf-wasm (puro WebAssembly, sem binário nativo) — única opção
// que roda no edge runtime self-hosted (Deno) sem dependências de canvas/DOM.
//
// Fallback gracioso: qualquer falha (import, render, PDF corrompido) retorna []
// — o chamador trata como "não foi possível extrair" e o correspondente preenche
// os campos na mão. O match NUNCA depende desta conversão.

/**
 * Renderiza as primeiras `maxPages` páginas de um PDF em PNG base64 (sem o
 * prefixo data:). Retorna [] em qualquer falha (fallback gracioso).
 */
export async function pdfToPngBase64(
  bytes: Uint8Array,
  opts: { maxPages?: number; dpi?: number } = {},
): Promise<string[]> {
  const maxPages = opts.maxPages ?? 3
  const dpi = opts.dpi ?? 150
  let doc: { countPages(): number; loadPage(i: number): unknown; destroy(): void } | null = null
  try {
    // Import dinâmico: se o runtime não resolver `npm:mupdf`, cai no catch.
    const mupdf = await import('npm:mupdf@1.3.0')
    doc = mupdf.Document.openDocument(bytes, 'application/pdf') as typeof doc
    const total = doc!.countPages()
    const pages = Math.min(total, maxPages)
    const scale = dpi / 72
    const matrix = mupdf.Matrix.scale(scale, scale)
    const out: string[] = []
    for (let i = 0; i < pages; i++) {
      const page = doc!.loadPage(i) as {
        toPixmap(m: unknown, cs: unknown, alpha: boolean, sep: boolean): {
          asPNG(): Uint8Array; destroy(): void
        }
        destroy(): void
      }
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true)
      // asPNG pode retornar Uint8Array ou ArrayBuffer dependendo do build — normaliza.
      const png = pixmap.asPNG()
      out.push(uint8ToBase64(png instanceof Uint8Array ? png : new Uint8Array(png as ArrayBuffer)))
      pixmap.destroy()
      page.destroy()
    }
    return out
  } catch (err) {
    console.error('[pdf] conversão PDF->PNG falhou (fallback gracioso):', err)
    return []
  } finally {
    try { doc?.destroy() } catch { /* ignore */ }
  }
}

/** Codifica Uint8Array em base64 sem estourar a pilha em arquivos grandes. */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
