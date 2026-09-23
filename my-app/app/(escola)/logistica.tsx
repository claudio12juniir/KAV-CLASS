import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, PageHeader, SectionCard, SubAbasSimples } from './_ui';

function hojeYYYYMMDD() {
  return new Date().toISOString().slice(0, 10);
}

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Grade visível 06h–23h (INSTITUTION Sprint 14, briefing 22/09/2026) —
// mesma janela de horas usada na grade de disponibilidade do professor
// (equipe.tsx), aqui com salas nas colunas em vez de dias da semana.
const HORAS_GRADE = Array.from({ length: 17 }, (_, i) => i + 6);
const horaDe = (iso: string) => new Date(iso).getHours();
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Referência explícita do usuário (planilha manual, 23/09/2026): Seg a Sáb,
// sem domingo — índices de DIAS_SEMANA na ordem que a escola já usa.
const DIAS_UTEIS = [1, 2, 3, 4, 5, 6];

// Cor por professor (INSTITUTION Sprint 26, briefing 23/09/2026) — mesmo
// espírito visual da planilha de referência da escola (cada professor com
// uma cor própria pra identificar rápido quem dá aula onde). Hash simples
// do nome, sem precisar guardar cor nenhuma no banco.
const PALETA_PROFESSOR = [
  { bg: '#FEE4E2', borda: '#F04438', texto: '#B42318' },
  { bg: '#D1FADF', borda: '#12B76A', texto: '#027A48' },
  { bg: '#FEF0C7', borda: '#F79009', texto: '#B54708' },
  { bg: '#E0F2FE', borda: '#0BA5EC', texto: '#026AA2' },
  { bg: '#F4E8FF', borda: '#9E77ED', texto: '#6941C6' },
  { bg: '#FCE7F6', borda: '#EE46BC', texto: '#C11574' },
  { bg: '#FEF7C3', borda: '#EAAA08', texto: '#854A0E' },
  { bg: '#D0F0FD', borda: '#36BFFA', texto: '#065986' },
];
function corDoProfessor(nome: string) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA_PROFESSOR[hash % PALETA_PROFESSOR.length];
}

// Logística das salas (INSTITUTION Sprint 6, briefing 08/09/2026; grade
// semanal no Sprint 26, briefing 23/09/2026 — formato pedido pelo usuário,
// baseado na planilha manual que a escola já usava: uma grade Seg-Sáb ×
// hora POR SALA, não um dia específico). "Trocar sala" reaproveita
// PUT /api/aulas/:id/trocar-sala (S1.4) e PATCH /api/turmas/:id (recorrente)
// nos dois formatos de grade — a rota semanal devolve o mesmo formato de
// objeto Aula que a diária, só amostrado dos próximos 7 dias.
export default function LogisticaEscola() {
  const [aba, setAba] = useState<'semanal' | 'hoje'>('semanal');
  const [carregando, setCarregando] = useState(true);
  const [data, setData] = useState(hojeYYYYMMDD());
  const [salas, setSalas] = useState<any[]>([]);
  const [aulas, setAulas] = useState<any[]>([]);
  const [ocupacaoSemanal, setOcupacaoSemanal] = useState<any[]>([]);
  const [aulaEditando, setAulaEditando] = useState<any | null>(null);
  const [salaEscolhidaId, setSalaEscolhidaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregarHoje = useCallback(async () => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/escola/logistica/grade?data=${data}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const dados = await res.json();
      setSalas(dados.salas || []);
      setAulas(dados.aulas || []);
    }
  }, [data]);

  const carregarSemanal = useCallback(async () => {
    const token = await SecureStore.getItemAsync('kav_token');
    const res = await fetchComRetry(`${BASE_URL}/api/escola/logistica/grade-semanal`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const dados = await res.json();
      setSalas(dados.salas || []);
      setOcupacaoSemanal(dados.ocupacao || []);
    }
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      if (aba === 'semanal') await carregarSemanal();
      else await carregarHoje();
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, [aba, carregarSemanal, carregarHoje]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const abrirTrocaSala = (aula: any) => {
    setAulaEditando(aula);
    setSalaEscolhidaId(aula.sala?.id || null);
  };

  const salvarTroca = async (escopo: 'PONTUAL' | 'RECORRENTE') => {
    if (!aulaEditando) return;
    if (escopo === 'RECORRENTE' && !aulaEditando.turma) {
      Alert.alert('Sem turma', 'Esta é uma aula avulsa, sem turma — só dá pra mudar "só esta ocorrência".');
      return;
    }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const url = escopo === 'PONTUAL'
        ? `${BASE_URL}/api/aulas/${aulaEditando.id}/trocar-sala`
        : `${BASE_URL}/api/turmas/${aulaEditando.turma.id}`;
      const res = await fetchComRetry(url, {
        method: escopo === 'PONTUAL' ? 'PUT' : 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ salaId: salaEscolhidaId }),
      });
      if (res.ok) { setAulaEditando(null); carregar(); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  const aulasPorSala = new Map<string, any[]>();
  const semSala: any[] = [];
  for (const aula of aulas) {
    if (aula.sala?.id) {
      if (!aulasPorSala.has(aula.sala.id)) aulasPorSala.set(aula.sala.id, []);
      aulasPorSala.get(aula.sala.id)!.push(aula);
    } else {
      semSala.push(aula);
    }
  }

  const ocupacaoPorSala = new Map<string, any[]>();
  for (const o of ocupacaoSemanal) {
    if (!ocupacaoPorSala.has(o.salaId)) ocupacaoPorSala.set(o.salaId, []);
    ocupacaoPorSala.get(o.salaId)!.push(o);
  }

  return (
    <ErpShell titulo="Logística">
      <PageHeader titulo="Logística das salas" subtitulo="Organização das aulas entre as salas — toda alteração fica salva automaticamente." />

      <SectionCard>
        <SubAbasSimples
          opcoes={[
            { chave: 'semanal', rotulo: 'Grade semanal (por sala)' },
            { chave: 'hoje', rotulo: 'Um dia específico' },
          ]}
          ativa={aba}
          onMudar={setAba}
        />
      </SectionCard>

      {aba === 'hoje' && (
        <SectionCard>
          <Campo label="Data" value={data} onChangeText={setData} placeholder="AAAA-MM-DD" />
        </SectionCard>
      )}

      {carregando ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View>
      ) : salas.length === 0 ? (
        <SectionCard><EstadoVazio icone="business-outline" texto="Nenhuma sala cadastrada ainda — cadastre salas no Perfil da Instituição." /></SectionCard>
      ) : aba === 'semanal' ? (
        salas.map((sala) => (
          <SectionCard key={sala.id} titulo={sala.nome} subtitulo="Seg a Sáb · 06h–23h · toque numa aula pra trocar de sala">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={estilos.celulaHoraLabel} />
                  {DIAS_UTEIS.map((dia) => (
                    <View key={dia} style={estilos.celulaDiaLabel}><Text style={estilos.diaLabelTexto}>{DIAS_SEMANA[dia]}</Text></View>
                  ))}
                </View>
                {HORAS_GRADE.map((hora) => (
                  <View key={hora} style={{ flexDirection: 'row' }}>
                    <View style={estilos.celulaHoraLabel}><Text style={estilos.horaLabelTexto}>{String(hora).padStart(2, '0')}:00</Text></View>
                    {DIAS_UTEIS.map((dia) => {
                      const ocupada = (ocupacaoPorSala.get(sala.id) || []).find((o) => o.diaSemana === dia && o.hora === hora);
                      const cor = ocupada ? corDoProfessor(ocupada.professor.nome) : null;
                      return (
                        <Pressable
                          key={dia}
                          onPress={() => ocupada && abrirTrocaSala(ocupada)}
                          style={[estilos.celulaSemanal, cor ? { backgroundColor: cor.bg, borderColor: cor.borda } : { backgroundColor: ERP.superficie, borderColor: ERP.bordaSuave }]}
                        >
                          {ocupada && (
                            <>
                              <Text style={[estilos.celulaTextoSemanal, { color: cor!.texto }]} numberOfLines={1}>{ocupada.professor.nome}</Text>
                              <Text style={[estilos.celulaTextoSemanalSub, { color: cor!.texto }]} numberOfLines={1}>{ocupada.aluno.nome}</Text>
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </SectionCard>
        ))
      ) : aulas.length === 0 ? (
        <SectionCard><EstadoVazio icone="calendar-outline" texto="Nenhuma aula agendada nesta data." /></SectionCard>
      ) : (
        <>
          <SectionCard titulo="Grade do dia" subtitulo="Toque numa aula marcada pra trocar de sala.">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={estilos.celulaHoraLabel} />
                  {salas.map((sala) => (
                    <View key={sala.id} style={estilos.celulaSalaLabel}><Text style={estilos.salaLabelTexto} numberOfLines={2}>{sala.nome}</Text></View>
                  ))}
                </View>
                {HORAS_GRADE.map((hora) => (
                  <View key={hora} style={{ flexDirection: 'row' }}>
                    <View style={estilos.celulaHoraLabel}><Text style={estilos.horaLabelTexto}>{String(hora).padStart(2, '0')}:00</Text></View>
                    {salas.map((sala) => {
                      const aula = (aulasPorSala.get(sala.id) || []).find((a) => horaDe(a.dataHora) === hora);
                      return (
                        <Pressable
                          key={sala.id}
                          onPress={() => aula && abrirTrocaSala(aula)}
                          style={[estilos.celulaGrade, aula ? { backgroundColor: ERP.acentoSoft, borderColor: ERP.acento } : { backgroundColor: ERP.superficie, borderColor: ERP.bordaSuave }]}
                        >
                          {aula && (
                            <>
                              <Text style={estilos.celulaTextoOcupada} numberOfLines={1}>{aula.professor?.nome}</Text>
                              <Text style={estilos.celulaTextoOcupadaSub} numberOfLines={1}>{aula.aluno?.nome}</Text>
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </SectionCard>

          {semSala.length > 0 && (
            <SectionCard
              titulo="Sem sala definida"
              subtitulo={`${semSala.length} ${semSala.length === 1 ? 'aula' : 'aulas'}`}
              acao={<Badge texto="Pendente" tom="alerta" />}
            >
              {semSala.map((aula) => (
                <LinhaAula key={aula.id} aula={aula} onMudarSala={() => abrirTrocaSala(aula)} />
              ))}
            </SectionCard>
          )}
        </>
      )}

      {aulaEditando && (
        <SectionCard titulo={`Mudar sala · ${horaCurta(aulaEditando.dataHora)} ${aulaEditando.aluno?.nome || ''}`} style={{ borderColor: ERP.acento }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {salas.map((s) => (
              <Botao key={s.id} texto={s.nome} variante={salaEscolhidaId === s.id ? 'primario' : 'secundario'} onPress={() => setSalaEscolhidaId(s.id)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Botao texto="Só esta ocorrência" onPress={() => salvarTroca('PONTUAL')} carregando={salvando} />
            <Botao texto="A partir de agora (turma)" variante="secundario" onPress={() => salvarTroca('RECORRENTE')} carregando={salvando} disabled={!aulaEditando.turma} />
            <Botao texto="Cancelar" variante="secundario" onPress={() => setAulaEditando(null)} />
          </View>
        </SectionCard>
      )}
    </ErpShell>
  );
}

function LinhaAula({ aula, onMudarSala }: { aula: any; onMudarSala: () => void }) {
  return (
    <View style={estilos.linha}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.linhaTitulo}>{horaCurta(aula.dataHora)} · {aula.turma?.curso?.nome || aula.turma?.nome || 'Aula avulsa'}</Text>
        <Text style={estilos.linhaSub}>{aula.professor?.nome} com {aula.aluno?.nome}</Text>
        {!aula.turma && <Badge texto="Sem turma" tom="default" />}
      </View>
      <Botao texto="Mudar sala" variante="secundario" onPress={onMudarSala} />
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  linhaTitulo: { fontSize: 13.5, fontWeight: '700', color: ERP.texto },
  linhaSub: { fontSize: 12, color: ERP.textoSecundario, marginTop: 2 },
  celulaHoraLabel: { width: 52, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 6 },
  horaLabelTexto: { fontSize: 10.5, color: ERP.textoMuted },
  celulaSalaLabel: { width: 92, alignItems: 'center', paddingBottom: 6, paddingHorizontal: 2 },
  salaLabelTexto: { fontSize: 11, fontWeight: '700', color: ERP.textoSecundario, textAlign: 'center' },
  celulaGrade: { width: 90, height: 40, marginLeft: 2, marginBottom: 2, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  celulaTextoOcupada: { fontSize: 9.5, color: ERP.acentoForte, fontWeight: '700', textAlign: 'center' },
  celulaTextoOcupadaSub: { fontSize: 9, color: ERP.textoSecundario, textAlign: 'center' },
  celulaDiaLabel: { width: 108, alignItems: 'center', paddingBottom: 6 },
  diaLabelTexto: { fontSize: 11, fontWeight: '700', color: ERP.textoSecundario },
  celulaSemanal: { width: 106, height: 38, marginLeft: 2, marginBottom: 2, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  celulaTextoSemanal: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  celulaTextoSemanalSub: { fontSize: 9.5, textAlign: 'center' },
});
