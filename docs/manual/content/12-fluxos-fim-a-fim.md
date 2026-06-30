# 12 — Fluxos fim-a-fim

Capítulo de fechamento. Mostra como o sistema inteiro funciona junto, do primeiro oi do lead até a chave entregue (venda) ou contrato ativo (locação).

Aqui você vê as duas jornadas completas: MCMV (venda) e Locação.

---

## Jornada 1 — MCMV (venda)

Lead novo entra. Sai com escritura na mão.

### Passo 1 — Lead manda mensagem

Cliente em potencial manda WhatsApp pro número da imobiliária.

O que acontece automaticamente:
1. Webhook whatsapp-webhook recebe.
2. Identifica o número receptor, resolve a org + funil padrão (fun-ia-mcmv).
3. Cria deal na etapa 1 (ia-novo-lead).
4. Linka lead_channel (telefone deal).

Quem ve: admin ve o card aparecer no Kanban em tempo real. Notification push opcional.

### Passo 2 — IA atende

A IA persona passiva (Marina) responde em segundos.

Comportamento:
- Cumprimenta sem soar robo.
- Pergunta o que o lead quer (compra MCMV ou outra coisa).
- Vai conduzindo a conversa pra coletar os criterios obrigatorios da etapa (fun-ia-mcmv ia-coleta): Cidade, faixa de preco, prazo. Renda, FGTS, dependentes, idade. Documentos (pede comprovantes).
- Grava cada dado coletado em deal_field_values (system 1.4).

Avanco de etapa: so avanca pra proxima quando todos os campos owner=IA estao preenchidos.

### Passo 3 — Qualificacao

Quando o lead atende os criterios (renda compativel, documentos OK), a IA muda o deal pra ia-analise.

Trigger automatico: tg_assign_correspondent_on_analise dispara.
1. Roleta de correspondentes (peso x carga).
2. Atribui o lead a um atendente.
3. Cria credit_analyses com status received.
4. Notification push pro atendente: Nova analise recebida.

### Passo 4 — Correspondente analisa

Atendente abre o /correspondente, ve o lead na aba Recebidas.

1. Clica abre detalhe.
2. Revisa documentos. Adiciona comentarios se precisar.
3. Pode pedir extracao automatica (IA le PDFs/imagens).
4. Clica Iniciar analise status in_analysis, cronometro comeca.
5. Faz a analise no banco (fora do sistema).
6. Volta, preenche devolutiva: Aprovado / Aprovado condicional / Reprovado. Valor aprovado, exige entrada, etc.
7. Clica Enviar devolutiva.

O que acontece:
- Aprovado / condicional: deal vai pra ia-aprovado-aguardando (bypass da trava 1.4b).
- Reprovado: deal vira lost, vai pra nutricao (nut-credito-reprovado).

### Passo 5 — Agendamento + briefing automaticos

Trigger: tg_start_scheduling_on_approved dispara em deals que entram em ia-aprovado-aguardando.

1. Gera briefing completo (consolida tudo do lead).
2. Calcula match 100/80/0 com properties cadastrados.
3. Sugere 2 slots de visita (mais breve possivel, respeitando broker_availability).
4. Roleta de corretores filtrada por funnel_access atribui corretor.
5. Cria appointments com status proposed.
6. Cria card-espelho no fun-corretor-mcmv (via mirror_deal_id).
7. Notification pro corretor: Novo briefing disponivel.

### Passo 6 — Corretor confirma e visita

Corretor abre /corretor, ve o lead na aba A agendar.

1. Clica abre briefing completo + lista de imoveis-match.
2. Liga pro lead, confirma data.
3. Volta no sistema, clica Confirmar agendamento num dos slots.
4. Sistema cria agenda pro lead (notification 24h antes + 1h antes).
5. No dia, corretor visita o imovel com o lead.
6. Apos visita, marca Visitada ou No-show.

Visitada + lead interessado corretor segue pro fechamento.

### Resumo MCMV

```
WhatsApp do lead
  (segundos)
IA atende em fun-ia-mcmv
  (qualificacao 5-15 min)
ia-analise correspondente (roleta + cronometro)
  (ate 24h SLA)
Devolutiva:
  aprovado IA agenda + briefing automatico corretor visita
  reprovado nutricao (cadencia de retomada)
```

---

## Jornada 2 — Locacao

Lead manda WhatsApp assina contrato + chave na mao.

### Passo 1 — Lead manda mensagem

Mesmo do MCMV, mas no numero que tem default_funnel_id = fun-ia-locacao. Deal nasce em loc-novo-lead.

### Passo 2 — IA atende e qualifica

A IA da locacao:
- Pergunta cidade, faixa de aluguel, prazo, tipo de imovel.
- Pergunta renda (geralmente exige 3x o aluguel).
- Pergunta sobre tipo de garantia preferida: fiador / caucao / seguro-fianca / titulo.
- Coleta documentos.

Avanca por: loc-novo-lead loc-atendimento loc-coleta loc-analise-garantia (quando qualifica).

### Passo 3 — Analise de garantia

Trigger: ao entrar em loc-analise-garantia, o sistema cria guarantee_analyses status received, atribuida ao administrativo (fila — sem roleta natural).

Administrativo abre /garantia:
1. Ve a analise na aba Recebidas.
2. Clica detalhe.
3. Define o tipo de garantia clicando num dos 4 botoes.
4. Se seguro-fianca / titulo: roleta dupla atribui seguradora + atendente.
5. Atendente da seguradora ve o lead no painel dele, analisa, devolve.
6. Se fiador / caucao: administrativo analisa direto.
7. Devolutiva: aprovado / condicional / reprovado.

Aprovado / condicional: deal vai pra loc-aprovado-aguardando. Reprovado: nutricao.

### Passo 4 — Vistoria de entrada (automatica)

Quando o deal chega em etapa com papel vistoria_entrada (no funil de corretor de locacao):

Trigger: tg_create_inspection_on_stage dispara.
1. Cria property_inspections tipo entrada, status pendente.
2. Se roleta ligada, atribui. Senao, fila.

Administrativo abre /vistorias:
1. Atribui vistoriador.
2. Agenda data.
3. Vistoriador executa, preenche checklist por comodo.
4. Status vira concluida.

### Passo 5 — Contrato

Quando o deal esta em etapa com papel contrato (corloc-contrato), no card do deal aparece Criar contrato.

Administrativo:
1. Clica cria contrato rascunho (RPC valida que garantia foi aprovada).
2. Navega pra /contratos.
3. Preenche campos estruturados (valor aluguel, prazo, indice).
4. Preenche os 4 blocos customizados (dados cliente, imobiliaria, endereco, garantia vem pre-preenchido da garantia aprovada).
5. Salva.
6. Anexa URL do documento (PDF do contrato).
7. Muda status: rascunho enviado assinado ativo.

### Passo 6 — Contrato ativo

Locatario entra no imovel. Contrato ativo. Deal vai pra ultima etapa do funil de corretor de locacao.

### Passo 7 — Encerramento (no fim do prazo)

Administrativo clica Encerrar no contrato:
- Status encerrado.
- Aparece botao Solicitar vistoria de saida.
- Cria property_inspections tipo saida, fluxo igual a entrada.
- Apos vistoria de saida, ciclo fecha.

### Resumo Locacao

```
WhatsApp do lead
  
IA atende em fun-ia-locacao
  
Analise de garantia (admin/atendente seguradora)
  
Aprovado deal vai pro fun-corretor-locacao
  
Vistoria de entrada (automatica, executada por vistoriador)
  
Contrato (criado manual pelo admin, lifecycle ate ativo)
   (vigencia)
Encerramento + vistoria de saida
```

---

## Onde o Modo Treinador entra

Em qualquer ponto da jornada, se a IA se comporta de um jeito que voce quer mudar:

1. Voce abre a aba IA (Caixa de Sugestoes).
2. Acha uma resposta da IA que ilustra o comportamento.
3. Clica Treinar.
4. Descreve em portugues o que quer ajustar.
5. Confirma.
6. Proxima resposta da IA naquela etapa ja aplica.

OU pelo WhatsApp:
1. Manda #modofeedback pro numero do OmniMob.
2. Responde a senha.
3. Descreve o ajuste.
4. Confirma.

Sem deploy. Sem reinicio. Sem programador.

---

## Lastro bidirecional (detalhe tecnico)

Em locacao e em MCMV, o sistema mantem espelhos sincronizados:

- Deal no funil IA (atendimento) deal-espelho no funil de corretor (operacao).
- Mexer num lado atualiza o outro (mirror_deal_id).
- Permite que diferentes pessoas vejam o mesmo lead pelo angulo do papel delas.

Voce nao precisa pensar nisso o sistema cuida.

---

## Proximo

- 13 — Glossario, FAQ e atalhos
