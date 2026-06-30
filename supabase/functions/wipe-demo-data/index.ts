// Edge function: apaga todos os dados marcados como is_demo=true.
// Restrita a superadmin. Chama seed_demo.wipe_all_demo() com service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await caller.auth.getClaims(token);
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claims.claims.sub;

    // Apenas superadmin pode disparar.
    const { data: prof } = await caller
      .from("profiles").select("role").eq("id", callerId).maybeSingle();
    if (prof?.role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Apenas superadmin pode executar esta operação." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirmação dupla obrigatória.
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "LIMPAR") {
      return new Response(
        JSON.stringify({ error: "Confirmação ausente. Envie { confirm: 'LIMPAR' }." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Executa a função no banco com service role.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin.schema("seed_demo").rpc("wipe_all_demo");
    if (error) {
      return new Response(
        JSON.stringify({ error: "Falha ao executar limpeza: " + error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await admin.from("audit_logs").insert({
      user_id: callerId,
      action: "demo.wiped",
      target_type: "demo_seed",
      details: { tables_affected: data?.length ?? 0, summary: data },
    });

    return new Response(
      JSON.stringify({ ok: true, tables_affected: data?.length ?? 0, summary: data ?? [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Erro interno: " + (e as Error).message }),
      { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } },
    );
  }
});