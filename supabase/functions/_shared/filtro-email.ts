// ── FILTRO DE EMAILS CANDIDATOS ──────────────────────────────────────
// Partilhado entre a lógica de sincronização (usa depois de listar as
// mensagens) e o adaptador IMAP (usa antes de descarregar a mensagem
// completa, para não gastar largura de banda com emails irrelevantes).

export const PALAVRAS_CHAVE_FATURA = [
  "fatura", "factura", "invoice",
  "pneu", "pneus", "tyre", "tire",
  "rechapagem", "recauchutagem",
];

export function assuntoParecevFatura(assunto: string): boolean {
  const s = (assunto || "").toLowerCase();
  return PALAVRAS_CHAVE_FATURA.some(p => s.includes(p));
}

export function remetenteBateComFornecedor(remetente: string, dominios: string[]): boolean {
  const dominioRemetente = (remetente || "").split("@")[1]?.toLowerCase();
  if (!dominioRemetente) return false;
  return dominios.some(d => d && dominioRemetente === d.toLowerCase());
}

export function pareceFatura(remetente: string, assunto: string, dominiosConhecidos: string[]): boolean {
  return remetenteBateComFornecedor(remetente, dominiosConhecidos) || assuntoParecevFatura(assunto);
}
