# 03 — Kanban / Funis (operação diária)

> Capítulo pra **admin** e **corretor**. É a tela que você abre todo dia.

A aba **Leads** do BottomNav te leva pro **FunisPage** — onde você vê os deals, conversa com leads, move cards entre etapas, registra atendimento e qualifica em tempo real.

`[📸 PRINT 03-00: FunisPage com kanban visível e seletor de funil no topo | logado: admin]`

---

## A estrutura da tela

### Topo

- **Seletor de funil** (dropdown) — escolhe qual funil ver. Admin vê todos; corretor vê só os que tem acesso.
- **Filtros** — busca por nome/telefone, filtro por status (open/won/lost), filtro por tag.

### Corpo (Kanban)

- Uma **coluna por etapa** do funil.
- Cada coluna mostra os deals dela como cards.
- Cards são **arrastáveis** entre etapas (drag-and-drop).
- O contador no topo da coluna mostra quantos deals.

### Tap em card → detalhe

Clicar num card abre o **DealDetailSheet** — drawer lateral com tudo do lead.

---

## O card do deal

Cada card mostra (configurável em **Config → Card**):

- Foto/iniciais do lead.
- Nome.
- Telefone (mascarado).
- Tags coloridas (Quente/Morno/Frio/Fervendo + objeções).
- Tempo na etapa (badge — vermelho se passou do limite).
- Valor estimado.
- Corretor/correspondente atribuído.
- Status (open/won/lost).
- Badge "obrigatório pendente" se faltar campo 1.4 crítico.

`[📸 PRINT 03-01: zoom num card típico | logado: admin]`

---

## Movendo deals

### Drag-and-drop

Pega o card com o mouse, arrasta pra outra coluna. Solta.

O sistema:
1. **Valida campos obrigatórios** da etapa de origem (se for avanço).
2. Se faltar campo, **bloqueia** e mostra toast vermelho: *"campos_obrigatorios_pendentes: preencha antes de avancar: <lista>"*.
3. Se passar, move o deal.
4. Registra evento em `deal_stage_events`.
5. Atualiza realtime pra todos que estão olhando.

### Setas (no DealDetailSheet)

Quando o card está aberto em detalhe, no topo aparecem:
- **← Etapa anterior** — move pra trás (não trava por campo obrigatório).
- **→ Próxima etapa** — move pra frente (trava se faltar campo).
- **Ganho** — marca o deal como `won`.

`[📸 PRINT 03-02: setas de navegação de etapa no topo do DealDetailSheet | logado: admin]`

### Marcar como perdido

Botão **Perdido** no rodapé do DealDetailSheet abre um modal:

- **Motivo da perda** (select obrigatório) — seleciona um dos motivos configurados (Banco recusou, Sem interesse, Concorrente, Fora do perfil, etc).
- **Observação** (opcional).
- Botão **Confirmar perda**.

`[📸 PRINT 03-03: modal Motivo da Perda | logado: admin]`

Ao confirmar:
1. O deal vira `status='lost'`.
2. Se o motivo for **recuperável** (Sem resposta, Sem interesse, Concorrente, Fora do perfil), o sistema **move automaticamente pra um funil de nutrição** (`fun-nutricao-mcmv`) na etapa correspondente ao motivo. O lead não vira lixo — vira lead em cadência de retomada.
3. Se o motivo for **definitivo** (Lavagem de dinheiro, Fraude, Bloqueado), encerra o deal sem nutrição.

---

## O DealDetailSheet por dentro

Drawer lateral que abre quando você clica num card. Várias seções:

### Cabeçalho

- Nome do lead.
- Telefone (clique pra copiar).
- Badge da etapa atual.
- Badge do status (open/won/lost).
- Setas de navegação de etapa.

### Conversa (WhatsApp embutido)

Histórico completo da conversa do WhatsApp com o lead, em tempo real. Você consegue:

- Ler tudo o que a IA falou.
- Ler tudo que o lead respondeu.
- Mandar mensagem direto pelo painel (mesmo número, mesma conversa do WhatsApp do lead).

`[📸 PRINT 03-04: conversa WhatsApp embutida no DealDetailSheet | logado: admin]`

**Placeholder da caixa de mensagem**: "Mensagem...".

### Modo IA (botão Bot no canto da caixa)

Clica no botão de bot pra **conversar com a IA do sistema** (não com o lead). Você pergunta:
- "O que esse lead já me contou?"
- "Qual a próxima ação certa?"
- "Por que essa etapa está parada?"

`[📸 PRINT 03-05: caixa de mensagem em modo IA, com placeholder Pergunte algo à IA | logado: admin]`

A caixa muda de cor (roxo) pra você saber que está conversando com a IA, não com o lead.

### Campos da etapa (StageFieldsPanel)

Lista dos campos obrigatórios e auxiliares da etapa atual. Você preenche:
- **Owner=ia**: read-only (só a IA preenche).
- **Owner=corretor / ambos**: editável.

Badge vermelha em campos obrigatórios pendentes.

### Registrar atendimento

Modal para registrar manualmente um contato (ligação, visita, e-mail):

- **Tipo** (select de tipos cadastrados em Config → Atividades).
- **Descrição**: "Descreva o que aconteceu neste atendimento...".
- **Próxima ação**: "Descreva brevemente a próxima ação...".

`[📸 PRINT 03-06: modal Registrar Atendimento | logado: admin/corretor]`

### Tags

- Lista de tags aplicadas ao deal.
- Botão **+** pra aplicar nova tag (TagSelector).
- Tags por grupo: temperatura (frio/morno/quente/fervendo), objeções, marco.

### Atribuição de corretor

Select com lista de corretores ativos. **Atribuir corretor** dispara o lastro bidirecional (cria card-espelho no funil do corretor).

---

## Botão "Criar contrato" (locação)

Quando o deal está numa etapa com papel `contrato` (ex: `corloc-contrato`), aparece um botão **"Criar contrato"** no DealDetailSheet.

Comportamento:
1. **Se o deal já tem contrato**: o botão fica como atalho — clica e navega pra `/contratos` mostrando aquele contrato.
2. **Se não tem contrato + tem garantia aprovada**: clica → chama RPC `create_lease_contract` → cria contrato em status rascunho → navega pra `/contratos`.
3. **Se não tem garantia aprovada**: o botão mostra aviso "Aprove uma garantia primeiro" e fica desabilitado.

`[📸 PRINT 03-07: botão Criar contrato no DealDetailSheet, deal em etapa contrato | logado: admin]`

---

## Buscar e filtrar

No topo do FunisPage:

- **Busca** (input) — filtra por nome ou telefone do lead em tempo real.
- **Filtro de status** (botões) — Todos / Em aberto / Ganhos / Perdidos.
- **Filtro de tag** (chips clicáveis) — só mostra deals com a tag.

Quando um filtro está ativo, mostra contador "X de Y deals" no topo.

---

## O que faz especial

- **Realtime**: outro admin ou corretor mexeu? Você vê na sua tela sem recarregar.
- **Lastro bidirecional**: deal no funil IA aponta pro card-espelho no funil do corretor. Mudou de um lado, atualiza no outro.
- **Validação de avanço**: sistema bloqueia avanço sem campo obrigatório (descobrir cedo > descobrir tarde).
- **Auditoria total**: cada movimentação registra `deal_stage_events` (quem, quando, de onde pra onde). Indicadores e digest usam isso.

---

## Próximos capítulos

- **04 — IA: Sugestões + Modo Treinador**
- **05 — Indicadores e Relatórios**
- **06 — Atividades / Agenda**
