-- Sprint 10: bloquear acesso direto à tabela password_reset_attempts.
-- Tabela é gravada/lida apenas por edge functions usando o service role
-- (que ignora RLS). Clientes autenticados/anon não devem conseguir nada.
-- Adicionamos políticas explícitas que negam tudo, deixando o linter feliz
-- e tornando a intenção explícita no schema.

CREATE POLICY "Bloqueia leitura por clientes"
  ON public.password_reset_attempts
  FOR SELECT
  TO authenticated, anon
  USING (false);

CREATE POLICY "Bloqueia inserção por clientes"
  ON public.password_reset_attempts
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Bloqueia atualização por clientes"
  ON public.password_reset_attempts
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Bloqueia exclusão por clientes"
  ON public.password_reset_attempts
  FOR DELETE
  TO authenticated, anon
  USING (false);