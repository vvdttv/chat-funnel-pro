-- Realtime para deals: payload completo em UPDATE/DELETE
ALTER TABLE public.deals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;