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
// Caminho normal (a maioria das mensagens): o BODYSTRUCTURE (pedido em
// lote, sem descarregar conteúdo) já diz exactamente em que parte MIME
// está o texto e em que parte está um eventual PDF. Pede-se só a parte
// de TEXTO (pequena) para decidir relevância (pareceFatura) — o PDF em
// si só é descarregado para mensagens que já passaram esse filtro. Numa
// caixa geral, a esmagadora maioria das mensagens com algum PDF
// (electricidade, seguros, software, ...) nunca chega a ter o anexo
// descarregado, porque o assunto/corpo não bate com nenhum fornecedor
// nem palavra de pneus — é aqui que está a poupança real de CPU/memória
// face a descarregar sempre a mensagem completa.
//
// Rede de segurança: se o BODYSTRUCTURE não permitir identificar com
// confiança a parte do PDF (estrutura exótica que o parser não cobre),
// cai-se para descarregar a mensagem completa dessa mensagem específica
// em vez de arriscar perder uma factura — deve ser raro.

import type { AdaptadorEmail, MensagemEmailCandidata, ResultadoListagem, TokensEmail } from "./email-tipos.ts";
import { ClienteIMAP } from "./imap-cliente.ts";
import {
  descodificarCorpo,
  descodificarQuotedPrintable,
  descodificarTextoCabecalho,
  extrairPrimeiroPdf,
  extrairResumoTexto,
  parsearCabecalhos,
  removerTags,
} from "./mime-parser.ts";
import { pareceFatura, remetenteBateComFornecedor, remetenteBateComFornecedorPorNome } from "./filtro-email.ts";

// Os PDFs já extraídos ficam aqui durante a sincronização, para
// obterAnexoPdf não ter de descarregar a mensagem outra vez — válido só
// durante uma execução da função (limpa-se no início de cada chamada,
// porque a Edge Function pode reaproveitar a mesma instância "quente"
// entre invocações).
const cachePdfs = new Map<string, Uint8Array>();

const TAMANHO_RESUMO = 800;

function extrairEndereco(cabecalhoFrom: string): string {
  const m = /<([^>]+)>/.exec(cabecalhoFrom);
  return (m ? m[1] : cabecalhoFrom).trim();
}

// Do cabeçalho bruto "From: \"Sobral Pneus\" <geral@moloni.pt>" extrai só
// o nome de exibição ("Sobral Pneus") — usado no caminho de segurança
// (mensagem completa), onde não há ENVELOPE já parseado com o nome à parte.
function extrairNomeExibicao(cabecalhoFrom: string): string {
  const semEndereco = cabecalhoFrom.replace(/<[^>]*>/, "").trim();
  return semEndereco.replace(/^"|"$/g, "").trim();
}

// Decodifica uma parte de texto (plain ou html) já isolada pelo
// BODYSTRUCTURE — mesma lógica de descodificação usada em
// extrairResumoTexto, mas aplicada directamente aos bytes de UMA parte
// específica, já pedida sozinha (sem descarregar a mensagem toda).
function decodificarParteTexto(bytes: Uint8Array, codificacao: string, tipo: string): string {
  const decodificados = descodificarCorpo(bytes, codificacao);
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(decodificados);
  } catch {
    texto = new TextDecoder("latin1").decode(decodificados);
  }
  if (codificacao.toLowerCase() === "quoted-printable") {
    texto = descodificarQuotedPrintable(texto);
  }
  if (tipo === "html") {
    texto = removerTags(texto);
  }
  return texto.slice(0, TAMANHO_RESUMO);
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

  async listarMensagensRecentes(tokens, desde, dominiosConhecidos, nomesFornecedores): Promise<ResultadoListagem> {
    const host = String(tokens.host ?? "");
    const port = Number(tokens.port ?? 993);
    const usuario = String(tokens.usuario ?? "");
    const password = String(tokens.password ?? "");
    if (!host || !usuario || !password) return { mensagens: [], completo: true };

    cachePdfs.clear();

    const cliente = await ClienteIMAP.ligar(host, port);
    try {
      await cliente.login(usuario, password);

      // Além da INBOX, lê também a Archive — esta caixa arquiva
      // automaticamente mensagens lidas mais antigas para lá (confirmado
      // por diagnóstico), o que fazia com que facturas de fornecedores de
      // há mais de uns dias nunca fossem vistas por esta sincronização
      // (só olhava a INBOX). Sent/Trash/Junk/spam/Drafts não interessam —
      // não é lá que chegam facturas de fornecedores.
      const PASTAS_A_LER = ["INBOX", "INBOX.Archive"];

      // Verificação em lotes (ver ClienteIMAP.verificarMensagens) — um
      // único pedido à rede por lote, não um por mensagem.
      const LOTE_VERIFICACAO = 100;

      // Rede de segurança — não deve ser atingido em uso normal, já que
      // só se descarrega o PDF de mensagens já confirmadas como
      // relevantes. `completo: false` + `ateData` dizem ao chamador para
      // não avançar `ultima_sincronizacao` até "agora" — a sincronização
      // seguinte continua exactamente daqui.
      const LIMITE_DESCARGAS_PDF = 150;
      let descarregadas = 0;

      const mensagens: MensagemEmailCandidata[] = [];
      let ultimaDataExaminada: Date | null = null;
      let completo = true;
      let examinadas = 0;
      let totalNaJanela = 0;

      pastaExterna:
      for (const pasta of PASTAS_A_LER) {
        try {
          if (pasta === "INBOX") await cliente.selecionarInbox();
          else await cliente.selecionarPasta(pasta);
        } catch (e) {
          console.error(`IMAP: não foi possível abrir a pasta "${pasta}" (pode não existir nesta caixa): ${String(e)}`);
          continue; // pasta pode simplesmente não existir — segue para a seguinte
        }

        const uidsBrutos = await cliente.pesquisarDesde(desde);
        // Mais antigas primeiro — para o progresso, se o limite de
        // segurança abaixo alguma vez obrigar a parar a meio, avançar
        // sempre para a frente no tempo (nunca voltar atrás nem saltar
        // mensagens por analisar).
        const uids = [...uidsBrutos].sort((a, b) => Number(a) - Number(b));
        totalNaJanela += uids.length;
        console.log(`IMAP: ${uids.length} mensagens na janela desde ${desde.toISOString()} (pasta "${pasta}")`);

      loteExterno:
      for (let i = 0; i < uids.length; i += LOTE_VERIFICACAO) {
        const lote = uids.slice(i, i + LOTE_VERIFICACAO);
        let infos;
        try {
          infos = await cliente.verificarMensagens(lote);
        } catch {
          continue; // falha no lote todo — avança para o seguinte, não pára a sincronização toda
        }

        for (const uid of lote) {
          const info = infos.get(uid);
          if (info) examinadas++;
          // Diagnostico temporario: mostra TODOS os emails de um dominio
          // registado, tenham ou nao PDF, para confirmar se a extracao do
          // remetente (ENVELOPE) esta a funcionar.
          if (info && (remetenteBateComFornecedor(info.remetente, dominiosConhecidos) || remetenteBateComFornecedorPorNome(info.remetenteNome, nomesFornecedores))) {
            console.log(`IMAP: encontrado email de fornecedor conhecido — de "${info.remetenteNome}" <${info.remetente}>, temPdf: ${info.temPdf}, partePdf: ${info.partePdf ?? "não identificada (cai no caminho de segurança)"}, messageId: ${info.messageId ? "presente" : "AUSENTE"}, assunto "${info.assunto}"`);
          }
          if (info?.dataRecebido) ultimaDataExaminada = info.dataRecebido;
          if (!info || !info.temPdf) continue; // sem PDF, não interessa — condição obrigatória do filtro

          let messageId = (info.messageId || "").trim();
          if (!messageId) {
            // ENVELOPE não trouxe o Message-ID (ver obterCabecalhoMessageId) —
            // tenta pedi-lo directamente antes de desistir da mensagem.
            try {
              messageId = (await cliente.obterCabecalhoMessageId(uid)).trim();
            } catch (e) {
              console.error(`IMAP: falha a obter Message-ID em separado para UID ${uid}: ${String(e)}`);
            }
            if (!messageId) {
              // Último recurso: o remetente simplesmente não gerou um
              // cabeçalho Message-ID (confirmado — o pedido directo devolve
              // só o CRLF final, não é falha nossa). Em vez de perder a
              // factura, usa o UID do IMAP como identificador sintético —
              // estável dentro desta caixa de correio (só muda se o
              // servidor recriar a mailbox do zero, raro).
              messageId = `imap-uid:${uid}`;
              console.error(`IMAP: UID ${uid} sem Message-ID nenhum (nem ENVELOPE nem cabeçalho em separado) — a usar id sintético "${messageId}" (de "${info.remetenteNome}" <${info.remetente}>, assunto "${info.assunto}").`);
            }
          }

          const assunto = descodificarTextoCabecalho(info.assunto || "");

          if (info.partePdf) {
            // Caminho normal: já sabemos onde está o texto e onde está o
            // PDF — pede só o texto (pequeno) para decidir relevância,
            // sem nunca tocar no PDF de mensagens irrelevantes.
            let resumoCorpo = "";
            if (info.parteTexto) {
              try {
                const bytesTexto = await cliente.obterParte(uid, info.parteTexto);
                resumoCorpo = decodificarParteTexto(bytesTexto, info.codificacaoTexto, info.tipoTexto);
              } catch (e) {
                console.error(`IMAP: falha a obter parte de texto ${info.parteTexto} da mensagem UID ${uid}: ${String(e)}`);
                resumoCorpo = "";
              }
            }

            if (!pareceFatura(info.remetente, info.remetenteNome, [assunto, resumoCorpo, info.nomePdf], dominiosConhecidos, nomesFornecedores)) {
              continue; // irrelevante — nunca descarrega o PDF, é a poupança principal desta arquitectura
            }

            if (descarregadas >= LIMITE_DESCARGAS_PDF) {
              completo = false;
              console.log(`IMAP: limite de ${LIMITE_DESCARGAS_PDF} PDFs atingido — a continuar a partir de ${ultimaDataExaminada?.toISOString() ?? "?"} na próxima sincronização.`);
              break pastaExterna;
            }

            try {
              const bytesPdf = await cliente.obterParte(uid, info.partePdf);
              const pdfDecodificado = descodificarCorpo(bytesPdf, info.codificacaoPdf);
              descarregadas++;
              cachePdfs.set(messageId, pdfDecodificado);
              mensagens.push({
                id: messageId,
                idInterno: uid,
                remetente: info.remetente,
                remetenteNome: info.remetenteNome,
                assunto,
                resumoCorpo,
                dataRecebido: (info.dataRecebido ?? new Date()).toISOString(),
                anexosPdf: [{ id: messageId, nome: info.nomePdf || "anexo.pdf" }],
              });
            } catch (e) {
              console.error(`IMAP: falha a descarregar PDF (parte ${info.partePdf}) da mensagem UID ${uid}: ${String(e)}`);
            }
            continue;
          }

          // Rede de segurança: o BODYSTRUCTURE indicou "tem PDF" (pelo
          // sinal de texto simples) mas não foi possível identificar com
          // confiança a parte exacta — cai para o caminho antigo
          // (descarregar a mensagem completa), em vez de arriscar perder
          // esta factura. Devia ser raro.
          if (descarregadas >= LIMITE_DESCARGAS_PDF) {
            completo = false;
            console.log(`IMAP: limite de ${LIMITE_DESCARGAS_PDF} PDFs atingido — a continuar a partir de ${ultimaDataExaminada?.toISOString() ?? "?"} na próxima sincronização.`);
            break pastaExterna;
          }

          let mensagemCompleta: Uint8Array;
          try {
            mensagemCompleta = await cliente.obterMensagemCompleta(uid);
          } catch (e) {
            console.error(`IMAP: falha a obter mensagem completa (caminho de segurança) UID ${uid}: ${String(e)}`);
            continue;
          }

          const anexo = extrairPrimeiroPdf(mensagemCompleta);
          if (!anexo) {
            console.error(`IMAP: caminho de segurança UID ${uid} — BODYSTRUCTURE não identificou PDF e extrairPrimeiroPdf também não encontrou nenhum na mensagem completa.`);
            continue;
          }

          const textoCompleto = new TextDecoder("latin1").decode(mensagemCompleta);
          const cabecalhos = parsearCabecalhos(textoCompleto.split(/\r\n\r\n/)[0]);
          const remetenteFallback = info.remetente || extrairEndereco(cabecalhos["from"] || "");
          const remetenteNomeFallback = info.remetenteNome || descodificarTextoCabecalho(extrairNomeExibicao(cabecalhos["from"] || ""));
          const assuntoFallback = assunto || descodificarTextoCabecalho(cabecalhos["subject"] || "");
          const resumoCorpoFallback = extrairResumoTexto(mensagemCompleta);

          if (!pareceFatura(remetenteFallback, remetenteNomeFallback, [assuntoFallback, resumoCorpoFallback, anexo.nome], dominiosConhecidos, nomesFornecedores)) {
            continue;
          }

          descarregadas++;
          cachePdfs.set(messageId, anexo.bytes);
          mensagens.push({
            id: messageId,
            idInterno: uid,
            remetente: remetenteFallback,
            remetenteNome: remetenteNomeFallback,
            assunto: assuntoFallback,
            resumoCorpo: resumoCorpoFallback,
            dataRecebido: cabecalhos["date"] ? new Date(cabecalhos["date"]).toISOString() : (info.dataRecebido ?? new Date()).toISOString(),
            anexosPdf: [{ id: messageId, nome: anexo.nome }],
          });
        }
      }
      } // fim do for de pastas (pastaExterna)

      console.log(`IMAP: ${examinadas}/${totalNaJanela} mensagens examinadas (todas as pastas), ${mensagens.length} factura(s) encontrada(s), janela ${completo ? "completa" : "incompleta — continua na próxima sincronização"}.`);

      return {
        mensagens,
        completo,
        ateData: completo ? undefined : (ultimaDataExaminada ?? undefined),
        totalNaJanela,
        examinadas,
      };
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
