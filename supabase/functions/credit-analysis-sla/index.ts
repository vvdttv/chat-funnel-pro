/**
 * Edge `credit-analysis-sla` — varredura de SLA das análises de crédito.
 *
 * Chamada pelo pg_cron (a cada 15 min) com header x-cron-token. Invoca a RPC
 * `flag_credit_analysis_sla(p_hours)` que enfileira (idempotente) uma
 * internal_notification 'sla_overdue' para cada análise 'in_analysis' parada
 * há mais de p_hours sem devolutiva. O envio em si é feito pelo drenador
 * (send-internal-notification em modo drain).
 *
 * Threshold configurável por env CREDIT_ANALYSIS_SLA_HOURS (default 24).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    const rawHours = parseInt(Deno.env.get("CREDIT_ANALYSIS_SLA_HOURS") ?? "24", 10);
    const hours = Number.isNaN(rawHours) || rawHours < 1 ? 24 : rawHours;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data, error } = await admin.rpc("flag_credit_analysis_sla", { p_hours: hours });
    if (error) {
      console.error("[credit-analysis-sla] rpc err:", error);
      return json({ ok: false, error: error.message }, 200);
    }
    const flagged = typeof data === "number" ? data : 0;
    return json({ ok: true, flagged, hours });
  } catch (e) {
    console.error("[credit-analysis-sla] uncaught:", e);
    return json({ error: e instanceof Error ? e.message : "erro_interno" }, 500);
  }
});
