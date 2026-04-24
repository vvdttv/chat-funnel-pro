# Continuação do Sprint 2 — Manual da IA (DOCX + QA)

## Status atual

- ✅ Tradução de jargão na UI (10 componentes editados)
- ✅ Glossário salvo em `mem://index.md`
- ✅ `manual_ia_v1.pdf` já gerado em `/mnt/documents/` (47 KB)
- ⏳ **Falta**: DOCX espelho + QA visual de ambos + entrega via `<lov-artifact>`

## O que será feito nesta rodada

### 1. QA visual do PDF existente

Converter `manual_ia_v1.pdf` para imagens (`pdftoppm -jpeg -r 150`) e inspecionar **todas as páginas** com o tool de leitura de imagem. Buscar:

- Texto cortado nas margens ou estourando boxes
- Sobreposição de elementos
- Páginas em branco ou ordem incorreta
- Sumário com numeração quebrada
- Callouts (Dica/Atenção) com contraste ruim
- Tabelas mal alinhadas

Se houver problemas → corrigir o gerador Python (ReportLab) e regerar até ficar limpo. Imagens de QA ficam em `/tmp/`, não em `/mnt/documents/`.

### 2. Gerar DOCX espelho

Script Node usando `docx-js` (já presente no `bun.lock`), salvo em `/tmp/gen_manual_ia_docx.js`. Gera `/mnt/documents/manual_ia_v1.docx` com:

- **Página**: A4 (11906 × 16838 DXA), margens 1440 (1")
- **Estilos**: Arial 11pt padrão; H1 16pt bold; H2 13pt bold; H3 11pt bold
- **Capa**: título "Manual da IA do CRM", subtítulo "Como configurar a IA nos mínimos detalhes", data, versão v1
- **Sumário**: `TableOfContents` com `headingStyleRange: "1-3"` e `hyperlink: true`
- **Listas**: `LevelFormat.BULLET` e `LevelFormat.DECIMAL` com numbering config (nunca `•` unicode)
- **Tabelas**: `WidthType.DXA`, `columnWidths` somando à largura, `ShadingType.CLEAR`, bordas cinza `#CCCCCC`
- **Callouts**: tabelas de 1 célula com fundo `#F0F0F0` (Dica) e `#FFF8DC` (Atenção)
- **Page breaks**: `new PageBreak()` dentro de Paragraph entre capítulos

### 3. Conteúdo dos 14 capítulos

Espelha exatamente o PDF:

1. Visão geral da IA (5 camadas)
2. Comportamentos do lead (LBs)
3. Regras (do/don't/noask)
4. Habilidades (skills) — capítulo mais longo, com canvas e tipos de bloco
5. Roteiro da etapa — 4 colunas + ambiente de teste
6. Roteiro detalhado (Stage Playbook)
7. Ajustes personalizados (overrides) + versões salvas
8. Sugestões automáticas da IA
9. Pontos de contato com IA executora
10. Indicadores com IA
11. Saúde do sistema de IA
12. Carga inicial (seed) de comportamentos
13. Glossário (tabela inglês → português)
14. Receitas práticas (5 fluxos passo a passo)

Cada capítulo segue o template: **O que é · Onde fica na tela · Passo a passo · Dica · Erros comuns**.

### 4. QA visual do DOCX

Converter para PDF via LibreOffice headless, depois para imagens, inspecionar todas. Corrigir se necessário.

### 5. Entrega final

Emitir dois `<lov-artifact>`:

```
<lov-artifact path="manual_ia_v1.pdf" mime_type="application/pdf"></lov-artifact>
<lov-artifact path="manual_ia_v1.docx" mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"></lov-artifact>
```

Mais mensagem curta confirmando o que foi entregue e como navegar pelo sumário clicável.

## Fora do escopo desta rodada

- Renomear variáveis/tipos no código TS (mantém `PlaybookOverride`, etc.)
- Traduzir comentários internos `/** */`
- Traduzir mensagens de erro técnicas do console
- Mudanças em RLS, schema do banco ou edge functions

## Aprovação

Posso seguir com QA do PDF, geração do DOCX e entrega?
