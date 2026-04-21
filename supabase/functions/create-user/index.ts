// Edge function: cria um usuário na empresa do admin logado.
// Apenas admins da empresa podem chamar. Usa service role para criar o auth.user.
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente com o JWT do chamador (para validar identidade e org/role)
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub;

    // Buscar org e papel do chamador
    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("organization_id")
      .eq("user_id", callerId)
      .single();
    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await callerClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("organization_id", callerProfile.organization_id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Apenas admins podem criar usuários." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar payload
    const body = await req.json();
    const username = (body.username || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();
    const role = body.role === "admin" ? "admin" : "corretor";
    const displayName = (body.display_name || username).toString().trim();

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      return new Response(
        JSON.stringify({ error: "Usuário deve ter 3-30 caracteres (letras minúsculas, números, _ . -)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Senha precisa ter ao menos 6 caracteres." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente admin (service role) para criar o usuário
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Checar se username já existe
    const { data: existing } = await adminClient
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "Este usuário já está em uso." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = `${username}@app.local`;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "Falha ao criar usuário" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = created.user.id;

    // Criar profile
    const { error: profErr } = await adminClient.from("profiles").insert({
      user_id: newUserId,
      organization_id: callerProfile.organization_id,
      username,
      display_name: displayName,
    });
    if (profErr) {
      // rollback do auth user
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Criar role
    const { error: roleErr } = await adminClient.from("user_roles").insert({
      user_id: newUserId,
      organization_id: callerProfile.organization_id,
      role,
    });
    if (roleErr) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: roleErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: newUserId, username }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-user error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro inesperado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
