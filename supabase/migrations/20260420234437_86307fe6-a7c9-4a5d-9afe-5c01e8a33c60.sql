-- Tabela única para persistir funis (com etapas e workflows da IA aninhados em JSON)
CREATE TABLE public.funnels (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'Zap',
  color TEXT NOT NULL DEFAULT 'hsl(var(--primary))',
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_funnels_updated_at
BEFORE UPDATE ON public.funnels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS habilitado, acesso público (o app ainda não tem autenticação;
-- funis são configuração global compartilhada)
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Funis são públicos para leitura"
  ON public.funnels FOR SELECT
  USING (true);

CREATE POLICY "Qualquer um pode criar funis"
  ON public.funnels FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Qualquer um pode atualizar funis"
  ON public.funnels FOR UPDATE
  USING (true);

CREATE POLICY "Qualquer um pode excluir funis"
  ON public.funnels FOR DELETE
  USING (true);

-- Índice para ordenação
CREATE INDEX idx_funnels_position ON public.funnels(position);

-- Seed: funil padrão inicial
INSERT INTO public.funnels (id, name, description, icon, color, position, stages) VALUES (
  'fun-padrao',
  'Funil Padrão',
  'Funil padrão do sistema — totalmente customizável',
  'Zap',
  'hsl(var(--primary))',
  0,
  '[
    {"id":"stage-novo-lead","name":"Novo Lead","probability":10,"maxDaysInStage":2,"touchpoints":[{"id":"tp-std-1","executor":"ai","action":"Mensagem de boas-vindas","description":"IA envia saudação automática e confirma interesse","delayHours":0,"channel":"whatsapp","messageTypes":["text"]}]},
    {"id":"stage-qualificacao","name":"Qualificação","probability":25,"maxDaysInStage":5,"touchpoints":[{"id":"tp-std-2","executor":"ai","action":"Coletar dados do lead","description":"IA pergunta perfil, orçamento e localização desejada","delayHours":1,"channel":"whatsapp","messageTypes":["text"]}]},
    {"id":"stage-visita","name":"Visita","probability":50,"maxDaysInStage":7,"touchpoints":[{"id":"tp-std-3","executor":"agent","action":"Agendar visita","description":"Corretor combina horário disponível com o lead","delayHours":0,"channel":"whatsapp","messageTypes":["text"]}]},
    {"id":"stage-proposta","name":"Proposta","probability":75,"maxDaysInStage":10,"touchpoints":[{"id":"tp-std-4","executor":"agent","action":"Enviar proposta","description":"Corretor envia proposta formal com valores e condições","delayHours":0,"channel":"email","messageTypes":["text"]}]},
    {"id":"stage-fechamento","name":"Fechamento","probability":95,"maxDaysInStage":14,"touchpoints":[{"id":"tp-std-5","executor":"agent","action":"Assinatura do contrato","description":"Corretor agenda e conduz a assinatura","delayHours":0,"channel":"ligação","messageTypes":["text"]}]}
  ]'::jsonb
);