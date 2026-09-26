// ── FILTRO DE EMAILS CANDIDATOS ──────────────────────────────────────
// Partilhado entre a lógica de sincronização (usa depois de listar as
// mensagens) e o adaptador IMAP (usa antes de descarregar o anexo, para
// não descarregar PDFs de mensagens claramente irrelevantes).
//
// Critério: tem de ter pelo menos um PDF anexado (isso já é garantido
// antes de chamar isto), e ALÉM disso bater com o remetente conhecido
// OU ter uma palavra-chave em qualquer um destes sítios — assunto,
// resumo do corpo, ou nome do ficheiro PDF. Verificar vários sítios em
// vez de só o assunto reduz a hipótese de deixar escapar uma factura
// real com assunto vago (ex: "Documento em anexo").

export const PALAVRAS_CHAVE_FATURA = [
  "fatura", "factura", "invoice",
  "pneu", "pneus", "tyre", "tire",
  "rechapagem", "recauchutagem",
];

function textoContemPalavraChave(texto: string): boolean {
  const s = (texto || "").toLowerCase();
  return PALAVRAS_CHAVE_FATURA.some(p => s.includes(p));
}

export function remetenteBateComFornecedor(remetente: string, dominios: string[]): boolean {
  const dominioRemetente = (remetente || "").split("@")[1]?.toLowerCase();
  if (!dominioRemetente) return false;
  return dominios.some(d => d && dominioRemetente === d.toLowerCase());
}

// `textos` = assunto, resumo do corpo, nomes dos anexos — o que estiver
// disponível; verifica-se cada um, basta um bater com uma palavra-chave.
export function pareceFatura(remetente: string, textos: string[], dominiosConhecidos: string[]): boolean {
  if (remetenteBateComFornecedor(remetente, dominiosConhecidos)) return true;
  return textos.some(t => textoContemPalavraChave(t));
}
