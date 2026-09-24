// ── TELEMETRIA SYNC ──────────────────────────────────────────────
// Edge Function genérica que percorre `integracoes_telemetria` (uma
// linha por empresa + fornecedor), usa o adaptador certo consoante o
// fornecedor, e actualiza `veiculos.km_atual` / `km_atual_em`. Não
// mexe em nada dos registos de pneus (kms_mont/kms_desmont continuam
// 100% manuais) — isto é só uma referência informativa.
//
// Substitui a antiga `cartrack-sync`, que estava fixa a uma única
// empresa (via segredo CARTRACK_EMPRESA_ID) e a um único fornecedor.
// Para adicionar um fornecedor novo: criar um adaptador em
// `_shared/<fornecedor>.ts` que cumpra AdaptadorTelemetria, e
// registá-lo no mapa ADAPTADORES abaixo.
//
// Parâmetros opcionais na URL (para testar sem mexer em todas as
// empresas de uma vez):
//   ?empresa_id=<uuid>   só sincroniza essa empresa
//   ?limite=<n>          só os primeiros N veículos dessa/essas empresas
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injectados
// automaticamente pelo Supabase em toda a Edge Function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cartrack } from "../_shared/cartrack.ts";
import type { AdaptadorTelemetria } from "../_shared/telemetria-tipos.ts";

const ADAPTADORES: Record<string, AdaptadorTelemetria> = {
  cartrack,
};

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url         = new URL(req.url);
  const empresaId   = url.searchParams.get("empresa_id");
  const limite      = parseInt(url.searchParams.get("limite") ?? "") || null;

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let query = sb
    .from("integracoes_telemetria")
    .select("id, empresa_id, fornecedor, credenciais")
    .eq("ativo", true);
  if (empresaId) query = query.eq("empresa_id", empresaId);

  const { data: integracoes, error: errI } = await query;
  if (errI) {
    return new Response(JSON.stringify({ erro: errI.message }), { status: 500 });
  }

  const resultadosPorIntegracao: Record<string, unknown>[] = [];

  for (const integ of integracoes ?? []) {
    const adaptador = ADAPTADORES[integ.fornecedor];
    if (!adaptador) {
      resultadosPorIntegracao.push({
        empresa_id: integ.empresa_id,
        fornecedor: integ.fornecedor,
        ok: false,
        erro: `fornecedor "${integ.fornecedor}" sem adaptador registado`,
      });
      continue;
    }

    let veiculosQuery = sb
      .from("veiculos")
      .select("id, matricula")
      .eq("empresa_id", integ.empresa_id)
      .eq("ativo", true);
    if (limite) veiculosQuery = veiculosQuery.limit(limite);

    const { data: veiculos, error: errV } = await veiculosQuery;
    if (errV) {
      resultadosPorIntegracao.push({
        empresa_id: integ.empresa_id,
        fornecedor: integ.fornecedor,
        ok: false,
        erro: errV.message,
      });
      continue;
    }

    async function sincronizarVeiculo(v: { id: number; matricula: string }) {
      try {
        const leitura = await adaptador.obterOdometro(v.matricula, integ.credenciais as Record<string, unknown>);
        if (!leitura) {
          return { matricula: v.matricula, ok: false, motivo: "sem leitura de odómetro" };
        }

        const { error: errU } = await sb
          .from("veiculos")
          .update({ km_atual: leitura.km, km_atual_em: leitura.em })
          .eq("id", v.id);

        return { matricula: v.matricula, ok: !errU, km_atual: leitura.km, erro: errU?.message };
      } catch (e) {
        return { matricula: v.matricula, ok: false, erro: String(e) };
      }
    }

    // Processa em lotes de 8 em paralelo, em vez de um a um, para caber
    // dentro do tempo de execução permitido pela função.
    const LOTE = 8;
    const lista = veiculos ?? [];
    const resultadosVeiculos: Record<string, unknown>[] = [];
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      const respostas = await Promise.all(lote.map(sincronizarVeiculo));
      resultadosVeiculos.push(...respostas);
    }

    resultadosPorIntegracao.push({
      empresa_id: integ.empresa_id,
      fornecedor: integ.fornecedor,
      total: lista.length,
      resultados: resultadosVeiculos,
    });
  }

  return new Response(JSON.stringify({ integracoes: resultadosPorIntegracao }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
