// ── LÓGICA PARTILHADA DE SINCRONIZAÇÃO DE EMAIL ─────────────────────
// Usada por email-sync (cron/admin, todas as integrações) e
// email-sync-manual (autenticado, só a integração do próprio
// utilizador) — a lógica de sincronizar UMA integração é exactamente a
// mesma nos dois casos, só muda quem decide QUAIS integrações correr.

import type { AdaptadorEmail, TokensEmail } from "./email-tipos.ts";
import { outlook } from "./outlook.ts";
import { imap } from "./imap.ts";
import { pareceFatura } from "./filtro-email.ts";

export const ADAPTADORES_EMAIL: Record<string, AdaptadorEmail> = {
  outlook,
  imap,
};

const JANELA_PRIMEIRA_SINCRONIZACAO_DIAS = 30;
const SOBREPOSICAO_HORAS = 1;

export interface IntegracaoEmail {
  id: number;
  empresa_id: string;
  fornecedor: string;
  tokens: TokensEmail;
  ultima_sincronizacao: string | null;
}

// `sb` é o cliente Supabase (service role) já criado pelo chamador.
export async function sincronizarIntegracao(sb: any, integ: IntegracaoEmail) {
  const adaptador = ADAPTADORES_EMAIL[integ.fornecedor];
  if (!adaptador) {
    return { empresa_id: integ.empresa_id, fornecedor: integ.fornecedor, ok: false, erro: `fornecedor "${integ.fornecedor}" sem adaptador registado` };
  }

  // Renovar o token se estiver perto de expirar (só se aplica a
  // adaptadores OAuth — credenciais directas como IMAP não têm expires_at).
  let tokens = integ.tokens;
  if (tokens.expires_at) {
    const expiraEm = new Date(tokens.expires_at).getTime();
    if (expiraEm - Date.now() < 5 * 60 * 1000) {
      try {
        tokens = await adaptador.atualizarToken(tokens);
        await sb.from("integracoes_email").update({ tokens }).eq("id", integ.id);
      } catch (e) {
        // Token de refresh inválido/revogado — marcar a integração como
        // precisando de reconexão em vez de continuar a falhar em silêncio.
        await sb.from("integracoes_email").update({ ativo: false }).eq("id", integ.id);
        return { empresa_id: integ.empresa_id, fornecedor: integ.fornecedor, ok: false, erro: `token inválido, integração desligada: ${String(e)}` };
      }
    }
  }

  const desde = integ.ultima_sincronizacao
    ? new Date(new Date(integ.ultima_sincronizacao).getTime() - SOBREPOSICAO_HORAS * 60 * 60 * 1000)
    : new Date(Date.now() - JANELA_PRIMEIRA_SINCRONIZACAO_DIAS * 24 * 60 * 60 * 1000);

  const { data: fornecedores } = await sb
    .from("fornecedores")
    .select("dominio_email")
    .eq("empresa_id", integ.empresa_id)
    .not("dominio_email", "is", null);
  const dominiosConhecidos: string[] = (fornecedores ?? []).map((f: any) => f.dominio_email);

  const mensagens = await adaptador.listarMensagensRecentes(tokens, desde, dominiosConhecidos);

  // Verifica assunto, resumo do corpo e nomes dos anexos — não só o
  // assunto — para não deixar escapar facturas com assunto vago.
  const candidatas = mensagens.filter(m =>
    pareceFatura(m.remetente, [m.assunto, m.resumoCorpo, ...m.anexosPdf.map(a => a.nome)], dominiosConhecidos)
  );

  if (candidatas.length === 0) {
    await sb.from("integracoes_email").update({ ultima_sincronizacao: new Date().toISOString() }).eq("id", integ.id);
    return { empresa_id: integ.empresa_id, fornecedor: integ.fornecedor, ok: true, novos: 0 };
  }

  const { data: jaVistos } = await sb
    .from("emails_fornecedores_pendentes")
    .select("mensagem_id")
    .eq("empresa_id", integ.empresa_id)
    .in("mensagem_id", candidatas.map(m => m.id));
  const idsVistos = new Set((jaVistos ?? []).map((r: any) => r.mensagem_id));

  let novos = 0;
  for (const m of candidatas) {
    if (idsVistos.has(m.id)) continue;

    let pdfPath: string | null = null;
    try {
      const anexo = m.anexosPdf[0]; // só o primeiro PDF — suficiente para o objectivo (ter a factura à mão)
      const bytes = await adaptador.obterAnexoPdf(tokens, m.idInterno, anexo.id);
      pdfPath = `${integ.empresa_id}/emails/${encodeURIComponent(m.id)}.pdf`;
      const { error: errUp } = await sb.storage.from("faturas-pdf").upload(pdfPath, bytes, { contentType: "application/pdf" });
      if (errUp) { pdfPath = null; }
    } catch {
      pdfPath = null; // fica sem PDF anexado, mas ainda vale a pena listar o email
    }

    const { error: errIns } = await sb.from("emails_fornecedores_pendentes").insert({
      empresa_id: integ.empresa_id,
      integracao_id: integ.id,
      mensagem_id: m.id,
      remetente: m.remetente,
      assunto: m.assunto,
      data_recebido: m.dataRecebido,
      pdf_path: pdfPath,
    });
    if (!errIns) novos++;
  }

  await sb.from("integracoes_email").update({ ultima_sincronizacao: new Date().toISOString() }).eq("id", integ.id);

  return { empresa_id: integ.empresa_id, fornecedor: integ.fornecedor, ok: true, total_candidatas: candidatas.length, novos };
}
