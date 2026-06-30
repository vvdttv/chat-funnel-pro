# 05 — Indicadores e Relatórios

> Capítulo pra **admin**. A tela onde você toma decisão baseada em dado, não em palpite.

Acessada pelo ícone **Indicadores** (BarChart3) no BottomNav.

`[📸 PRINT 05-00: tela Indicadores aberta com seletor de período no topo | logado: admin]`

---

## Seletor de período (no topo)

4 opções:

| Label | Granularidade |
|-------|---------------|
| **7d** | Por dia |
| **30d** | Por dia (default) |
| **90d** | Por semana |
| **12m** | Por mês |

A mudança recalcula tudo na tela em tempo real.

---

## KPI cards (topo)

3 ou 4 cards mostrando os números-chave do período:

- **Receita Ganha** (R$) — soma de `value` dos deals `won` no período.
- **Conversão** (%) — `won / (won + lost)` no período.
- **Ciclo médio** (dias) — média de dias entre `created_at` e `won_date` dos deals fechados.
- **Total de leads** — quantos deals novos entraram.

`[📸 PRINT 05-01: KPIs no topo da tela | logado: admin]`

---

## Seções colapsáveis

Abaixo dos KPIs, várias seções que você expande/colapsa.

### 1. IA Ask (default aberta)

Caixa de texto onde você **pergunta em português pra IA analisar seus indicadores**.

`[📸 PRINT 05-02: seção IA Ask, placeholder visível | logado: admin]`

Placeholder: *"O que você gostaria de analisar?"*

Exemplos de perguntas:
- "Qual etapa do funil IA está perdendo mais leads?"
- "Quais corretores estão com pior taxa de conversão?"
- "O motivo de perda mais comum é qual?"
- "Tem alguma etapa parada há muito tempo?"

A IA responde com análise textual + insights acionáveis. Não substitui análise manual; complementa.

### 2. Evolução (timeseries)

Gráfico de linha com 3 séries:
- **Novos** (azul) — deals criados no dia/semana/mês.
- **Ganhos** (verde) — deals que viraram `won`.
- **Perdidos** (vermelho) — deals que viraram `lost`.

Eixo X: tempo (granularidade do período). Eixo Y: contagem.

`[📸 PRINT 05-03: gráfico de evolução | logado: admin]`

Botão **Exportar CSV** abaixo do gráfico.

### 3. Funil

Tabela com cada etapa do funil:

| Coluna | O que mostra |
|--------|--------------|
| **Etapa** | Nome da etapa |
| **Deals entraram** | Quantos passaram por aqui no período |
| **Deals atuais** | Quantos estão aqui agora |
| **Dias médios** | Tempo médio que ficam nessa etapa |
| **% conversão** | Quantos avançaram pra próxima |

`[📸 PRINT 05-04: tabela do funil | logado: admin]`

Linhas em vermelho destacam etapas com conversão ruim.

Botão **Exportar CSV**.

### 4. Motivos de perda

Gráfico de barras horizontal mostrando os motivos de perda mais comuns no período:

- **Banco recusou** (X deals)
- **Sem resposta** (Y deals)
- **Concorrente** (Z deals)
- **Sem interesse** (W deals)
- **Fora do perfil** (V deals)
- ...

`[📸 PRINT 05-05: gráfico de motivos de perda | logado: admin]`

Você consegue diagnosticar: *"50% dos meus leads perdidos foi por 'banco recusou' — preciso revisar critérios de pré-qualificação"*.

---

## Botões de exportação

Cada seção tem seu botão **Exportar CSV**. O CSV sai em:
- Encoding UTF-8 com BOM (abre certo no Excel BR).
- Separador `;` (padrão BR).
- Escape RFC 4180.

Nome do arquivo: `relatorio-<seção>-<período>.csv` (ex: `relatorio-funil-30d.csv`).

---

## Digest por e-mail

O sistema dispara **digest diário automático** às 08:00 BRT para todos os admins da org, com:

- KPIs do dia anterior.
- Top 3 motivos de perda.
- Deals parados há mais de N dias.
- Conversão da semana vs semana anterior.

A entrega usa o serviço de e-mail configurado (Resend por padrão, via `send-email-notification`).

Pra desligar, contate o operador técnico — não tem switch no front (decisão do roadmap).

---

## Próximo

- **06 — Atividades / Agenda**
