// Calendário do professor INSTITUTION — grade mensal combinando aulas
// próprias (GET /api/calendario, mesmo endpoint do SELF), eventos da escola
// (GET /api/escola/calendario — feriados/recessos/etc, leitura já liberada
// a qualquer professor da Escola) e reposições (GET /api/professor/
// reposicoes). Nenhum endpoint novo.
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

type Aula = { id: string; dataHora: string; aluno?: { nome: string } };
type DiaNaoLetivo = {
  id: string; data: string; dataFim: string | null; descricao: string;
  tipo: string; cursos: { curso: { nome: string } }[];
};
type Reposicao = { id: string; dataProposta: string; motivo: string; status: string; aluno?: { nome: string } };

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const NOMES_DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const TOM_TIPO: Record<string, 'default' | 'sucesso' | 'alerta' | 'aviso' | 'info'> = {
  FERIADO: 'info', RECESSO: 'default', FERIAS: 'default',
  PALESTRA: 'aviso', PASSEIO: 'aviso', FESTIVAL: 'sucesso', APRESENTACAO: 'sucesso',
};

function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// DiaNaoLetivo.data/dataFim são ancoradas no backend como data civil (meia-
// -noite no fuso do servidor, tipicamente UTC — ver ancorarNoDia em
// server.js), não como um instante local. Comparar com getFullYear/getMonth/
// getDate (fuso do navegador) desloca o dia em 1 quando o navegador está
// atrás de UTC — mesma classe de bug já corrigida em vencimento/tarefa.
// Ler com getUTC* recupera a data civil pretendida, e comparar como
// timestamp UTC-de-meia-noite evita problema de intervalo (dataFim).
function diaCivilComoTimestamp(d: Date, utc: boolean) {
  return utc
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

// Evento sem cursos = escola inteira, sempre afeta. Com cursos, casa por
// nome (texto livre) contra os cursos que o professor leciona — o schema
// não tem FK entre Professor.cursos (texto livre) e Curso (registro
// formal da Escola), então esse é o melhor sinal disponível hoje.
function eventoAfetaProfessor(evento: DiaNaoLetivo, cursosProfessor: string[]) {
  if (!evento.cursos?.length) return true;
  const nomesEvento = evento.cursos.map((c) => c.curso.nome.toLowerCase());
  return cursosProfessor.some((c) => nomesEvento.some((n) => n.includes(c.toLowerCase()) || c.toLowerCase().includes(n)));
}

export default function CalendarioProfessorEscola() {
  const { nome, fotoUrl, escolaNome, cursos: cursosProfessor, sair } = useProfessorEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [mesAtual, setMesAtual] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [diasNaoLetivos, setDiasNaoLetivos] = useState<DiaNaoLetivo[]>([]);
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null);

  const carregar = useCallback(async (mes: Date) => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resAulas, resEventos, resReposicoes] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/calendario?ano=${mes.getFullYear()}&mes=${mes.getMonth() + 1}`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/calendario`, { headers }),
        fetchComRetry(`${BASE_URL}/api/professor/reposicoes`, { headers }),
      ]);
      if (resAulas.ok) setAulas(await resAulas.json());
      if (resEventos.ok) setDiasNaoLetivos(await resEventos.json());
      if (resReposicoes.ok) setReposicoes(await resReposicoes.json());
    } catch {
      // sem conexão — grade fica vazia, dá pra tentar de novo trocando de mês
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(mesAtual); }, [carregar, mesAtual]);

  const mudarMes = (delta: number) => {
    setDiaSelecionado(null);
    setMesAtual((atual) => {
      const novo = new Date(atual);
      novo.setMonth(novo.getMonth() + delta);
      return novo;
    });
  };

  const eventosNoDia = (dia: Date) => {
    const alvo = diaCivilComoTimestamp(dia, false);
    return diasNaoLetivos.filter((e) => {
      const inicio = diaCivilComoTimestamp(new Date(e.data), true);
      const fim = e.dataFim ? diaCivilComoTimestamp(new Date(e.dataFim), true) : inicio;
      return alvo >= inicio && alvo <= fim;
    });
  };
  const aulasNoDia = (dia: Date) => aulas.filter((a) => mesmoDia(new Date(a.dataHora), dia));
  const reposicoesNoDia = (dia: Date) => reposicoes.filter((r) => {
    const d = new Date(r.dataProposta);
    return !isNaN(d.getTime()) && mesmoDia(d, dia);
  });

  const primeiroDiaSemana = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1).getDay();
  const totalDias = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).getDate();
  const celulas: (Date | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => new Date(mesAtual.getFullYear(), mesAtual.getMonth(), i + 1)),
  ];
  const hoje = new Date();

  return (
    <MobileErpShell
      titulo="Calendário"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Calendário" subtitulo="Aulas, feriados e reposições do mês" />

      <SectionCard>
        <View style={estilos.cabecalhoMes}>
          <TouchableOpacity onPress={() => mudarMes(-1)} style={estilos.setaBtn}>
            <Ionicons name="chevron-back" size={18} color={ERP.texto} />
          </TouchableOpacity>
          <Text style={estilos.tituloMes}>{NOMES_MES[mesAtual.getMonth()]} {mesAtual.getFullYear()}</Text>
          <TouchableOpacity onPress={() => mudarMes(1)} style={estilos.setaBtn}>
            <Ionicons name="chevron-forward" size={18} color={ERP.texto} />
          </TouchableOpacity>
        </View>

        <View style={estilos.linhaSemana}>
          {NOMES_DIA_SEMANA.map((d, i) => (
            <Text key={i} style={estilos.diaSemanaTexto}>{d}</Text>
          ))}
        </View>

        <View style={estilos.grade}>
          {celulas.map((dia, idx) => {
            if (!dia) return <View key={idx} style={estilos.celula} />;
            const eventos = eventosNoDia(dia);
            const temEventoRelevante = eventos.some((e) => eventoAfetaProfessor(e, cursosProfessor));
            const temEventoInformativo = eventos.length > 0 && !temEventoRelevante;
            const totalAulas = aulasNoDia(dia).length;
            const totalReposicoes = reposicoesNoDia(dia).length;
            const selecionado = diaSelecionado && mesmoDia(dia, diaSelecionado);
            const ehHoje = mesmoDia(dia, hoje);
            return (
              <TouchableOpacity
                key={idx}
                style={[estilos.celula, selecionado && estilos.celulaSelecionada, ehHoje && !selecionado && estilos.celulaHoje]}
                onPress={() => setDiaSelecionado(dia)}
              >
                <Text style={[estilos.diaNumero, selecionado && { color: '#fff' }]}>{dia.getDate()}</Text>
                <View style={estilos.pontosLinha}>
                  {totalAulas > 0 && <View style={[estilos.ponto, { backgroundColor: ERP.acento }]} />}
                  {temEventoRelevante && <View style={[estilos.ponto, { backgroundColor: ERP.perigo }]} />}
                  {temEventoInformativo && <View style={[estilos.ponto, { backgroundColor: ERP.textoMuted }]} />}
                  {totalReposicoes > 0 && <View style={[estilos.ponto, { backgroundColor: ERP.aviso }]} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>

      {diaSelecionado && (
        <SectionCard titulo={diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}>
          {aulasNoDia(diaSelecionado).length === 0 && eventosNoDia(diaSelecionado).length === 0 && reposicoesNoDia(diaSelecionado).length === 0 ? (
            <EstadoVazio icone="calendar-outline" texto="Nada por aqui neste dia." />
          ) : (
            <>
              {aulasNoDia(diaSelecionado).map((a) => (
                <View key={a.id} style={estilos.itemDia}>
                  <Ionicons name="school-outline" size={16} color={ERP.acentoForte} />
                  <Text style={estilos.itemDiaTexto}>
                    {new Date(a.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {a.aluno?.nome || 'Aula'}
                  </Text>
                </View>
              ))}
              {eventosNoDia(diaSelecionado).map((e) => (
                <View key={e.id} style={estilos.itemDia}>
                  <Badge texto={e.descricao} tom={TOM_TIPO[e.tipo] || 'default'} />
                  {!eventoAfetaProfessor(e, cursosProfessor) && (
                    <Text style={estilos.itemDiaMuted}>não afeta seus cursos</Text>
                  )}
                </View>
              ))}
              {reposicoesNoDia(diaSelecionado).map((r) => (
                <View key={r.id} style={estilos.itemDia}>
                  <Ionicons name="repeat-outline" size={16} color={ERP.aviso} />
                  <Text style={estilos.itemDiaTexto}>{r.aluno?.nome || 'Aluno'} · {r.motivo}</Text>
                  <Badge texto={r.status} tom={r.status === 'CONFIRMADA' ? 'sucesso' : 'aviso'} />
                </View>
              ))}
            </>
          )}
        </SectionCard>
      )}
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  cabecalhoMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  setaBtn: { padding: 6 },
  tituloMes: { fontSize: 15, fontWeight: '800', color: ERP.texto },
  linhaSemana: { flexDirection: 'row', marginBottom: 4 },
  diaSemanaTexto: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: ERP.textoMuted },
  grade: { flexDirection: 'row', flexWrap: 'wrap' },
  celula: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: ERP.raio.sm, marginBottom: 2,
  },
  celulaSelecionada: { backgroundColor: ERP.texto },
  celulaHoje: { backgroundColor: ERP.acentoSoft },
  diaNumero: { fontSize: 13, fontWeight: '600', color: ERP.texto },
  pontosLinha: { flexDirection: 'row', gap: 3, marginTop: 3, height: 6 },
  ponto: { width: 5, height: 5, borderRadius: 3 },
  itemDia: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  itemDiaTexto: { fontSize: 13, color: ERP.texto, flex: 1 },
  itemDiaMuted: { fontSize: 11, color: ERP.textoMuted, fontStyle: 'italic' },
});
