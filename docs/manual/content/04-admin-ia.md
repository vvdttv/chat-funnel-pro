# 04 — IA: Sugestões + Modo Treinador

> Capítulo pra **admin**. Cobre as duas frentes onde você interage com a IA: a **Caixa de Sugestões** (aba IA do BottomNav) e o **Modo Treinador** (canais painel e WhatsApp).

---

## Parte 1 — Caixa de Sugestões da IA

Acessada pelo ícone **IA** (Bot) na barra inferior.

`[📸 PRINT 04-00: aba IA, Caixa de Sugestões | logado: admin]`

### O que aparece aqui

**Duas listas independentes:**

1. **Sugestões de resposta** — respostas da IA que estão **aguardando aprovação** (quando autonomia é `suggest_only`).
2. **Sugestões de tag** — tags que a IA quer aplicar a deals (temperatura, objeção).

### Cabeçalho

- Título "Sugestões da IA".
- Botão de refresh (ícone seta circular) — força recarregar.

### Card de sugestão de resposta

Cada item da lista mostra:

- **Nome do lead** (ou `deal_id` se não tiver nome).
- **Rationale** — explicação curta da IA: por que ela quer mandar essa resposta.
- **Texto sugerido** — a mensagem que ela quer enviar.

`[📸 PRINT 04-01: card de sugestão expandido | logado: admin]`

### Ações por sugestão

3 botões + 1 botão à direita:

| Botão | Ação |
|-------|------|
| **Aprovar** | Envia a resposta pelo WhatsApp do lead na hora |
| **Editar** | Abre o texto pra você ajustar antes de aprovar |
| **Treinar** (à direita) | Abre o **TrainIADialog** (canal 1 do Modo Treinador) |
| **Recusar** (vermelho) | Descarta a sugestão sem enviar |

### Fluxo de aprovação

1. Você lê o que a IA quer mandar.
2. Se está bom → **Aprovar**. Resposta vai pro lead via WhatsApp.
3. Se está quase bom → **Editar**, ajusta o texto, depois Aprovar.
4. Se está errado → **Treinar** (você ensina ela pra próxima ser diferente) ou **Recusar** (só descarta).

### Sugestões de tag

Acima da lista de respostas, aparece a lista de tags que a IA quer aplicar (se houver).

Cada linha mostra:
- Lead.
- Tag sugerida (ex: "Quente", "Sem interesse").
- 2 botões: **✓ Aplicar tag** ou **✗ Descartar**.

---

## Parte 2 — Modo Treinador (Canal 1: painel)

O **Modo Treinador** é o jeito como você ensina a IA a se comportar diferente — em português normal, sem mexer em código.

### O botão "Treinar"

Aparece em todo card de sugestão da Caixa de Sugestões.

`[📸 PRINT 04-02: botão Treinar destacado em card de sugestão | logado: admin]`

Clica → abre o **TrainIADialog** (pop-up).

### O pop-up TrainIADialog

`[📸 PRINT 04-03: TrainIADialog aberto, com placeholder e texto de orientação | logado: admin]`

**Cabeçalho**: "Treinar IA — <Nome da etapa>" (ex: "Treinar IA — Coleta de dados").

**Texto de orientação**:
*"Diga em linguagem natural o que quer ajustar no comportamento da IA nesta etapa. A IA mostra o que entendeu e você confirma antes de salvar."*

**Caixa de texto** (3 linhas):
- Placeholder: *"Ex.: na abertura, seja mais objetiva e pergunte logo a cidade do lead"*.
- Você escreve em português normal.

**Botão "Enviar para a IA"** (habilita quando você digita):
- Texto durante processamento: "Interpretando..."
- Tempo médio: 5-15 segundos.

### A IA mostra o que entendeu

Bloco cinza claro com:
- Label em azul: "A IA entendeu assim:".
- Resumo em 1 frase do que ela vai mudar.

`[📸 PRINT 04-04: TrainIADialog após interpretação | logado: admin]`

**Dois botões**:
- **Confirmar e salvar** — aplica o ajuste. Próxima resposta da IA naquela etapa já vai aplicar.
- **Reformular** — limpa a interpretação e volta pro passo de escrever.

### Após salvar

Toast verde: *"Ajuste salvo — A próxima resposta da IA nesta etapa já vai aplicá-lo."*

Botão único: **Pronto, fechar**.

### O que aconteceu por baixo

1. Sistema gravou um **playbook_override** com escopo da etapa.
2. A engine `compose-playbook` lê isso a cada nova resposta.
3. Aplica em cima do prompt-base.
4. Registra em `ia_feedback_events` (auditoria: quem treinou, quando, qual override saiu).

> Você NÃO precisa esperar deploy. NÃO precisa reiniciar nada. A próxima resposta já vem com o ajuste.

---

## Parte 3 — Modo Treinador (Canal 2: WhatsApp)

Mesmo motor do canal 1, mas você treina **pelo seu próprio WhatsApp** — sem precisar abrir o sistema.

### Pré-requisito

Seu número precisa estar cadastrado em **Config → Modo Treinador** (aba 18). O cadastro tem:
- Número (E.164).
- Senha (mín. 6).
- Rótulo identificador.

> Sem cadastro, o WhatsApp ignora seu comando — mensagem cai no fluxo normal de lead (você não quer isso).

### Fluxo passo a passo

**1. Você manda `#modofeedback`** pro número do OmniMob (mesmo número que recebe leads).

`[📸 PRINT 04-05: conversa WhatsApp do admin, comando #modofeedback | logado: admin (no celular)]`

**2. A IA responde pedindo senha**: *"Modo treinador detectado. Qual é sua senha?"*

**3. Você responde com sua senha**:

**4. Se acertar**: sessão de treino abre. *"Sessão iniciada. Pode mandar seu feedback."* (timeout: 30 min de inatividade)

**5. Você descreve o ajuste**: *"na etapa de coleta, não pergunte renda antes de confirmar interesse"*

**6. A IA mostra a interpretação**: *"Entendi: ajustar a etapa 'coleta' pra coletar interesse antes de renda. Confirmar?"*

**7. Você confirma**: *"sim"* ou *"confirmar"* ou *"pode salvar"* — IA entende linguagem natural.

**8. Ajuste salvo**: *"Salvo. A próxima resposta da IA já vai aplicar."*

**9. A IA pergunta**: *"Quer continuar treinando ou voltar pra conversa normal?"*

- Se você responder *"continuar"* / *"mais um"* / *"outro"* — fica em modo treinador pro próximo ajuste.
- Se você responder *"voltar"* / *"sair"* / *"normal"* — fecha sessão. Mensagens seguintes voltam ao fluxo normal.

### Importante: quando você está em modo treinador

**Suas mensagens NÃO viram lead.** NÃO entram na fila de atendimento da IA. Canal totalmente à parte.

Se você se esquecer e ficar 30 min sem responder, a sessão expira sozinha e suas próximas mensagens voltam ao fluxo normal.

---

## Parte 4 — Onde acompanhar tudo que foi treinado

Vai em **Config → Config IA → Configurações salvas** (capítulo 02, seção 1.2).

Lista TUDO que foi treinado nos 2 canais (painel + WhatsApp). Cada linha:
- Resumo do ajuste.
- Etapa onde se aplica.
- Data.
- Botão **Ajustar** (abre o fluxo do Configurador IA com os dados pré-preenchidos pra você refinar).

---

## Parte 5 — Onde ver POR QUE a IA fez o que fez

Vai em **Config → Config IA → Auditoria**.

Cada resposta da IA gerou um registro com:
- Prompt usado.
- Comportamentos detectados.
- Regras aplicadas.
- Overrides aplicados (ou seja: quais treinamentos do Modo Treinador estavam ativos).
- Intent, tone, ação tomada.

Quando uma resposta sair estranha, você abre a Auditoria, clica no registro, lê o prompt completo. Não tem caixa-preta.

---

## Próximo

- **05 — Indicadores e Relatórios**
- **06 — Atividades / Agenda**
