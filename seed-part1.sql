-- =====================================================================
-- seed_demo.populate_cast() — Parte 1: elenco fixo
-- 6 corretores, 3 inspetores, 4 bancos + 8 atendentes,
-- 5 seguradoras + 8 atendentes, 220 imóveis.
-- Todos marcados com is_demo=true.
-- =====================================================================

CREATE OR REPLACE FUNCTION seed_demo.populate_cast()
RETURNS TABLE(entity text, qty bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_qty bigint;
BEGIN
  -- ===== CORRETORES (6) =====
  INSERT INTO public.broker_profiles (organization_id, name, email, phone_e164, distribution_pct, channels, is_active, position, metadata, is_demo)
  SELECT v_org, n.name, n.email, n.phone, n.pct,
         '["presencial","video","ligacao","whatsapp"]'::jsonb,
         true, n.pos, jsonb_build_object('crci', n.crci, 'segments', n.segments), true
  FROM (VALUES
    ('Ana Beatriz Cardoso',  'ana.cardoso@imobdemo.com.br',  '+5511990001001', 22, 1, '12345-F', ARRAY['mcmv']),
    ('Carlos Henrique Lima', 'carlos.lima@imobdemo.com.br',  '+5511990001002', 20, 2, '12346-F', ARRAY['mcmv','locacao']),
    ('Mariana Souza Alves',  'mariana.alves@imobdemo.com.br','+5511990001003', 18, 3, '12347-F', ARRAY['locacao']),
    ('Rafael Pacheco Dias',  'rafael.dias@imobdemo.com.br',  '+5511990001004', 16, 4, '12348-F', ARRAY['mcmv','locacao']),
    ('Júlia Mendonça',       'julia.mendonca@imobdemo.com.br','+5511990001005',14, 5, '12349-F', ARRAY['mcmv']),
    ('Thiago Barros Lopes',  'thiago.lopes@imobdemo.com.br', '+5511990001006', 10, 6, '12350-F', ARRAY['locacao'])
  ) AS n(name, email, phone, pct, pos, crci, segments);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'broker_profiles'; qty := v_qty; RETURN NEXT;

  -- ===== INSPETORES (3) =====
  INSERT INTO public.inspectors (organization_id, name, email, phone_e164, inspector_type, distribution_pct, is_active, position, metadata, is_demo)
  VALUES
    (v_org, 'Bruno Aparecido Ferreira', 'bruno.f@vistorias.com.br', '+5511990002001', 'perito_externo',   40, true, 1, '{"region":"Zona Sul"}'::jsonb, true),
    (v_org, 'Patrícia Nogueira Silva',  'patricia.silva@imobdemo.com.br', '+5511990002002', 'administrativo', 30, true, 2, '{"region":"Centro"}'::jsonb, true),
    (v_org, 'Eduardo Ramalho',          'eduardo.ramalho@vistorias.com.br', '+5511990002003', 'perito_externo',  30, true, 3, '{"region":"Zona Leste"}'::jsonb, true);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'inspectors'; qty := v_qty; RETURN NEXT;

  -- ===== BANCOS CORRESPONDENTES (4) =====
  INSERT INTO public.correspondent_banks (organization_id, name, distribution_pct, is_active, position, metadata, is_demo)
  VALUES
    (v_org, 'Caixa Econômica Federal', 50, true, 1, '{"tipo":"publico"}'::jsonb, true),
    (v_org, 'Banco do Brasil',         25, true, 2, '{"tipo":"publico"}'::jsonb, true),
    (v_org, 'Itaú Habitação',          15, true, 3, '{"tipo":"privado"}'::jsonb, true),
    (v_org, 'Santander Casa',          10, true, 4, '{"tipo":"privado"}'::jsonb, true);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'correspondent_banks'; qty := v_qty; RETURN NEXT;

  -- Atendentes dos bancos (2 por banco)
  INSERT INTO public.correspondent_attendants (organization_id, bank_id, name, email, phone_e164, is_active, position, is_demo)
  SELECT v_org, b.id, a.name, a.email, a.phone, true, a.pos, true
  FROM public.correspondent_banks b
  CROSS JOIN LATERAL (
    VALUES
      ('Sandra Veloso (' || b.name || ')',    lower(replace(b.name,' ','.')) || '.sandra@banco.com',  '+5511990003' || lpad((b.position*2-1)::text, 3, '0'), 1),
      ('Marcelo Rangel (' || b.name || ')',   lower(replace(b.name,' ','.')) || '.marcelo@banco.com', '+5511990003' || lpad((b.position*2)::text,   3, '0'), 2)
  ) AS a(name, email, phone, pos)
  WHERE b.organization_id = v_org AND b.is_demo = true;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'correspondent_attendants'; qty := v_qty; RETURN NEXT;

  -- ===== SEGURADORAS (5) =====
  INSERT INTO public.insurers (organization_id, name, cnpj, contact_phone, contact_email, distribution_pct, is_active, position, metadata, is_demo)
  VALUES
    (v_org, 'Porto Seguro Aluguel',  '61.198.164/0001-60', '+551133370000', 'contato@portoaluguel.com', 30, true, 1, '{}'::jsonb, true),
    (v_org, 'Tokio Marine Fiança',   '33.164.021/0001-00', '+551133370001', 'contato@tokiomarine.com.br', 25, true, 2, '{}'::jsonb, true),
    (v_org, 'Pottencial Seguros',    '11.699.534/0001-74', '+553133370002', 'contato@pottencial.com.br', 20, true, 3, '{}'::jsonb, true),
    (v_org, 'Loft Garantia',         '12.345.678/0001-90', '+551133370003', 'garantia@loft.com.br', 15, true, 4, '{}'::jsonb, true),
    (v_org, 'CredPago',              '23.456.789/0001-01', '+552133370004', 'contato@credpago.com.br', 10, true, 5, '{}'::jsonb, true);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'insurers'; qty := v_qty; RETURN NEXT;

  -- Atendentes das seguradoras (1-2 por seguradora)
  INSERT INTO public.insurer_attendants (organization_id, insurer_id, name, email, phone_e164, is_active, position, is_demo)
  SELECT v_org, i.id,
         CASE a.pos WHEN 1 THEN 'Atendimento ' || i.name ELSE 'Comercial ' || i.name END,
         'atend' || a.pos || '@' || lower(split_part(i.name,' ',1)) || '.com.br',
         '+551133370' || lpad((i.position*10 + a.pos)::text, 3, '0'),
         true, a.pos, true
  FROM public.insurers i
  CROSS JOIN (VALUES (1),(2)) AS a(pos)
  WHERE i.organization_id = v_org AND i.is_demo = true AND NOT (i.position = 5 AND a.pos = 2);
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'insurer_attendants'; qty := v_qty; RETURN NEXT;

  -- ===== IMÓVEIS (220): 60% locação, 40% venda =====
  WITH params AS (
    SELECT
      ARRAY['Vila Mariana','Pinheiros','Mooca','Tatuapé','Santana','Vila Madalena','Itaim Bibi','Bela Vista','Liberdade','Brooklin',
            'Saúde','Aclimação','Vila Olímpia','Perdizes','Lapa','Butantã','Campo Belo','Vila Prudente','Jabaquara','Cambuci'] AS bairros,
      ARRAY['São Paulo','Guarulhos','Osasco','São Caetano do Sul','Santo André','Diadema','Mauá'] AS cidades,
      ARRAY['Residencial Solar das Acácias','Edifício Vila Bela','Condomínio Jardim das Flores','Residencial Parque Verde',
            'Edifício Aurora','Condomínio Vista Alegre','Residencial Costa Azul','Edifício Mirante',
            'Condomínio Recanto dos Pássaros','Residencial Bela Vista','Edifício Primavera','Condomínio Parque das Águas',
            'Residencial Monte Olimpo','Edifício Estrela do Sul','Condomínio Lago Azul','Residencial Vale Verde'] AS empreendimentos
  )
  INSERT INTO public.properties (organization_id, code, title, segment, operation, price, appraisal_value, city, neighborhood, bedrooms, parking_spaces, status, notes, metadata, is_active, position, created_at, updated_at, is_demo)
  SELECT
    v_org,
    'IMV-' || lpad(i::text, 4, '0'),
    p.empreendimentos[1 + ((i - 1) % array_length(p.empreendimentos, 1))] || ' - Apto ' || lpad(((i * 7) % 400 + 101)::text, 3, '0'),
    CASE WHEN i % 5 = 0 THEN 'medio_padrao' ELSE 'mcmv' END,
    CASE WHEN i % 5 in (1, 2, 3) THEN 'locacao' ELSE 'venda' END,
    CASE
      WHEN i % 5 in (1, 2, 3) THEN (1800 + (i * 23) % 3500)::numeric  -- aluguel
      ELSE (180000 + (i * 1731) % 280000)::numeric  -- venda
    END,
    CASE
      WHEN i % 5 in (1, 2, 3) THEN NULL
      ELSE (190000 + (i * 1851) % 290000)::numeric
    END,
    p.cidades[1 + ((i * 3) % array_length(p.cidades, 1))],
    p.bairros[1 + ((i * 7) % array_length(p.bairros, 1))],
    1 + (i % 3),
    CASE WHEN i % 4 = 0 THEN 0 ELSE 1 + (i % 2) END,
    CASE
      WHEN i % 11 = 0 THEN 'alugado'
      WHEN i % 13 = 0 THEN 'vendido'
      WHEN i % 17 = 0 THEN 'reservado'
      ELSE 'disponivel'
    END,
    'Imóvel populado automaticamente para demonstração.',
    jsonb_build_object('area_m2', 40 + (i % 80), 'andar', 1 + (i % 18), 'vagas_extras', i % 2),
    true,
    i,
    (now() - ((420 - i)::int || ' days')::interval),
    now() - (((i * 3) % 60)::int || ' days')::interval,
    true
  FROM generate_series(1, 220) i, params p;
  GET DIAGNOSTICS v_qty = ROW_COUNT;
  entity := 'properties'; qty := v_qty; RETURN NEXT;

  RETURN;
END;
$func$;

REVOKE ALL ON FUNCTION seed_demo.populate_cast() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_demo.populate_cast() TO postgres, service_role;

COMMENT ON FUNCTION seed_demo.populate_cast() IS
  'Popula elenco fixo da demo: 6 corretores, 3 inspetores, 4 bancos + atendentes, 5 seguradoras + atendentes, 220 imóveis. Todos com is_demo=true.';