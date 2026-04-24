# Sprint 2 — Tradução de jargão e Manual da IA

## Objetivos

1. **Substituir termos em inglês** que aparecem na interface por equivalentes simples em português do Brasil, sem quebrar lógica nem tipos do código.
2. **Gerar um manual totalmente detalhado** sobre como configurar a IA dentro de **Configurações → Fluxos IA**, cobrindo Comportamentos, Regras, Skills (canvas + blocos), Playbooks por etapa (4 colunas + detalhado), Sugestões da IA, Snapshots e Saúde do sistema. Saída em **PDF + DOCX**.

---

## Parte 1 — Tradução de jargão

### Glossário (rótulos visíveis ao usuário)


| Inglês usado hoje        | Substituir por                                                 |
| ------------------------ | -------------------------------------------------------------- |
| Override / overrides     | **Ajuste personalizado** (ou “personalização”)                 |
| Guardrail / guardrails   | **Regra de proteção**                                          |
| Hint / detection hints   | **Dica de detecção**                                           |
| Fallback                 | **Resposta de reserva**                                        |
| Trigger                  | **Gatilho**                                                    |
| Threshold                | **Limite mínimo**                                              |
| Prompt                   | **Prompt (Instruções para a IA)**                              |
| Skill / skills           | **Skill / skills (Habilidades da IA)**                         |
| Workflow                 | **Fluxo de mensagens**                                         |
| Behavior / behaviors     | **Comportamento** (já em pt)                                   |
| Playbook                 | **Roteiro da etapa**                                           |
| Overlay                  | **Camada de status**                                           |
| Archetype                | **Arquétipo de etapa** (mantém — termo amplamente usado em PT) |
| Snapshot                 | **Versão salva**                                               |
| Rollback                 | **Reverter versão**                                            |
| Sandbox                  | **Ambiente de teste**                                          |
| Provenance               | **Origem da resposta**                                         |
| Payload                  | **Conteúdo do ajuste**                                         |
| Scope (org/funnel/stage) | **Abrangência** (Organização / Funil / Etapa)                  |
| Seed (banner)            | **Carga inicial**                                              |
| Inspector                | **Painel de detalhes**                                         |
| Preview                  | **Pré-visualização**                                           |
| Context tag / tag tóxica | **Marcador de contexto** / **Marcador problemático**           |
| Goal                     | **Objetivo**                                                   |
| Persona                  | manter (palavra usada em PT)                                   |
| Tone / tom               | **Tom de voz**                                                 |


### Arquivos a editar (apenas strings de UI; nada de tipos, chaves de tabela ou constantes lógicas)

Foco em rótulos JSX, `placeholder=`, `title=`, `aria-label=`, opções de `<select>` e textos de seções:

- `src/components/AIWorkflowBuilder.tsx` — “Guardrails reforçados” → “Regras de proteção reforçadas”; “— sem fallback —” → “— sem resposta de reserva —”.
- `src/components/PlaybookOverridesGlobalList.tsx` — título “Overrides composicionais ativos” → “Ajustes personalizados ativos”; tooltip “Desativar override” → “Desativar ajuste”; “payload vazio” → “sem conteúdo”; chip “goal” → “objetivo”.
- `src/components/PlaybookOverrideSnapshotsBrowser.tsx` — “snapshot capturado em estado INATIVO” → “versão salva em estado INATIVO”; chips `goal/persona/tom` → `objetivo/persona/tom`.
- `src/components/PlaybookOverrideSuggestionsPanel.tsx` — “Tag tóxica” → “Marcador problemático”; “(sugestões do mesmo escopo serão fundidas em um único override)” → “(sugestões da mesma abrangência serão unidas em um único ajuste)”.
- `src/components/PlaybookOverrideMultiScopeEditor.tsx` — qualquer ocorrência de “override / scope / payload” em texto visível.
- `src/components/PlaybookFourColumnEditor.tsx` — ocorrências de “sandbox”, “preview” em cabeçalhos visíveis (manter campo `archetype` mas exibir como “Arquétipo”).
- `src/components/StagePlaybookEditor.tsx` — “(personalizada)” já está bom; substituir variáveis chamadas `advanceTriggers`/`archiveTriggers` apenas no rótulo visível para “Gatilhos para avançar” / “Gatilhos para arquivar”.
- `src/components/IADecisionLogsPanel.tsx` — “overlay:” → “camada:”; “Overlay de status” → “Camada de status”; “Context tag” → “Marcador de contexto”; “Decisões por playbook” → “Decisões por roteiro”.
- `src/components/IASkillsManager.tsx` — “Nova skill” → “Nova habilidade”; “Excluir esta skill?” → “Excluir esta habilidade?”; “Skills da org” → “Habilidades da organização”; tooltip “Exportar” mantém.
- `src/components/SkillNodeInspector.tsx` — “Código da skill a chamar” → “Código da habilidade a chamar”.
- `src/components/IABehaviorManager.tsx` — aba “Skills” → “Habilidades”; aba “Sugestões IA” mantém; “Saúde” mantém.
- `src/components/IABehaviorSeedBanner.tsx` — texto do banner já está em PT; só ajustar referência a “seed”.

**Regras importantes**:

- **Não alterar** identificadores TypeScript, nomes de tipos (`PlaybookOverride`, `OverrideSuggestion`), chaves de objeto, valores de enum, códigos como `LB_*`, `E0..E4b`, nem nomes de tabela/coluna do banco.
- Rótulos internos a comentários `/** … */` permanecem como estão (são docs de dev).
- Atualizar apenas o que o usuário lê na tela.

### Memória

- Adicionar uma linha em `mem://index.md` (Core): “Glossário: jargão em inglês na UI sempre traduzido (override → ajuste personalizado, guardrail → regra de proteção, etc.).”

---

## Parte 2 — Manual ultra-detalhado da IA (PDF + DOCX)

### Onde fica

Tudo em **Configurações → aba “Fluxos IA”**, mais o botão **“Configurar comportamento da IA”** que aparece dentro de cada Ponto de Contato com executor IA / Ambos (Configurações → Funis → Etapa → Ponto de Contato), e os botões **“Roteiro 4-col”** e **“Detalhado”** dentro de cada etapa do funil.

### Estrutura do manual (capítulos)

1. **Visão geral da IA do CRM**
  - Como as 5 camadas se combinam: Arquétipo da etapa → Camada de status (lead aberto/perdido/arquivado) → Ajustes personalizados (org → funil → etapa) → Comportamentos detectados → Habilidades disparadas.
  - Onde cada camada vive na tela.
2. **Comportamentos do lead (LBs)**
  - O que é um comportamento, formato `LB_*`, categoria, contexto, etapas típicas.
  - Como criar um comportamento: nome, código, categoria, dicas de detecção (texto livre que a IA usa para identificar o LB), etapas em que costuma aparecer.
  - Como filtrar (categoria, contexto, status).
  - Quando duplicar vs criar novo.
  - Exemplo passo a passo: criar `LB_PERGUNTOU_PARCELAMENTO`.
3. **Regras (do/don’t/noask)**
  - Os 3 tipos: o que **fazer**, o que **não fazer**, o que **não perguntar**.
  - Abrangência: universal vs por etapa (`E0..E4b`).
  - Como combinar regras com habilidades (regras viram “regras de proteção reforçadas” dentro do bloco da habilidade).
  - Exemplo: criar regra `noask` para não perguntar renda na etapa E1.
4. **Habilidades (skills)** — capítulo mais longo
  - O que é uma habilidade: um mini-fluxo da IA que dispara quando certos comportamentos são detectados.
  - **Criar habilidade**: nome, código, abrangência (universal / por funil / por etapa).
  - **Canvas**: como arrastar blocos, conectar e ler avisos.
  - **Tipos de bloco** (do `SkillCanvasEditor`):
    - Gatilho — comportamentos que disparam a habilidade.
    - Pergunta — coleta dado do lead.
    - Mensagem — envia texto.
    - Decisão — bifurca o caminho.
    - Chamar habilidade — encadeia outra skill (com explicação do campo “Código da habilidade a chamar”).
  - **Painel de detalhes (Inspector)**: campos de cada bloco, com explicação do que cada combobox faz.
  - Versionar, exportar JSON, duplicar, excluir.
  - Exemplo passo a passo completo: habilidade “Resgate de lead frio” com 4 blocos.
5. **Roteiro da etapa — 4 colunas**
  - As 4 colunas: Identidade (persona, tom de voz, objetivo) · Critérios de sucesso · Critérios de falha · Comportamentos esperados.
  - Como o Arquétipo preenche valores padrão e como o ajuste personalizado sobrescreve.
  - **Ambiente de teste (sandbox)**: o que ele simula, como salvar cenários, como comparar dois cenários.
  - Exemplo: ajustar o roteiro da E2 para um funil de imóveis de alto padrão.
6. **Roteiro detalhado** (Stage Playbook)
  - Gatilhos para avançar, gatilhos para arquivar, follow-up, handoff humano.
  - Quando usar o detalhado em vez do 4 colunas.
7. **Ajustes personalizados (overrides)**
  - 3 níveis de abrangência: organização, funil, etapa.
  - Editor por múltiplas abrangências: como editar Identidade/Sucesso/Falha/Comportamentos para vários funis ao mesmo tempo.
  - Lista global: como auditar e desativar.
  - Versões salvas (snapshots): como navegar histórico, ver diff e **reverter**.
8. **Sugestões automáticas da IA**
  - 3 tipos: Comportamento problemático por etapa, Etapa cronicamente perdida, Marcador problemático.
  - Como a IA calcula severidade (info / atenção / crítico) a partir do histórico de decisões.
  - Como aplicar uma sugestão sozinha vs em lote.
  - Pré-visualização do efeito antes de aplicar.
9. **Pontos de contato com IA executora**
  - Diferença entre executor Corretor / IA / Ambos.
  - Quando abrir “Configurar comportamento da IA”.
  - Construtor de blocos do fluxo de mensagem (enviar mensagem, esperar, digitando, gravando, condição, esperar resposta).
  - Comportamentos a que o bloco reage + regras de proteção reforçadas + resposta de reserva.
10. **Indicadores com IA (visão rápida)**
  - Como a aba Indicadores usa a IA para responder qualquer pergunta livre, com áudio ou texto.
    - O que ela vê: snapshot agregado (sem dados pessoais).
11. **Saúde do sistema de IA**
  - Painel de saúde: o que cada métrica significa (taxa de sucesso por arquétipo, tags problemáticas, top falhas).
    - Como interpretar e quando agir.
12. **Carga inicial (seed) de comportamentos**
  - O que o banner faz, quando rodar, quando ignorar.
13. **Glossário** (a tabela de tradução acima, em formato amigável).
14. **Receitas práticas** (3-5 fluxos completos do início ao fim):
  - “Subir um novo funil de captação e configurar a IA do zero.”
    - “Bloquear a IA de oferecer desconto.”
    - “Criar uma habilidade que dispara quando o lead pede parcelamento.”
    - “Investigar por que a etapa E3 está perdendo muitos leads.”
    - “Reverter um ajuste que piorou a conversão.”

### Geração técnica do manual

- **PDF**: Python + ReportLab Platypus em `/mnt/documents/manual_ia_v1.pdf`. Usar a estrutura já validada do `manual_crm_v2.pdf` como base (margens, tabela de conteúdo, estilos H1/H2/H3, callouts cinza para “Dica” e amarelo para “Atenção”).
- **DOCX**: `docx-js` em Node, salvo em `/mnt/documents/manual_ia_v1.docx`. Estilos: Arial 11pt, H1 14pt bold, H2 12pt bold, listas com `LevelFormat.BULLET`, tabelas com `WidthType.DXA` e `ShadingType.CLEAR`.
- **QA visual**: converter cada página para imagem (ReportLab → pdftoppm; DOCX → LibreOffice → PDF → pdftoppm), inspecionar todas, corrigir overflow/quebras, regerar até ficar limpo.
- Capa com título, subtítulo “Como configurar a IA do CRM nos mínimos detalhes”, data e versão `v1`.
- Sumário clicável.
- Cada capítulo tem: **O que é** · **Onde fica na tela** · **Passo a passo** · **Dica** · **Erros comuns**.

### Entrega final

- 2 arquivos artefato:
  ```
  <lov-artifact path="manual_ia_v1.pdf" mime_type="application/pdf"></lov-artifact>
  <lov-artifact path="manual_ia_v1.docx" mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"></lov-artifact>
  ```
- Mensagem curta resumindo o que foi traduzido e como ler o manual.

---

## Ordem de execução

1. Aplicar todas as substituições de string de UI (Parte 1).
2. Atualizar `mem://index.md` com a regra do glossário.
3. Escrever o gerador Python (PDF) com todo o conteúdo dos 14 capítulos.
4. Rodar e fazer QA visual página a página.
5. Escrever o gerador Node (DOCX) espelhando o conteúdo.
6. Rodar e fazer QA visual.
7. Emitir os dois `<lov-artifact>`.

Fora desta rodada (ficam para depois): mudar nomes de variáveis/tipos no código, traduzir comentários internos, traduzir mensagens de erro técnicas do console.