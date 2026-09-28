// ── LÓGICA PARTILHADA DE SINCRONIZAÇÃO DE TELEMETRIA ─────────────────
// Usada por telemetria-sync (cron/admin, todas as integrações) e
// telemetria-sync-manual (autenticado, só a integração do próprio
// utilizador) — sincronizar UMA integração é exactamente a mesma
// lógica nos dois casos, só muda quem decide QUAIS integrações correr.

import type { AdaptadorTelemetria } from "./telemetria-tipos.ts";
import { cartrack } from "./cartrack.ts";

export const ADAPTADORES_TELEMETRIA: Record<string, AdaptadorTelemetria> = {
  cartrack,
};

export interface IntegracaoTelemetria {
  id: number;
  empresa_id: string;
  fornecedor: string;
  credenciais: Record<string, unknown>;
}

// `sb` é o cliente Supabase (service role) já criado pelo chamador.
export async function sincronizarIntegracaoTelemetria(sb: any, integ: IntegracaoTelemetria, limite?: number | null) {
  const adaptador = ADAPTADORES_TELEMETRIA[integ.fornecedor];
  if (!adaptador) {
    return { empresa_id: integ.empresa_id, fornecedor: integ.fornecedor, ok: false, erro: `fornecedor "${integ.fornecedor}" sem adaptador registado` };
  }

  let veiculosQuery = sb
    .from("veiculos")
    .select("id, matricula")
    .eq("empresa_id", integ.empresa_id)
    .eq("ativo", true);
  if (limite) veiculosQuery = veiculosQuery.limit(limite);

  const { data: veiculos, error: errV } = await veiculosQuery;
  if (errV) {
    return { empresa_id: integ.empresa_id, fornecedor: integ.fornecedor, ok: false, erro: errV.message };
  }

  async function sincronizarVeiculo(v: { id: number; matricula: string }) {
    try {
      const leitura = await adaptador.obterOdometro(v.matricula, integ.credenciais);
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

  await sb.from("integracoes_telemetria").update({ ultima_sincronizacao: new Date().toISOString() }).eq("id", integ.id);

  return { empresa_id: integ.empresa_id, fornecedor: integ.fornecedor, ok: true, total: lista.length, resultados: resultadosVeiculos };
}
