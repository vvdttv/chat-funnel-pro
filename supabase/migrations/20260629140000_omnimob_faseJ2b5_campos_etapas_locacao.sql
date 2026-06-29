-- =====================================================================
-- OmniMob — Fase J-2b-5: campos obrigatorios 1.4 nas etapas dos funis de locacao.
-- Decisao do cliente:
--   (F) campos obrigatorios 1.4 em TODAS as etapas comportaveis dos funis de locacao.
--   Etapas de status/transferencia/duplicacao recebem 1 campo simbolico contextualizado
--   (decisao explicita: ter checkpoint visivel no card mesmo onde dado completo mora em
--   outra tabela como property_inspections/lease_contracts).
-- Modelo existente desde 22/06 (Fase 1.4a/b/c): stage_qualification_criteria + RPCs
-- set_deal_field_value(_internal). Esta fase e SOMENTE seed (sem mudanca de schema).
-- Idempotente: ON CONFLICT (org, funnel, stage, key) DO NOTHING.
-- ATOMICA (BEGIN/COMMIT). Org de producao: 11111111-1111-1111-1111-111111111111
-- =====================================================================
BEGIN;

DO $do$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE NOTICE 'Org de producao nao existe nesta instancia. Seed ignorado.';
    RETURN;
  END IF;

  -- =================================================================
  -- FUNIL IA LOCACAO (fun-ia-locacao)
  -- =================================================================

  -- 1) loc-novo-lead: primeiro contato do interessado
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-novo-lead','interesse_confirmado','Interesse em alugar confirmado','boolean','ia',
     '{}'::jsonb,'O lead confirmou que quer alugar um imovel?',true,1,true),
    (v_org,'fun-ia-locacao','loc-novo-lead','origem_lead','Origem do lead','select_single','ia',
     jsonb_build_object('options', jsonb_build_array(
       jsonb_build_object('value','site','label','Site'),
       jsonb_build_object('value','indicacao','label','Indicacao'),
       jsonb_build_object('value','redes_sociais','label','Redes sociais'),
       jsonb_build_object('value','portal','label','Portal imobiliario'),
       jsonb_build_object('value','outros','label','Outros'))),
     'Como o lead chegou ate a imobiliaria?',true,2,true),
    (v_org,'fun-ia-locacao','loc-novo-lead','regiao_interesse','Regiao de interesse','text','ia',
     '{}'::jsonb,'Qual bairro ou regiao o lead deseja alugar?',true,3,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 2) loc-atendimento: pre-qualificacao
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-atendimento','tipo_imovel','Tipo de imovel','select_single','ia',
     jsonb_build_object('options', jsonb_build_array(
       jsonb_build_object('value','casa','label','Casa'),
       jsonb_build_object('value','apartamento','label','Apartamento'),
       jsonb_build_object('value','comercial','label','Comercial'),
       jsonb_build_object('value','kitnet','label','Kitnet/Studio'))),
     'Que tipo de imovel o lead quer alugar?',true,1,true),
    (v_org,'fun-ia-locacao','loc-atendimento','faixa_aluguel','Faixa de aluguel pretendida (R$)','threshold','ia',
     '{}'::jsonb,'Qual o valor maximo de aluguel mensal que o lead pode pagar?',true,2,true),
    (v_org,'fun-ia-locacao','loc-atendimento','prazo_locacao_meses','Prazo pretendido (meses)','text','ia',
     '{}'::jsonb,'Por quantos meses o lead pretende alugar?',true,3,true),
    (v_org,'fun-ia-locacao','loc-atendimento','tipo_garantia_pretendido','Tipo de garantia pretendido','select_single','ia',
     jsonb_build_object('options', jsonb_build_array(
       jsonb_build_object('value','fiador','label','Fiador'),
       jsonb_build_object('value','caucao','label','Caucao'),
       jsonb_build_object('value','seguro_fianca','label','Seguro-fianca'),
       jsonb_build_object('value','titulo_capitalizacao','label','Titulo de capitalizacao'))),
     'Qual modalidade de garantia o lead pretende oferecer?',true,4,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 3) loc-coleta: documentacao do locatario e garantia
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-coleta','rg','RG entregue','boolean','ia',
     '{}'::jsonb,'O RG do locatario foi recebido?',true,1,true),
    (v_org,'fun-ia-locacao','loc-coleta','cpf','CPF entregue','boolean','ia',
     '{}'::jsonb,'O CPF do locatario foi recebido?',true,2,true),
    (v_org,'fun-ia-locacao','loc-coleta','comprovante_renda','Comprovante de renda entregue','boolean','ia',
     '{}'::jsonb,'O comprovante de renda foi recebido?',true,3,true),
    (v_org,'fun-ia-locacao','loc-coleta','comprovante_residencia','Comprovante de residencia entregue','boolean','ia',
     '{}'::jsonb,'O comprovante de residencia atual foi recebido?',true,4,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 4) loc-analise-garantia: JA EXISTE (seedada na J-2a). Preservar.

  -- 5) loc-aguardando: aguardando devolutiva da garantia
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-aguardando','previsao_retorno_garantia','Previsao de retorno da garantia','text','ia',
     '{}'::jsonb,'Qual prazo a seguradora/analista informou para devolver?',true,1,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 6) loc-aprovado-aguardando: aguardando agendamento de visita
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-aprovado-aguardando','preferencia_horario_visita','Preferencia de horario para visita','text','ia',
     '{}'::jsonb,'Qual periodo do dia o lead prefere visitar (manha, tarde, noite, dia da semana)?',true,1,true),
    (v_org,'fun-ia-locacao','loc-aprovado-aguardando','telefone_contato_visita','Telefone de contato para visita','text','ia',
     '{}'::jsonb,'Qual telefone usar para confirmar a visita?',true,2,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 7) loc-agendamento: agendamento em andamento
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-agendamento','data_visita','Data agendada da visita','text','corretor',
     '{}'::jsonb,'Qual a data combinada para a visita?',true,1,true),
    (v_org,'fun-ia-locacao','loc-agendamento','hora_visita','Hora agendada da visita','text','corretor',
     '{}'::jsonb,'Qual o horario combinado para a visita?',true,2,true),
    (v_org,'fun-ia-locacao','loc-agendamento','confirmou_presenca','Lead confirmou presenca','boolean','corretor',
     '{}'::jsonb,'O lead confirmou que vai comparecer a visita?',true,3,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 8) loc-transferido: transferido ao corretor
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-transferido','corretor_acionado','Corretor acionado','boolean','corretor',
     '{}'::jsonb,'O corretor foi avisado da transferencia?',true,1,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 9) loc-troca-voz: cadencia esgotada, troca para humano
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-ia-locacao','loc-troca-voz','corretor_assumiu','Corretor humano assumiu','boolean','corretor',
     '{}'::jsonb,'O corretor humano assumiu o atendimento apos a IA esgotar tentativas?',true,1,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- =================================================================
  -- FUNIL CORRETOR LOCACAO (fun-corretor-locacao)
  -- =================================================================

  -- 1) corloc-visita-agendada
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-corretor-locacao','corloc-visita-agendada','data_visita','Data da visita','text','corretor',
     '{}'::jsonb,'Qual a data marcada para a visita?',true,1,true),
    (v_org,'fun-corretor-locacao','corloc-visita-agendada','lead_compareceu','Lead compareceu','boolean','corretor',
     '{}'::jsonb,'O lead compareceu a visita?',true,2,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 2) corloc-negociacao
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-corretor-locacao','corloc-negociacao','valor_aluguel_proposto','Valor de aluguel proposto (R$)','threshold','corretor',
     '{}'::jsonb,'Qual valor de aluguel foi proposto inicialmente?',true,1,true),
    (v_org,'fun-corretor-locacao','corloc-negociacao','valor_aluguel_aceito','Valor de aluguel aceito (R$)','threshold','corretor',
     '{}'::jsonb,'Qual valor de aluguel ficou acordado ao final da negociacao?',true,2,true),
    (v_org,'fun-corretor-locacao','corloc-negociacao','data_entrada_pretendida','Data pretendida para entrada','text','corretor',
     '{}'::jsonb,'Quando o lead pretende comecar a alugar?',true,3,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 3) corloc-vistoria-entrada (resumo no card; dado completo em property_inspections)
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-corretor-locacao','corloc-vistoria-entrada','vistoria_entrada_aprovada','Vistoria de entrada aprovada','boolean','corretor',
     '{}'::jsonb,'A vistoria de entrada foi concluida e aprovada?',true,1,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 4) corloc-contrato (resumo no card; dado completo em lease_contracts)
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-corretor-locacao','corloc-contrato','contrato_gerado','Contrato gerado','boolean','corretor',
     '{}'::jsonb,'O contrato de locacao ja foi criado?',true,1,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 5) corloc-assinatura
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-corretor-locacao','corloc-assinatura','data_envio_contrato','Data de envio do contrato','text','corretor',
     '{}'::jsonb,'Quando o contrato foi enviado para as partes?',true,1,true),
    (v_org,'fun-corretor-locacao','corloc-assinatura','data_assinatura','Data de assinatura','text','corretor',
     '{}'::jsonb,'Quando o contrato foi assinado?',true,2,true),
    (v_org,'fun-corretor-locacao','corloc-assinatura','contrato_assinado','Contrato assinado','boolean','corretor',
     '{}'::jsonb,'Todas as partes assinaram o contrato?',true,3,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 6) corloc-ativo: marco critico (primeiro aluguel pago)
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-corretor-locacao','corloc-ativo','primeiro_aluguel_pago','Primeiro aluguel pago','boolean','corretor',
     '{}'::jsonb,'O locatario ja pagou o primeiro aluguel?',true,1,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

  -- 7) corloc-encerramento
  INSERT INTO public.stage_qualification_criteria
    (organization_id, funnel_id, stage_id, key, label, criterion_type, owner, config, question_hint, is_required, position, is_active)
  VALUES
    (v_org,'fun-corretor-locacao','corloc-encerramento','data_saida','Data de saida do imovel','text','ambos',
     '{}'::jsonb,'Quando o locatario desocupou o imovel?',true,1,true),
    (v_org,'fun-corretor-locacao','corloc-encerramento','motivo_encerramento','Motivo do encerramento','select_single','ambos',
     jsonb_build_object('options', jsonb_build_array(
       jsonb_build_object('value','fim_contrato','label','Fim do contrato'),
       jsonb_build_object('value','rescisao_locatario','label','Rescisao pelo locatario'),
       jsonb_build_object('value','rescisao_locador','label','Rescisao pelo locador'),
       jsonb_build_object('value','inadimplencia','label','Inadimplencia'),
       jsonb_build_object('value','venda_imovel','label','Venda do imovel'),
       jsonb_build_object('value','outros','label','Outros'))),
     'Por que a locacao foi encerrada?',true,2,true),
    (v_org,'fun-corretor-locacao','corloc-encerramento','vistoria_saida_realizada','Vistoria de saida realizada','boolean','ambos',
     '{}'::jsonb,'A vistoria de saida foi feita?',true,3,true)
  ON CONFLICT (organization_id, funnel_id, stage_id, key) DO NOTHING;

END
$do$;

COMMIT;