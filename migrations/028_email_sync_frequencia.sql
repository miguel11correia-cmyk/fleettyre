-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: aumenta a frequência da sincronização
-- automática de emails de fornecedores, de 6 em 6 horas para 15 em 15
-- minutos.
--
-- Porquê: várias pessoas têm acesso à caixa de correio e têm o hábito
-- de arquivar manualmente as facturas para pastas locais do Outlook
-- (.pst) assim que chegam — uma vez movidas para lá, deixam de existir
-- no servidor e a sincronização (que só lê o servidor por IMAP) já não
-- as consegue ver. Correr com mais frequência reduz a janela de tempo
-- em que isso pode acontecer antes de a sincronização ver a mensagem.
--
-- Seguro no plano Free do Supabase: 15 em 15 min são ~2.880
-- invocações/mês, muito abaixo do limite de 500.000/mês incluídas. A
-- arquitectura actual (BODYSTRUCTURE/ENVELOPE, sem descarregar
-- mensagens completas) também torna cada sincronização periódica leve
-- depois da primeira (que cobre os 6 meses todos).
-- ══════════════════════════════════════════════════════════════════

-- UPDATE directo em cron.job falha por permissões ("permission denied
-- for table job") — a tabela só é editável pelas próprias funções do
-- pg_cron. cron.alter_job() é o caminho correcto.
--
-- 1. Descobre o job_id:
--    select jobid, jobname, schedule from cron.job where jobname = 'email-sync-periodico';
-- 2. Aplica a alteração (substitui 8 pelo jobid devolvido acima):
select cron.alter_job(job_id := 8, schedule := '*/15 * * * *');

-- Para confirmar:
-- select jobname, schedule from cron.job where jobname = 'email-sync-periodico';
