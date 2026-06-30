# 09 — Garantia locatícia

> Capítulo pra **administrativo** da imobiliária (e admin), além do **atendente de seguradora** quando a garantia é seguro-fiança ou título de capitalização.

A garantia locatícia é o equivalente, na locação, do que o correspondente bancário é na venda MCMV. O **GarantiaPanel** é onde tudo é operado.

Acesso pela URL `/garantia` ou pelo atalho **Painéis → Garantia (locação)** no BottomNav.

`[📸 PRINT 09-00: Painel Garantia aberto, 3 abas no topo | logado: admin/administrativo]`

---

## Cabeçalho

- **Ícone ShieldCheck** + **"Painel de Garantia Locatícia"**.
- Username abaixo.
- Botão **Sair** (canto direito).

---

## 3 abas de status

| Aba | Status | O que mostra |
|-----|--------|--------------|
| **Recebidas** | `received` | Análises de garantia criadas, ainda não iniciadas |
| **Em análise** | `in_analysis` | Análises com cronômetro rodando |
| **Devolvidas** | `returned` | Análises já fechadas (aprovado / condicional / reprovado) |

---

## Os 4 tipos de garantia

| Tipo | O que é | Tem seguradora? |
|------|---------|------------------|
| **Fiador** | Pessoa física que cobre a dívida em caso de inadimplência | Não |
| **Caução** | Depósito antecipado (3-6 meses de aluguel) | Não |
| **Seguro-fiança** | Apólice de seguro | **Sim** (com roleta) |
| **Título de capitalização** | Título emitido por seguradora ou banco | **Sim** (com roleta) |

Os 2 primeiros são operados 100% pelo administrativo. Os 2 últimos passam pela seguradora (com roleta dupla — seguradora + atendente).

---

## Card de análise

Cada análise na lista mostra:

- **Nome do lead** + dados básicos.
- **Tipo de garantia** (badge).
- **Cronômetro** (se em análise).
- **Resultado** (se devolvida): aprovado / condicional / reprovado.
- **Seguradora atribuída** (se seguro-fiança / título).

`[📸 PRINT 09-01: card de análise listada | logado: admin]`

---

## Detalhe da análise

### Cabeçalho

- Nome + telefone do lead.
- Tipo de garantia atual (ou "Não definido" se ainda não escolhido).
- Status + cronômetro.

### Card "Definir tipo de garantia" (J-2b)

Se o tipo ainda não foi escolhido, aparece este card:

`[📸 PRINT 09-02: card Definir tipo de garantia, 4 botões | logado: admin]`

4 botões em grid (1 por tipo):
- **Fiador**
- **Caução**
- **Seguro-fiança (emitido por seguradora)**
- **Título de capitalização (emitido por seguradora/banco)**

Você clica → o sistema:
1. Grava o tipo em `guarantee_analyses.guarantee_type`.
2. **Se for seguro-fiança ou título**: dispara a **roleta dupla** — sorteia seguradora + atendente, atribui.
3. **Se for fiador ou caução**: nenhuma seguradora — análise fica direto no admin/administrativo.

### Card "Override de seguradora" (J-2b-7c)

**Aparece apenas quando** o tipo é seguro-fiança ou título E o status é `in_analysis`.

`[📸 PRINT 09-03: card Override seguradora, 2 selects | logado: admin]`

Mostra:
- Seguradora atual (label).
- Atendente atual (label).
- Botão **Editar**.

Clica em **Editar**:
- 2 dropdowns aparecem:
  - **Seguradora** (lista das seguradoras cadastradas).
  - **Atendente** (lista filtrada pelos atendentes da seguradora escolhida).
- Botão **Salvar override** ou **Cancelar**.

Útil quando você quer redirecionar pra uma seguradora específica (ex: o lead já é cliente daquela seguradora, ou quer testar uma nova parceira).

### Documentos

Lista de documentos anexados ao lead (RG, comprovante de renda, comprovante de residência, contrato pretendido, etc).

Cada documento tem caixa de comentário inline:
- Placeholder: *"Comentar este documento..."*

### Comentário geral

- Placeholder: *"Observação sobre o conjunto..."*

### Botão Iniciar análise

Se status `received`: clica → começa o cronômetro, muda pra `in_analysis`.

---

## Devolutiva

Formulário ao final do detalhe:

### Resultado

- **Aprovado** (verde).
- **Aprovado com condições** (amarelo).
- **Reprovado** (vermelho).

### Campos

**Se aprovado / condicional**:
- **Condições** (se condicional) — placeholder: *"Descreva os condicionamentos..."*
- **Prazo de retomada** (dias) — placeholder: *"prazo retomada"*

**Se reprovado**:
- **Motivo** — placeholder: *"Motivo da reprovação..."*

**Sempre**:
- **Observações** (opcional) — placeholder: *"Observações (opcional)..."*

### Campos customizados

Se o admin configurou campos extras pra garantia (similar aos "Campos Devolutiva" do correspondente), eles aparecem aqui.

### Botão Enviar

Clica → grava o resultado.

- **Aprovado / condicional**: deal segue pra etapa `loc-aprovado-aguardando` (bypass dos campos obrigatórios da etapa de origem).
- **Reprovado**: deal vira `lost`, vai pra nutrição.

---

## Atendente de seguradora

Quem é cadastrado como **atendente** de seguradora vê o painel **filtrado pelas análises atribuídas a ele**. Não vê análises de outras seguradoras.

A interface é a mesma, mas o universo é restrito.

---

## SLA da garantia

Cron `guarantee-analysis-sla` roda a cada 15 min. Marca análises que passaram do prazo (default: 24h após início).

Você recebe notificação push quando SLA está prestes a estourar.

---

## Próximo

- **10 — Vistoria** (administrativo + vistoriador)
- **11 — Contrato** (administrativo)
