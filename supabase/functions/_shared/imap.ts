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
// Ao contrário do Graph, o filtro de assunto/corpo aqui exige descarregar
// a mensagem completa (não há um "$select" barato) — por isso descarrega-
// se sempre o corpo todo de cada candidato dentro da janela de datas
// (troca desempenho por não deixar escapar nenhuma factura, decisão
// explícita do utilizador). Antes disso, uma verificação BODYSTRUCTURE em
// lote (ClienteIMAP.verificarMensagens) descarta mensagens sem nenhum
// anexo — a maioria do correio normal de uma caixa geral — sem custo de
// CPU significativo, já que ter PDF é de qualquer forma condição
// obrigatória.
// O filtro de palavra-chave/domínio corre depois, fora daqui, em
// email-sync-logica.ts.
//
// Ainda assim, uma caixa geral pode ter muitas mensagens COM algum PDF
// sem serem de pneus (electricidade, seguros, ...), que só se sabe ao
// descarregar por inteiro — por isso há um limite de descargas completas
// por chamada (ver LIMITE_DESCARGAS_COMPLETAS). Quando atingido, devolve
// `completo: false` + `ateData`, para a sincronização seguinte continuar
// exactamente dali em vez de saltar para "agora" e perder o resto da
// janela.

import type { AdaptadorEmail, MensagemEmailCandidata, ResultadoListagem, TokensEmail } from "./email-tipos.ts";
import { ClienteIMAP } from "./imap-cliente.ts";
import { descodificarTextoCabecalho, extrairPrimeiroPdf, extrairResumoTexto, parsearCabecalhos } from "./mime-parser.ts";

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

  async listarMensagensRecentes(tokens, desde): Promise<ResultadoListagem> {
    const host = String(tokens.host ?? "");
    const port = Number(tokens.port ?? 993);
    const usuario = String(tokens.usuario ?? "");
    const password = String(tokens.password ?? "");
    if (!host || !usuario || !password) return { mensagens: [], completo: true };

    const cliente = await ClienteIMAP.ligar(host, port);
    try {
      await cliente.login(usuario, password);
      await cliente.selecionarInbox();

      const uidsBrutos = await cliente.pesquisarDesde(desde);
      // Mais antigas primeiro — para o progresso, quando o limite abaixo
      // obriga a parar a meio, avançar sempre para a frente no tempo
      // (nunca voltar atrás nem saltar mensagens por analisar).
      const uids = [...uidsBrutos].sort((a, b) => Number(a) - Number(b));
      console.log(`IMAP: ${uids.length} mensagens na janela desde ${desde.toISOString()}`);

      // Verificação barata em lotes (ver ClienteIMAP.verificarMensagens) —
      // um único pedido à rede por lote, não um por mensagem, porque este
      // cliente não faz pipelining e centenas/milhares de round-trips
      // sequenciais já custa CPU a mais por si só, antes sequer de chegar
      // ao passo de descarregar mensagens completas.
      const LOTE_VERIFICACAO = 100;

      // Limite de segurança: descarregar a mensagem completa é o passo
      // mais caro em CPU — numa caixa de correio geral (não só facturas),
      // muitos emails têm ALGUM PDF (electricidade, seguros, software,
      // ...) sem serem de pneus, e só se sabe ao analisar por inteiro.
      // Sem limite, uma janela grande (ex: primeira sincronização, 30
      // dias) pode exceder o orçamento de CPU da função. Quando atingido,
      // `completo: false` + `ateData` dizem ao chamador para não avançar
      // `ultima_sincronizacao` até "agora" — a próxima sincronização
      // continua exactamente daqui, em vez de saltar por cima do resto
      // da janela e perder essas mensagens para sempre.
      // Cada descarga fica em memória (cachePdfs) até email-sync-logica.ts
      // a consumir mais tarde — com várias facturas de alguns MB cada,
      // 60 de uma vez chegava a exceder o limite de memória da função
      // (confirmado num teste real). 20 é mais conservador.
      const LIMITE_DESCARGAS_COMPLETAS = 20;
      let descarregadas = 0;

      const mensagens: MensagemEmailCandidata[] = [];
      let ultimaDataExaminada: Date | null = null;
      let completo = true;

      loteExterno:
      for (let i = 0; i < uids.length; i += LOTE_VERIFICACAO) {
        const lote = uids.slice(i, i + LOTE_VERIFICACAO);
        let verificacoes: Map<string, { temPdf: boolean; dataRecebido: Date | null }>;
        try {
          verificacoes = await cliente.verificarMensagens(lote);
        } catch {
          continue; // falha no lote todo — avança para o seguinte, não pára a sincronização toda
        }

        for (const uid of lote) {
          const verificacao = verificacoes.get(uid);
          if (verificacao?.dataRecebido) ultimaDataExaminada = verificacao.dataRecebido;
          if (!verificacao || !verificacao.temPdf) continue;

          if (descarregadas >= LIMITE_DESCARGAS_COMPLETAS) {
            completo = false;
            console.log(`IMAP: limite de ${LIMITE_DESCARGAS_COMPLETAS} descargas completas atingido — a continuar a partir de ${ultimaDataExaminada?.toISOString() ?? "?"} na próxima sincronização.`);
            break loteExterno;
          }

          descarregadas++;
          let mensagemCompleta: Uint8Array;
          try {
            mensagemCompleta = await cliente.obterMensagemCompleta(uid);
          } catch {
            continue;
          }

          const anexo = extrairPrimeiroPdf(mensagemCompleta);
          if (!anexo) continue; // sem PDF, não interessa guardar

          const textoCompleto = new TextDecoder("latin1").decode(mensagemCompleta);
          const cabecalhos = parsearCabecalhos(textoCompleto.split(/\r\n\r\n/)[0]);

          const remetente = extrairEndereco(cabecalhos["from"] || "");
          const assunto = descodificarTextoCabecalho(cabecalhos["subject"] || "");
          const messageId = (cabecalhos["message-id"] || "").trim();
          if (!messageId) continue;

          cachePdfs.set(messageId, anexo.bytes);

          mensagens.push({
            id: messageId,
            idInterno: uid,
            remetente,
            assunto,
            resumoCorpo: extrairResumoTexto(mensagemCompleta),
            dataRecebido: cabecalhos["date"] ? new Date(cabecalhos["date"]).toISOString() : (verificacao.dataRecebido ?? new Date()).toISOString(),
            anexosPdf: [{ id: messageId, nome: anexo.nome }],
          });
        }
      }

      return { mensagens, completo, ateData: completo ? undefined : (ultimaDataExaminada ?? undefined) };
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
