-- Tabela para rate limit de tentativas de reset
CREATE TABLE public.password_reset_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_attempts_user_recent
  ON public.password_reset_attempts (user_id, attempted_at DESC);

ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;

-- Apenas service role insere/lê (nenhuma policy => bloqueado para clientes autenticados)
-- Edge functions usam service role e bypassam RLS.