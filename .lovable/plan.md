

# Plano de melhorias — CRM imobiliário (Sprint 1)

Vou implementar as 5 melhorias funcionais + a correção do PDF do manual. Cada melhoria tem entrega isolada e testável.

---

## Melhoria 1 — Tipos de atividade customizáveis

**Onde:** novo `useActivityTypes` (Lovable Cloud) + novo bloco em `ConfigPage` (sub-aba "Atividades").

**Modelo de dados (nova tabela `activity_types`):**
- `id`, `organization_id`, `code` (slug), `label`, `icon` (nome lucide), `color`, `default_duration_min`, `is_system` (bool, bloqueia delete), `position`, `is_active`.
- Seed: `call`, `proposal`, `visit`, `followup` (system=true, não-deletáveis mas editáveis em label/cor/ícone).
- RLS: select para membros da org; insert/update/delete só admin.

**UI nova sub-aba "Atividades" em Config:**
- Lista cards com ícone + label + cor + ações (editar / excluir / toggle ativo).
- Botão "Novo tipo" abre `Sheet` com: nome, ícone (picker dos lucide-icons usados no app), cor (paleta), duração padrão.
- Reordenação por drag (igual etapas).

**Refatoração:** `ACTIVITY_TYPES` (constante em `mockData.ts`) vira hook `useActivityTypes()`. Atualizo `AtividadesPage`, `FunisPage` (NextStepSheet) e `ChatThread` para consumir do hook em vez do `Record` estático.

---

## Melhoria 2 — Registro de atividades estilo Enermac (com bloqueio)

**Padrão a replicar (vindo do projeto Enermac):**

Para cada deal existem 3 estados de "próximo passo" e o sistema bloqueia o avanço quando faltam dados:

```text
┌─ Atividade agendada (futura)         ─┐
│  • Tipo, data/hora, descrição          │
│  • Botão "Resolver agora" / "Adiar"    │
└────────────────────────────────────────┘
┌─ Resultado da última atividade        ─┐
│  • Resumo (texto)                       │
│  • Mudança opcional de etapa/status     │
│  • Motivo se status=perdido/arquivado   │
│  • Checkbox "Arquivar oportunidade"     │
└────────────────────────────────────────┘
┌─ Próxima atividade                    ─┐
│  • Tipo, data/hora, descrição           │
│  • OU "Marcar sem próxima ação"         │
└────────────────────────────────────────┘
```

**Regras de bloqueio (overlay no card do deal, modo "forçar resolução"):**
- `arquivado` → nunca bloqueia.
- `ganho`/`perdido` SEM atividade futura → nunca bloqueia.
- `ganho`/`perdido` COM atividade futura → bloqueia normalmente.
- Status aberto + (sem atividade agendada **OU** atividade vencida sem resultado registrado **OU** sem próxima atividade) → bloqueia até o usuário registrar via NextStepSheet.

**Implementação:**
- Nova tabela `deal_activities`: `id`, `deal_id`, `org_id`, `type_code`, `scheduled_at`, `done_at`, `outcome_summary`, `created_by`. Trigger atualiza `deals.next_action`, `deals.next_action_date`, `deals.last_activity_at`.
- Reescrita do `NextStepSheet` (em `FunisPage`) em 3 blocos colapsáveis (acima), com checkbox de mudança de etapa/status (mesmo visual dos checkboxes que já existem no app — `Checkbox` do shadcn).
- Novo `lib/activityBlocking.ts` com `inferForcedStep(deal)` que calcula qual bloco precisa ser preenchido.
- Componente `DealActivityOverlay` exibido sobre o card no `FunisPage` quando `inferForcedStep` retorna não-null.
- Edge function `resolve-deal-activity` que aceita `{ action: 'concluir'|'agendar'|'arquivar', funnel_stage?, lead_status?, loss_reason?, archive? }` e grava no histórico.

---

## Melhoria 3 — Bloco "O que você gostaria de saber?" em Indicadores

**Localização:** topo da `IndicadoresPage`, antes do card de Previsão de Receita.

**UI:**
```text
┌─ ✨ O que você gostaria de saber? ────────┐
│  [textarea grande]                          │
│  [🎤 gravar áudio]   [🔄 resetar]   [Enviar]│
└─────────────────────────────────────────────┘

(após resposta:)
┌─ Resultado da análise ──────────────────────┐
│  [gráfico escolhido pela IA: bar/line/pie]  │
│  ───────                                     │
│  Resumo: texto explicativo curto             │
│  ───────                                     │
│  [textarea: "refine esta análise..."]        │
│  [🎤]  [🔄 nova análise]   [Refinar]        │
└─────────────────────────────────────────────┘
```

**Implementação:**
- Novo componente `IndicatorAIPanel` com estado: `prompt`, `chartSpec`, `summary`, `conversationHistory`.
- Edge function `analyze-indicators`:
  - Recebe pergunta + histórico + snapshot agregado dos KPIs/funis/deals/loss reasons da org.
  - Chama Lovable AI (`google/gemini-3-flash-preview`) com **tool calling** que retorna JSON estruturado: `{ chart_type: 'bar'|'line'|'pie'|'area'|'kpi', data: [...], x_key, y_key, title, summary }`.
  - Renderização dinâmica via `recharts` (já usado no projeto).
- Áudio: `MediaRecorder` no client → upload → `transcribe-audio` (Lovable AI Gemini) → texto preenche o input.
- Botão "Resetar" zera estado e histórico.

---

## Melhoria 4 — Pontos de contato customizados por etapa (já parcial)

**Status atual:** o `StageEditor` em `ConfigPage` já permite **adicionar/editar/excluir** touchpoints via `addTouchpoint` (linha 299) + `TouchpointCard`. O que falta é só visibilidade — o botão "+ Adicionar ponto de contato" hoje fica dentro do acordeão da etapa quando expandida.

**Pequeno ajuste:** garantir que o botão "+ Novo ponto de contato" apareça com label claro e CTA visualmente destacado dentro de cada etapa (atualmente é texto pequeno). Sem mudança estrutural.

> Se você confirmar no manual que isso já está documentado, esta melhoria fica como ajuste cosmético apenas.

---

## Melhoria 5 — Ampliação de tipos de campo (Pipedrive + GoHighLevel)

**Tipos atuais (16):** text, textarea, number, monetary, phone, email, date, datetime, dropdown, multiselect, checkbox, radio, url, file, signature, toggle.

**Tipos a adicionar (sem duplicar, mesclando Pipedrive + GoHighLevel):**

| Tipo novo | Fonte | Descrição |
|---|---|---|
| `time` | GHL | Hora isolada |
| `date_range` | Pipedrive | Intervalo de datas |
| `address` | Pipedrive/GHL | Endereço estruturado (rua/cidade/CEP) |
| `user` | Pipedrive | Referência a usuário da org |
| `org` | Pipedrive | Referência a organização |
| `person` | Pipedrive | Referência a contato |
| `rating` | GHL | Estrela 1–5 |
| `currency_multi` | Pipedrive | Valor + seletor de moeda |
| `percentage` | GHL | Número 0–100 com sufixo % |
| `large_text` | GHL | Texto longo com toolbar (rich text) |
| `image` | GHL | Upload restrito a imagens |
| `video` | GHL | Upload restrito a vídeo / link |
| `audio` | GHL | Upload restrito a áudio |
| `country` | GHL | Dropdown ISO de países |
| `state` | GHL | Estado/UF (depende de country) |
| `timezone` | GHL | Lista de timezones IANA |
| `hidden` | GHL | Campo oculto (preenchido por automação) |
| `formula` | Pipedrive | Calculado a partir de outros campos |
| `lookup` | Pipedrive | Auto-complete contra outra tabela |
| `tags` | Pipedrive | Lista de tags livres |

**Implementação:**
- Atualizar `FieldType` em `mockData.ts` + `FIELD_TYPE_LABELS` + `FIELD_TYPE_ICONS`.
- Agrupar tipos em categorias no `<Select>` do `FieldForm`: **Texto**, **Numérico**, **Data/Hora**, **Seleção**, **Mídia**, **Localização**, **Referência**, **Avançado**.
- Cada tipo novo recebe configuração específica (`address`: subcampos; `formula`: editor de expressão; `lookup`: tabela alvo + chave).

---

## Melhoria final — Corrigir manual PDF (quebra de linha + margens)

**Problema atual:** o PDF foi gerado usando `canvas.drawString()` (texto sem wrap), por isso o lado direito vaza e tabelas/colunas não respeitam largura.

**Correção:**
- Reescrever `build_pdf.py` usando **ReportLab Platypus** (`SimpleDocTemplate` + `Paragraph` + `Table` + `Spacer`) em vez de canvas.
- `Paragraph` faz wrap automático respeitando o `frame` (margem 1in em todos os lados, A4 ou Letter).
- Tabelas usam `Table` com `colWidths` proporcionais à largura útil (`A4_width - 2*inch`).
- Imagens (wireframes) inseridas via `Image(path, width=usable_width)` com aspect-ratio preservado.
- QA obrigatório: converter cada página para JPG (`pdftoppm -jpeg -r 150`) e inspecionar visualmente antes de entregar.
- Atualizar conteúdo do manual para refletir Melhorias 1, 2, 3 e 5.
- Salvar como `manual_crm_v2.pdf` em `/mnt/documents/`.

---

## Ordem de execução

1. **Backend** (migrations + edge functions): tabelas `activity_types`, `deal_activities`, RLS, triggers, edge functions `resolve-deal-activity` e `analyze-indicators`.
2. **Melhoria 5** (campos): refactor de tipos — base para qualquer formulário futuro.
3. **Melhoria 1** (tipos de atividade customizáveis): hook + sub-aba Config.
4. **Melhoria 2** (NextStepSheet 3-blocos + bloqueio): overlay + reescrita do sheet.
5. **Melhoria 3** (IA Indicadores): edge function + componente.
6. **Melhoria 4** (touchpoints): ajuste cosmético do botão.
7. **Manual PDF v2**: regerar com Platypus + QA visual.

## Detalhes técnicos

- **Stack:** mantém React 18 + Vite + Tailwind + shadcn + Supabase (Lovable Cloud) + Lovable AI Gateway.
- **IA:** `google/gemini-3-flash-preview` com tool calling para extrair `chart_spec` estruturado em Melhoria 3; Whisper-equivalent (Gemini multimodal) para transcrição de áudio.
- **RLS:** todas as novas tabelas seguem o padrão da org (membros leem; admins escrevem) — exceto `deal_activities` onde corretor pode escrever nos próprios deals.
- **Testes:** vitest para `inferForcedStep`, `activityBlocking` e o composer de chartSpec.
- **Memória:** atualizar `mem://index.md` com regras de bloqueio + tipos de campo expandidos.

