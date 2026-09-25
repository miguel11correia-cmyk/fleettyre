// ── ADAPTADOR IMAP ────────────────────────────────────────────────
// Para empresas cujo email não é Microsoft 365/Google Workspace a
// sério — liga directamente ao servidor de email do alojamento do
// domínio, por IMAP com TLS implícito (porta 993, o mais comum).
//
// Ao contrário do Outlook, não há OAuth: a ligação faz-se com
// utilizador/password directos (ver email-imap-ligar), e os métodos
// de OAuth deste adaptador nunca são chamados — lançam erro se o forem,
// só para apanhar um eventual erro de programação cedo.
//
// Diferença de custo importante face ao Graph: aqui não há forma barata
// de saber se uma mensagem tem anexo PDF sem a descarregar por inteiro,
// por isso o filtro por palavra-chave/domínio é aplicado ANTES de
// descarregar cada mensagem candidata (usando só os cabeçalhos, que são
// leves), em vez de depois como no resto da app.

import type { AdaptadorEmail, MensagemEmailCandidata, TokensEmail } from "./email-tipos.ts";
import { ClienteIMAP } from "./imap-cliente.ts";
import { descodificarTextoCabecalho, extrairPrimeiroPdf, parsearCabecalhos } from "./mime-parser.ts";
import { pareceFatura } from "./filtro-email.ts";

// Os PDFs já extraídos ficam aqui durante a sincronização, para
// obterAnexoPdf não ter de descarregar a mensagem outra vez — válido só
// durante uma execução da função (memória do módulo, reinicia a cada
// invocação da Edge Function).
const cachePdfs = new Map<string, Uint8Array>();

function extrairEndereco(cabecalhoFrom: string): string {
  const m = /<([^>]+)>/.exec(cabecalhoFrom);
  return (m ? m[1] : cabecalhoFrom).trim();
}

export const imap: AdaptadorEmail = {
  obterUrlAutorizacao(): string {
    throw new Error("O adaptador IMAP não usa OAuth — ver email-imap-ligar.");
  },
  async trocarCodigoPorTokens(): Promise<TokensEmail> {
    throw new Error("O adaptador IMAP não usa OAuth — ver email-imap-ligar.");
  },
  async atualizarToken(tokens: TokensEmail): Promise<TokensEmail> {
    return tokens; // credenciais directas não "expiram" no sentido OAuth
  },

  async listarMensagensRecentes(tokens, desde, dominiosConhecidos): Promise<MensagemEmailCandidata[]> {
    const host = String(tokens.host ?? "");
    const port = Number(tokens.port ?? 993);
    const usuario = String(tokens.usuario ?? "");
    const password = String(tokens.password ?? "");
    if (!host || !usuario || !password) return [];

    const cliente = await ClienteIMAP.ligar(host, port);
    try {
      await cliente.login(usuario, password);
      await cliente.selecionarInbox();

      const uids = await cliente.pesquisarDesde(desde);
      const mensagens: MensagemEmailCandidata[] = [];

      for (const uid of uids) {
        const cabecalhosTexto = await cliente.obterCabecalhos(uid);
        if (!cabecalhosTexto) continue;

        const cabecalhos = parsearCabecalhos(cabecalhosTexto);
        const remetente = extrairEndereco(cabecalhos["from"] || "");
        const assunto = descodificarTextoCabecalho(cabecalhos["subject"] || "");
        const messageId = (cabecalhos["message-id"] || "").trim();
        if (!messageId) continue;

        // Filtra ANTES de descarregar a mensagem inteira — descarregar
        // tudo seria caro e desnecessário para a maioria dos emails.
        if (!pareceFatura(remetente, assunto, dominiosConhecidos)) continue;

        let mensagemCompleta: Uint8Array;
        try {
          mensagemCompleta = await cliente.obterMensagemCompleta(uid);
        } catch {
          continue;
        }

        const anexo = extrairPrimeiroPdf(mensagemCompleta);
        if (!anexo) continue; // sem PDF, não interessa guardar

        cachePdfs.set(messageId, anexo.bytes);

        mensagens.push({
          id: messageId,
          idInterno: uid,
          remetente,
          assunto,
          dataRecebido: cabecalhos["date"] ? new Date(cabecalhos["date"]).toISOString() : new Date().toISOString(),
          anexosPdf: [{ id: messageId, nome: anexo.nome }],
        });
      }

      return mensagens;
    } finally {
      await cliente.fechar();
    }
  },

  async obterAnexoPdf(_tokens, _idInternoMensagem, anexoId): Promise<Uint8Array> {
    const bytes = cachePdfs.get(anexoId);
    if (!bytes) throw new Error("PDF não encontrado em cache — a mensagem já não está disponível para descarregar de novo nesta sincronização.");
    cachePdfs.delete(anexoId);
    return bytes;
  },
};
