/**
 * Edge `broker-scheduling-cadence` — varredura da cadência de agendamento.
 *
 * Chamada pelo pg_cron (a cada 30 min) com header x-cron-token. Invoca a RPC
 * `flag_scheduling_exhausted(p_days, p_max_attempts)` que escala para o corretor
 * (troca de voz silenciosa) cada appointment 'proposed' cuja cadência se esgotou
 * (plano §9-E: 3 dias / até 9 tentativas). Cada escalação move o deal-IA para
 * 'ia-troca-voz' (etapa 9) e cria o card no funil do corretor na etapa 1
 * ('cor-agendar-visita') com briefing — tudo dentro da RPC (M2M).
 *
 * Thresholds configuráveis por env:
 *   BROKER_SCHEDULING_DAYS         (default 3)
 *   BROKER_SCHEDULING_MAX_ATTEMPTS (default 9)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Endpoint exclusivamente cron/M2M — nenhum browser chama. Sem CORS aberto.
const corsHeaders = {
  "Access-Control-Allow-Headers": "content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseEnvInt = (name: string, def: number): number => {
  const raw = parseInt(Deno.env.get(name) ?? String(def), 10);
  return Number.isNaN(raw) || raw < 1 ? def : raw;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const CRON_TOKEN = Deno.env.get("CRON_DISPATCH_TOKEN") ?? "";
  const got = req.headers.get("x-cron-token") ?? "";
  if (!CRON_TOKEN || got !== CRON_TOKEN) {
    return json({ error: "invalid_cron_token" }, 401);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const days = parseEnvInt("BROKER_SCHEDULING_DAYS", 3);
    const maxAttempts = parseEnvInt("BROKER_SCHEDULING_MAX_ATTEMPTS", 9);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data, error } = await admin.rpc("flag_scheduling_exhausted", {
      p_days: days,
      p_max_attempts: maxAttempts,
    });
    if (error) {
      console.error("[broker-scheduling-cadence] rpc err:", error);
      return json({ ok: false, error: error.message }, 200);
    }
    const escalated = typeof data === "number" ? data : 0;
    return json({ ok: true, escalated, days, maxAttempts });
  } catch (e) {
    console.error("[broker-scheduling-cadence] uncaught:", e);
    return json({ error: e instanceof Error ? e.message : "erro_interno" }, 500);
  }
});
