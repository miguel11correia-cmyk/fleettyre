// ── FILTRO DE EMAILS CANDIDATOS ──────────────────────────────────────
// Partilhado entre a lógica de sincronização (usa depois de listar as
// mensagens) e o adaptador IMAP (usa antes de descarregar o anexo, para
// não descarregar PDFs de mensagens claramente irrelevantes).
//
// Critério: tem de ter pelo menos um PDF anexado (isso já é garantido
// antes de chamar isto), e ALÉM disso ou o remetente é um fornecedor
// conhecido, ou o texto (assunto/corpo/nome do PDF) contém uma palavra
// ESPECÍFICA de pneus. Palavras genéricas de factura ("fatura",
// "invoice") sozinhas NÃO bastam — uma empresa recebe facturas de tudo
// (electricidade, seguros, software, etc.), e usá-las como único
// critério apanharia essas todas também. Só contam como reforço quando
// já há uma palavra específica de pneus no mesmo texto.

export const PALAVRAS_CHAVE_PNEUS = [
  "pneu", "pneus", "pneumático", "pneumáticos",
  "tyre", "tyres", "tire", "tires",
  "rechapagem", "recauchutagem",
];

function textoContemPalavraEspecifica(texto: string): boolean {
  const s = (texto || "").toLowerCase();
  return PALAVRAS_CHAVE_PNEUS.some(p => s.includes(p));
}

// Cada entrada em `identificadores` pode ser um domínio próprio de uma
// empresa (ex: "sobralpneus.pt") ou um email completo (ex:
// "jose@gmail.com") — necessário para fornecedores que usam um
// provedor partilhado (Gmail, Outlook.pt, Hotmail, etc.), onde o
// domínio sozinho apanharia qualquer pessoa que use esse provedor, não
// só o fornecedor em questão. Uma entrada com "@" é comparada ao
// endereço completo; sem "@", só ao domínio.
export function remetenteBateComFornecedor(remetente: string, identificadores: string[]): boolean {
  const remetenteLower  = (remetente || "").toLowerCase();
  const dominioRemetente = remetenteLower.split("@")[1];
  if (!dominioRemetente) return false;

  return identificadores.some(id => {
    if (!id) return false;
    const idLower = id.toLowerCase();
    return idLower.includes("@") ? remetenteLower === idLower : dominioRemetente === idLower;
  });
}

// `textos` = assunto, resumo do corpo, nomes dos anexos — o que estiver
// disponível; basta um deles conter uma palavra específica de pneus.
export function pareceFatura(remetente: string, textos: string[], dominiosConhecidos: string[]): boolean {
  if (remetenteBateComFornecedor(remetente, dominiosConhecidos)) return true;
  return textos.some(t => textoContemPalavraEspecifica(t));
}
