// ── UTILIZADORES — CONVIDAR ───────────────────────────────────────────
// Só para admins globais. Convida alguém por email (o Supabase envia o
// email de convite, com link para definir a password em
// reset-password.html) e liga-o a uma empresa — já existente, ou nova
// (criada aqui mesmo, antes do convite).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterIsAdmin } from "../_shared/auth.ts";
import { corsHeaders, tratarPreflight } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  const isAdmin = await obterIsAdmin(req);
  if (!isAdmin) {
    return new Response(JSON.stringify({ ok: false, erro: "Sem permissão." }), { status: 403, headers: corsHeaders(req) });
  }

  let dados: any;
  try { dados = await req.json(); } catch { dados = {}; }

  const email           = String(dados.email || "").trim().toLowerCase();
  const empresaIdDado   = dados.empresa_id ? String(dados.empresa_id) : null;
  const novaEmpresaNome = dados.nova_empresa_nome ? String(dados.nova_empresa_nome).trim() : null;

  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, erro: "Email inválido." }), { status: 400, headers: corsHeaders(req) });
  }
  if (!empresaIdDado && !novaEmpresaNome) {
    return new Response(JSON.stringify({ ok: false, erro: "Escolhe uma empresa ou indica o nome de uma nova." }), { status: 400, headers: corsHeaders(req) });
  }

  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let empresaId = empresaIdDado;
  if (!empresaId) {
    const { data: novaEmpresa, error: erroEmpresa } = await sbAdmin
      .from("empresas")
      .insert({ nome: novaEmpresaNome })
      .select("id")
      .single();
    if (erroEmpresa) {
      return new Response(JSON.stringify({ ok: false, erro: "Erro a criar a empresa: " + erroEmpresa.message }), { status: 500, headers: corsHeaders(req) });
    }
    empresaId = novaEmpresa.id;
  }

  const { data: convite, error: erroConvite } = await sbAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: "https://fleet-tyre.com/reset-password.html",
  });

  if (erroConvite) {
    const msg = erroConvite.message.toLowerCase().includes("already")
      ? "Este email já tem conta (pode já estar associado a outra empresa)."
      : erroConvite.message;
    return new Response(JSON.stringify({ ok: false, erro: msg }), { status: 400, headers: corsHeaders(req) });
  }

  const { error: erroMembro } = await sbAdmin
    .from("membros")
    .upsert({ user_id: convite.user.id, empresa_id: empresaId }, { onConflict: "user_id" });

  if (erroMembro) {
    return new Response(JSON.stringify({ ok: false, erro: "Convite enviado, mas falhou a associação à empresa: " + erroMembro.message }), { status: 500, headers: corsHeaders(req) });
  }

  return new Response(JSON.stringify({ ok: true, empresa_id: empresaId }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
});
