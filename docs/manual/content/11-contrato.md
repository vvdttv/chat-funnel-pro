# 11 — Contrato de locação

> Capítulo pra **administrativo** (e admin). O contrato é a peça final do ciclo de locação — só pode ser criado depois que a garantia foi aprovada.

Acesso pela URL `/contratos` ou pelo atalho **Painéis → Contratos** no BottomNav.

`[📸 PRINT 11-00: Painel Contratos aberto, filtros de status visíveis | logado: admin]`

---

## Acesso restrito

Só admin vê. Não-admin vê tela:

> **Acesso restrito** — O painel de contratos é do dpto administrativo.

---

## Cabeçalho

- **Ícone FileSignature** + **"Contratos de Locação"**.
- Nome do usuário logado.
- Botão **Sair**.

---

## Filtros de status

7 chips horizontais:

| Chip | Status interno |
|------|----------------|
| **Todos** | (sem filtro) |
| **Rascunho** | `rascunho` (criado, ainda editando) |
| **Enviado** | `enviado` (mandado pro locatário assinar) |
| **Assinado** | `assinado` (assinatura recebida) |
| **Ativo** | `ativo` (locatário entrou, contrato vigente) |
| **Encerrado** | `encerrado` (contrato terminou) |
| **Cancelado** | `cancelado` |

---

## Lista de contratos

Cada card:

- **Nome do locatário** (ou ID do deal se ainda não preenchido).
- **Status** (badge colorido).
- **Deal ID**.
- **Valor do aluguel** (R$).
- **Data de início**.

`[📸 PRINT 11-01: lista de contratos | logado: admin]`

Estado vazio: *"Nenhum contrato neste filtro. Contratos são criados na etapa 'corloc-contrato' do funil de corretor de locação."*

---

## Como um contrato nasce

**Pré-requisito**: existe `guarantee_analyses` aprovada (`result IN ('approved', 'approved_conditioned')`) pro deal.

**Fluxo de criação**:

### Opção 1: pelo card do deal (Kanban)

Quando o deal está em etapa com papel `contrato`, no DealDetailSheet aparece o botão **"Criar contrato"** (capítulo 03, seção "Botão Criar contrato").

1. Você clica.
2. Sistema chama `create_lease_contract` (RPC).
3. Cria contrato em status `rascunho`.
4. Navega pra `/contratos` já com o contrato aberto.

### Opção 2: criação manual

No próprio painel de Contratos, você pode criar manual (botão "Novo contrato" se disponível, ou pelo card do deal).

> Não tem trigger automático. **A criação é sempre manual** (decisão de design: contrato é responsabilidade do administrativo, não vira sozinho).

---

## Detalhe do contrato

Drawer com formulário grande, organizado em **4 seções de campos customizáveis** + **campos estruturados**.

### Cabeçalho

- Nome do locatário (campo do contrato).
- ID do deal.
- Status atual.
- Botões de mudança de status (lifecycle).

### Campos estruturados (sempre presentes)

| Campo | Tipo |
|-------|------|
| **Valor do aluguel** (R$) | número |
| **Condomínio** (R$) | número |
| **IPTU** (R$) | número |
| **Dia de vencimento** (dia do mês) | número |
| **Data de início** | date |
| **Data de fim** | date |
| **Duração em meses** | número |
| **Índice de reajuste** | IGPM / IPCA / INCC / outro |
| **Período de reajuste** (meses) | número |
| **Multa rescisória** (meses de aluguel) | número |
| **Caução** (meses) | número |
| **URL do documento** (link pro PDF/Word do contrato) | texto |

`[📸 PRINT 11-02: bloco de campos estruturados | logado: admin]`

Placeholder do URL: `https://...`

### Campos customizáveis (23 seedados, configuráveis em Config → Campos Contrato)

Divididos em **4 seções**:

#### 1. Dados do cliente (locatário)

Exemplos:
- Nome completo do locatário.
- CPF.
- RG.
- Data de nascimento.
- Estado civil.
- Profissão.
- Renda comprovada.
- Telefone, e-mail.

`[📸 PRINT 11-03: seção Dados do cliente | logado: admin]`

#### 2. Dados da imobiliária / locador

- Razão social da imobiliária.
- CNPJ.
- Endereço da imobiliária.
- Nome do locador (pessoa física dona do imóvel).
- CPF/CNPJ do locador.
- Dados bancários do locador (pra repasse).

#### 3. Endereço do imóvel

- Logradouro.
- Número, complemento.
- Bairro.
- Cidade, UF.
- CEP.

#### 4. Garantia

- **Tipo** (select_multi): fiador / caução / seguro-fiança / título de capitalização.
- Dados específicos da garantia (varia por tipo):
  - Fiador: nome, CPF, renda, comprovantes.
  - Caução: valor caucionado, conta.
  - Seguro-fiança: seguradora, número da apólice.
  - Título de capitalização: emissora, número do título.

> Quando você marca o tipo, o sistema **puxa automaticamente os dados da garantia aprovada** vinculada (do `guarantee_analyses.id`). Você revisa.

### Botão Salvar

Cada seção (estruturada + customizada) tem botão **Salvar** próprio. Salvar é granular — não obriga preencher tudo de uma vez.

---

## Lifecycle do contrato

Você passa por estes status na ordem:

```
rascunho → enviado → assinado → ativo → encerrado
                                       └→ cancelado (a qualquer momento)
```

Botões de transição aparecem no detalhe do contrato:

- **Rascunho → Enviado**: depois de preencher os dados básicos.
- **Enviado → Assinado**: quando recebe a assinatura.
- **Assinado → Ativo**: quando o locatário toma posse / paga primeira parcela.
- **Ativo → Encerrado**: ao terminar o prazo.
- **Cancelar** (em qualquer status anterior a Ativo).

Cada transição grava:
- `signed_at`, `activated_at`, `terminated_at` (timestamps).
- Evento no histórico do deal.

---

## Quando o contrato é encerrado

Depois de **encerrado** ou **ativo** (rescisão), aparece o botão:

**"Solicitar vistoria de saída"** → cria registro em `property_inspections` tipo `saida`, status `pendente`, com `lease_contract_id` ligado. Aparece no painel de Vistorias pra atribuir vistoriador.

---

## Travas

Quando o contrato está em status `encerrado` ou `cancelado`:
- **Campos travam** (read-only).
- Botões de transição somem.
- Você só consegue ler / exportar.

> Foi feito de propósito. Contrato encerrado é prova histórica.

---

## Próximo

- **12 — Fluxos fim-a-fim** (jornada MCMV + Locação completa)
- **13 — Glossário, FAQ e atalhos**
