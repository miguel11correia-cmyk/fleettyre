// ── IDENTIDADE DO UTILIZADOR AUTENTICADO ─────────────────────────────
// Cria um cliente Supabase que herda o JWT de quem fez o pedido (em vez
// da service role key), para que os pedidos fiquem sujeitos à RLS
// normal — usado para resolver o próprio empresa_id do utilizador sem
// confiar em nada vindo do corpo/parâmetros do pedido.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export function clienteComPedido(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
}

// Empresa do utilizador autenticado (via membros, sujeito a RLS) — null
// se não autenticado ou sem ficha de membro (ex: admin sem empresa própria).
export async function obterEmpresaId(req: Request): Promise<string | null> {
  const sb = clienteComPedido(req);
  const { data, error } = await sb.from("membros").select("empresa_id").maybeSingle();
  if (error || !data) return null;
  return data.empresa_id;
}
