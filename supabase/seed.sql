-- Dados iniciais, vindos da planilha "Calculadora Financeira – Estagiários".
-- Não cria usuário: o login do SGEST é criado pelo dashboard (ver README).

set sgest.seed = 'on';

insert into public.valores (tipo, valor_centavos, divisor, vigencia_inicio, responsavel) values
  ('bolsa', 163953, 30, '2026-01-01', 'Seed inicial (planilha)'),
  ('at', 1350, null, '2026-01-01', 'Seed inicial (planilha)');

insert into public.anos_calendario (ano, responsavel) values (2026, 'Seed inicial (planilha)');

-- Aba "Feriados e Ptos Fac. Senado". A planilha só traz as datas: descrição e
-- tipo foram preenchidos a partir do calendário nacional e devem ser
-- conferidos pelo SGEST com os atos da Diretoria-Geral.
insert into public.datas_nao_uteis (data, descricao, tipo, fonte, responsavel) values
  ('2026-01-01', 'Confraternização Universal', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-02-16', 'Carnaval', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-02-17', 'Carnaval', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-02-18', 'Quarta-feira de Cinzas', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-04-02', 'Quinta-feira Santa', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-04-03', 'Paixão de Cristo', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-04-20', 'Ponto facultativo (véspera de Tiradentes)', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-04-21', 'Tiradentes / Aniversário de Brasília', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-05-01', 'Dia do Trabalho', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-06-04', 'Corpus Christi', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-06-05', 'Ponto facultativo (após Corpus Christi)', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-06-29', 'A confirmar (consta na planilha sem descrição)', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-09-07', 'Independência do Brasil', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-10-28', 'Dia do Servidor Público', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-11-02', 'Finados', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-11-15', 'Proclamação da República (domingo — sem efeito)', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-12-24', 'Véspera de Natal', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-12-25', 'Natal', 'feriado', 'Planilha original — a conferir', 'Seed inicial (planilha)'),
  ('2026-12-31', 'Véspera de Ano-Novo', 'ponto_facultativo', 'Planilha original — a conferir', 'Seed inicial (planilha)');

update public.anos_calendario set status = 'publicado', responsavel = 'Seed inicial (planilha)' where ano = 2026;

reset sgest.seed;
