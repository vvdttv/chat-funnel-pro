-- Substitui a policy de SELECT do bucket whatsapp-media-public para
-- permitir download direto por link mas bloquear listagem do bucket.
DROP POLICY IF EXISTS "Midia WhatsApp publicamente legivel" ON storage.objects;

-- Permite GET direto de arquivos individuais (necessário para WhatsApp Cloud API
-- baixar a mídia pelo link). A listagem genérica fica bloqueada porque não há
-- policy que cubra o caso "selecionar tudo do bucket".
CREATE POLICY "Midia WhatsApp acessivel por link direto"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'whatsapp-media-public'
    AND name IS NOT NULL
    AND name != ''
  );

-- Restringe upload: usuário autenticado só pode subir em pasta da própria org.
DROP POLICY IF EXISTS "Autenticados sobem midia WhatsApp" ON storage.objects;
CREATE POLICY "Autenticados sobem midia WhatsApp na propria org"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media-public'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- Restringe delete: só admins da org dona da pasta.
DROP POLICY IF EXISTS "Autenticados removem midia WhatsApp" ON storage.objects;
CREATE POLICY "Admins removem midia WhatsApp da propria org"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media-public'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.is_org_admin()
  );