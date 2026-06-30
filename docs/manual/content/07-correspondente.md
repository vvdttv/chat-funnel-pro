# 07 — Correspondente bancário

> Capítulo pra **correspondente bancário** (papel `atendente` / `correspondente`) e **admin**.

O Painel do Correspondente é onde você analisa o crédito MCMV dos leads que a IA já qualificou. Acesso pela URL `/correspondente` ou pelo atalho **Painéis → Correspondente** no BottomNav.

`[📸 PRINT 07-00: Painel Correspondente aberto, 3 abas no topo | logado: correspondente]`

---

## Cabeçalho

- **Ícone Landmark** (banco) + **"Painel do Correspondente"**.
- Username (`@joao`) abaixo.
- Botão **Sair** (canto direito) — logout.

---

## 3 abas de status

Tabs em forma de pílulas no topo, cada uma com contador:

| Aba | Status interno | O que mostra |
|-----|----------------|--------------|
| **Recebidas** | `received` | Análises atribuídas a você, ainda não iniciadas (cronômetro não rodando) |
| **Em análise** | `in_analysis` | Análises que você iniciou — cronômetro rodando |
| **Devolvidas** | `returned` | Análises que você já devolveu (aprovado / condicional / reprovado) |

`[📸 PRINT 07-01: 3 abas com contadores | logado: correspondente]`

---

## Card de análise (na lista)

Cada análise na lista mostra:

- **Nome do lead**.
- **Telefone** (mascarado).
- **Cronômetro** (se em análise): tempo desde que você iniciou.
- **Badge SLA** — verde se dentro do prazo, amarelo se perto, vermelho se ultrapassou (24h por default).
- **Origem** — qual banco/correspondente atribuiu.

Clica no card → abre o **detalhe da análise**.

---

## Detalhe da análise

Drawer com:

### Cabeçalho

- Nome + telefone do lead.
- Status atual.
- Cronômetro grande (received → in_analysis → returned).
- Botão **Iniciar análise** (se `received`) — começa o cronômetro, muda status pra `in_analysis`.

### Documentos do lead

Lista de documentos anexados pela IA durante a conversa:
- Comprovante de renda (CTPS, contracheque).
- Documento pessoal (RG, CPF).
- Comprovante de residência.
- Outros que o lead anexou.

`[📸 PRINT 07-02: detalhe da análise com documentos listados | logado: correspondente]`

### Comentário por documento

Cada documento tem uma caixinha de comentário inline:
- Placeholder: *"Comentar este documento..."*
- Clica em **Salvar** → comentário fica visível pro lead na próxima mensagem (se a IA decidir compartilhar) e pro admin.

### Comentário geral

Caixa abaixo dos documentos:
- Placeholder: *"Observação sobre o conjunto..."*
- Botão **Salvar comentário**.

### Extração automática (IA)

Botão **"Extrair dados dos documentos"** — usa IA pra ler PDFs/imagens e extrair:
- Nome completo.
- CPF.
- Renda comprovada.
- FGTS (se aplicável).
- Dependentes.

Você revisa o que a IA extraiu antes de prosseguir.

---

## Devolutiva

Quando você termina a análise, preenche o formulário de devolutiva:

`[📸 PRINT 07-03: formulário de devolutiva, todos os campos | logado: correspondente]`

### Resultado (obrigatório)

3 opções:
- **Aprovado** (verde) — crédito aprovado sem condições.
- **Aprovado com condições** (amarelo) — aprovado, mas precisa que o lead apresente algo extra.
- **Reprovado** (vermelho) — crédito negado.

### Campos comuns

**Se aprovado / aprovado condicional**:
- **Valor aprovado** (R$) — placeholder: *"valor aprovado (R$)"*.
- **Exige entrada?** (checkbox).
- **Condições** (textarea, só se condicional) — placeholder: *"Descreva os condicionamentos..."*.
- **Prazo retomada** (dias) — placeholder: *"prazo retomada"*.

**Se reprovado**:
- **Motivo** (textarea) — placeholder: *"Motivo da reprovação..."*.

**Sempre**:
- **Observações** (opcional) — placeholder: *"Observações (opcional)..."*.

### Campos customizados (Devolutiva fields)

Abaixo dos campos comuns, aparecem os **campos customizados** que o admin configurou em **Config → Campos Devolutiva** (capítulo 02, seção 7). Exemplo:
- **Banco** (select dos bancos cadastrados).
- **Taxa de juros** (%).
- **Modalidade**.

Os campos customizados são montados dinamicamente.

### Botão Enviar

Clica em **Enviar devolutiva**:
- Sistema grava o resultado em `credit_analyses`.
- Se **aprovado / condicional**: deal vai pra etapa `ia-aprovado-aguardando` automaticamente. IA toma conta dali.
- Se **reprovado**: deal vira `status='lost'` com `lost_substage='credito_reprovado'`. Vai pra nutrição (`nut-credito-reprovado`).
- Análise migra pra aba **Devolvidas**.

---

## Histórico

A aba **Devolvidas** mostra todas as análises que você fechou. Clica → abre detalhe (read-only) com:
- Resultado final.
- Quando devolveu.
- Tempo total que ficou em análise.

Útil pra revisão e auditoria.

---

## SLA

O sistema gera SLA automaticamente:
- **Default**: 24h pra você devolver uma análise depois de iniciar.
- Cron `credit-analysis-sla` roda a cada 15 min, marca análises que passaram do prazo.
- Você recebe notificação push (Pushover) quando o SLA está prestes a estourar.
- Admin vê na tela de Indicadores quem está atrasado.

---

## Próximo

- **08 — Corretor** (BrokerPanel)
- **09 — Garantia** (administrativo + atendente seguradora)
- **10 — Vistoria** (administrativo + vistoriador)
- **11 — Contrato** (administrativo)
