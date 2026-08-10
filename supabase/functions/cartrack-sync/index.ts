// ── CARTRACK SYNC ────────────────────────────────────────────────
// Edge Function que vai buscar o odómetro actual de cada veículo à
// API da Cartrack e actualiza `veiculos.km_atual` / `km_atual_em`.
// Não mexe em nada dos registos de pneus (kms_mont/kms_desmont
// continuam 100% manuais) — isto é só uma referência informativa.
//
// Segredos necessários (Supabase Dashboard → Edge Functions → Secrets):
//   CARTRACK_USERNAME   ex: TRAN00108
//   CARTRACK_PASSWORD   a password gerada em Definições da API
//   CARTRACK_REGION     ex: pt  (define o base URL fleetapi-<região>.cartrack.com)
//   CARTRACK_EMPRESA_ID  uuid da empresa cujos veículos sincronizar
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injectados
// automaticamente pelo Supabase em toda a Edge Function — não é
// preciso configurá-los à parte.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CARTRACK_USERNAME  = Deno.env.get("CARTRACK_USERNAME")  ?? "";
const CARTRACK_PASSWORD  = Deno.env.get("CARTRACK_PASSWORD")  ?? "";
const CARTRACK_REGION    = Deno.env.get("CARTRACK_REGION")    ?? "pt";
const CARTRACK_EMPRESA_ID = Deno.env.get("CARTRACK_EMPRESA_ID") ?? "";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CARTRACK_BASE = `https://fleetapi-${CARTRACK_REGION}.cartrack.com/rest`;

// Confirmado num teste real: a resposta vem em
// {"data": {"current_odometer_value": <metros>, "end_odometer_value": <metros>, ...}}
// — os valores estão em METROS, por isso dividimos por 1000 para km.
// "current_odometer_value" é o mais actual (ligeiramente à frente do
// fim do período pedido); "end_odometer_value" fica como reserva.
function extrairOdometro(payload: unknown): number | null {
  if (payload == null || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const data = (obj.data && typeof obj.data === "object") ? (obj.data as Record<string, unknown>) : obj;

  const candidatos = ["current_odometer_value", "end_odometer_value", "start_odometer_value"];
  for (const chave of candidatos) {
    const v = data[chave];
    if (typeof v === "number") return v / 1000;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v) / 1000;
  }
  return null;
}

Deno.serve(async (req) => {
  if (!CARTRACK_USERNAME || !CARTRACK_PASSWORD) {
    return new Response(JSON.stringify({ erro: "CARTRACK_USERNAME/CARTRACK_PASSWORD não configurados." }), { status: 500 });
  }
  if (!CARTRACK_EMPRESA_ID) {
    return new Response(JSON.stringify({ erro: "CARTRACK_EMPRESA_ID não configurado." }), { status: 500 });
  }

  // Enquanto ajustamos o formato do pedido: ?limite=1 na URL testa só o
  // primeiro veículo, para não gastar 66 pedidos por cada teste.
  const url = new URL(req.url);
  const limite = parseInt(url.searchParams.get("limite") ?? "") || null;

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let query = sb
    .from("veiculos")
    .select("id, matricula")
    .eq("empresa_id", CARTRACK_EMPRESA_ID)
    .eq("ativo", true);
  if (limite) query = query.limit(limite);

  const { data: veiculos, error: errV } = await query;

  if (errV) {
    return new Response(JSON.stringify({ erro: errV.message }), { status: 500 });
  }

  const auth = "Basic " + btoa(`${CARTRACK_USERNAME}:${CARTRACK_PASSWORD}`);
  const resultados: Record<string, unknown>[] = [];

  // Período consultado: últimos 7 dias até agora — queremos o odómetro
  // mais recente (fim do período), não interessa tanto o início.
  // A Cartrack quer o formato "Y-m-d H:i:s" (ex: 2026-08-10 16:19:45),
  // não ISO 8601 — daí o formatador manual em vez de toISOString().
  function formatarData(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
      + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }

  const agora        = new Date();
  const hasSeteDias  = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const endTimestamp   = formatarData(agora);
  const startTimestamp = formatarData(hasSeteDias);

  async function sincronizarVeiculo(v: { id: number; matricula: string }) {
    try {
      const pedidoUrl = `${CARTRACK_BASE}/vehicles/${encodeURIComponent(v.matricula)}/odometer`
        + `?start_timestamp=${encodeURIComponent(startTimestamp)}&end_timestamp=${encodeURIComponent(endTimestamp)}`;
      const resp = await fetch(pedidoUrl, {
        headers: { Authorization: auth },
      });

      if (!resp.ok) {
        const corpo = await resp.text();
        return { matricula: v.matricula, ok: false, status: resp.status, corpo };
      }

      const payload = await resp.json();
      const km = extrairOdometro(payload);

      if (km == null) {
        return { matricula: v.matricula, ok: false, motivo: "campo de odómetro não reconhecido", payload };
      }

      const { error: errU } = await sb
        .from("veiculos")
        .update({ km_atual: Math.round(km), km_atual_em: new Date().toISOString() })
        .eq("id", v.id);

      return { matricula: v.matricula, ok: !errU, km_atual: Math.round(km), erro: errU?.message };
    } catch (e) {
      return { matricula: v.matricula, ok: false, erro: String(e) };
    }
  }

  // Processa em lotes de 8 em paralelo, em vez de um a um, para caber
  // dentro do tempo de execução permitido pela função.
  const LOTE = 8;
  const lista = veiculos ?? [];
  for (let i = 0; i < lista.length; i += LOTE) {
    const lote = lista.slice(i, i + LOTE);
    const respostas = await Promise.all(lote.map(sincronizarVeiculo));
    resultados.push(...respostas);
  }

  return new Response(JSON.stringify({ total: veiculos?.length ?? 0, resultados }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
