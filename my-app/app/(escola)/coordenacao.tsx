import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from '../../components/SyncLoader';
import { ERP } from '../../constants/erpTheme';
import { BASE_URL, fetchComRetry } from '../api';
import { Badge, Botao, Campo, ErpShell, EstadoVazio, Modal, PageHeader, SectionCard } from './_ui';

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={onPress}>
      <Text style={[estilos.chipTexto, ativo && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Nota baixa em vermelho (INSTITUTION Sprint 18, briefing 22/09/2026) —
// "alertas sempre" pedido pelo usuário: média abaixo de 3 estrelas é sinal
// de qualidade de ensino comprometida, exatamente o que esta aba existe
// pra vigiar (ver comentário da tela abaixo).
function Estrelas({ valor }: { valor: number | null }) {
  if (valor == null) return <Text style={estilos.semDados}>Sem avaliações ainda</Text>;
  const baixa = valor < 3;
  return (
    <Text style={[estilos.estrelas, baixa && { color: ERP.perigo }]}>
      {'★'.repeat(Math.round(valor))}{'☆'.repeat(5 - Math.round(valor))} <Text style={[estilos.estrelasNumero, baixa && { color: ERP.perigo, fontWeight: '700' }]}>({valor.toFixed(1)})</Text>
    </Text>
  );
}

// Coordenação (INSTITUTION Sprint 9, briefing 08/09/2026): sessões por
// curso agregando cronograma vigente, relatórios e média de avaliação —
// dá pra escola controle de qualidade de ensino sem precisar visitar sala.
export default function CoordenacaoEscola() {
  const [carregando, setCarregando] = useState(true);
  const [resumo, setResumo] = useState<any[]>([]);
  const [professores, setProfessores] = useState<any[]>([]);
  const [relatorios, setRelatorios] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);

  const [modalCronograma, setModalCronograma] = useState<{ cursoId: string; cursoNome: string } | null>(null);
  const [tipoCronograma, setTipoCronograma] = useState<'UNIVERSAL' | 'PESSOAL'>('UNIVERSAL');
  const [professorCronogramaId, setProfessorCronogramaId] = useState<string | null>(null);
  const [tituloCronograma, setTituloCronograma] = useState('');
  const [anexoCronograma, setAnexoCronograma] = useState('');
  const [salvandoCronograma, setSalvandoCronograma] = useState(false);

  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [alunoRelatorioId, setAlunoRelatorioId] = useState<string | null>(null);
  const [descricaoRelatorio, setDescricaoRelatorio] = useState('');
  const [anexoRelatorio, setAnexoRelatorio] = useState('');
  const [salvandoRelatorio, setSalvandoRelatorio] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resResumo, resProfessores, resRelatorios, resAlunos] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/escola/coordenacao/resumo`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/professores`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/relatorios-aluno`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/alunos`, { headers }),
      ]);
      if (resResumo.ok) setResumo(await resResumo.json());
      if (resProfessores.ok) setProfessores(await resProfessores.json());
      if (resRelatorios.ok) setRelatorios(await resRelatorios.json());
      if (resAlunos.ok) setAlunos(await resAlunos.json());
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const abrirModalCronograma = (cursoId: string, cursoNome: string) => {
    setModalCronograma({ cursoId, cursoNome });
    setTipoCronograma('UNIVERSAL');
    setProfessorCronogramaId(professores[0]?.id || null);
    setTituloCronograma('');
    setAnexoCronograma('');
  };

  const salvarCronograma = async () => {
    if (!modalCronograma) return;
    if (tipoCronograma === 'PESSOAL' && !professorCronogramaId) { Alert.alert('Atenção', 'Escolha o professor.'); return; }
    setSalvandoCronograma(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/cronograma-conteudo`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cursoId: modalCronograma.cursoId, tipo: tipoCronograma,
          professorId: tipoCronograma === 'PESSOAL' ? professorCronogramaId : undefined,
          titulo: tituloCronograma, anexoUrl: anexoCronograma,
        }),
      });
      if (res.ok) { setModalCronograma(null); carregar(); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoCronograma(false);
    }
  };

  const abrirModalRelatorio = () => {
    setAlunoRelatorioId(alunos[0]?.id || null);
    setDescricaoRelatorio('');
    setAnexoRelatorio('');
    setModalRelatorio(true);
  };

  const salvarRelatorio = async () => {
    if (!alunoRelatorioId) { Alert.alert('Atenção', 'Escolha o aluno.'); return; }
    setSalvandoRelatorio(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/relatorios-aluno`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunoId: alunoRelatorioId, descricao: descricaoRelatorio, anexoUrl: anexoRelatorio }),
      });
      if (res.ok) { setModalRelatorio(false); carregar(); }
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvandoRelatorio(false);
    }
  };

  if (carregando) {
    return <ErpShell titulo="Coordenação"><View style={{ paddingTop: 60, alignItems: 'center' }}><SyncLoader size="large" color={ERP.texto} /></View></ErpShell>;
  }

  return (
    <ErpShell titulo="Coordenação">
      <PageHeader titulo="Coordenação" subtitulo="Cronograma de conteúdo, relatórios e satisfação por curso" />

      {resumo.length === 0 ? (
        <SectionCard><EstadoVazio icone="ribbon-outline" texto="Nenhum curso cadastrado ainda — crie em Perfil da Instituição." /></SectionCard>
      ) : (
        resumo.map((r) => (
          <SectionCard
            key={r.curso.id}
            titulo={r.curso.nome}
            acao={<Botao texto="+ Cronograma" variante="secundario" onPress={() => abrirModalCronograma(r.curso.id, r.curso.nome)} />}
          >
            <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
              <View>
                <Text style={estilos.label}>Avaliação do professor</Text>
                <Estrelas valor={r.mediaAvaliacaoProfessor} />
              </View>
              <View>
                <Text style={estilos.label}>Avaliação da escola</Text>
                <Estrelas valor={r.mediaAvaliacaoEscola} />
              </View>
              <View>
                <Text style={estilos.label}>Relatórios de alunos</Text>
                <Text style={estilos.numeroGrande}>{r.totalRelatorios}</Text>
              </View>
            </View>

            <Text style={estilos.label}>Cronograma vigente</Text>
            {r.cronogramaUniversal ? (
              <View style={estilos.linhaCronograma}>
                <Badge texto="Universal" tom="info" />
                <Text style={estilos.linhaCronogramaTexto}>{r.cronogramaUniversal.titulo || 'Sem título'}</Text>
              </View>
            ) : (
              <Text style={estilos.semDados}>Nenhum cronograma universal ainda.</Text>
            )}
            {r.cronogramasPessoais.map((c: any) => (
              <View key={c.id} style={estilos.linhaCronograma}>
                <Badge texto="Pessoal" tom="default" />
                <Text style={estilos.linhaCronogramaTexto}>{c.professor?.nome} · {c.titulo || 'Sem título'}</Text>
              </View>
            ))}
          </SectionCard>
        ))
      )}

      <SectionCard titulo="Relatórios de alunos" acao={<Botao texto="Novo relatório" variante="secundario" icone="add" onPress={abrirModalRelatorio} />}>
        {relatorios.length === 0 ? (
          <EstadoVazio icone="document-text-outline" texto="Nenhum relatório enviado ainda." />
        ) : (
          relatorios.map((r) => (
            <View key={r.id} style={estilos.linhaRelatorio}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.linhaCronogramaTexto}>{r.aluno?.nome}</Text>
                <Text style={estilos.semDados}>{r.descricao || 'Sem descrição'} · {new Date(r.createdAt).toLocaleDateString('pt-BR')}</Text>
              </View>
              <Badge texto={r.autorTipo === 'COORDENACAO' ? 'Coordenação' : 'Professor'} tom={r.autorTipo === 'COORDENACAO' ? 'info' : 'default'} />
            </View>
          ))
        )}
      </SectionCard>

      <Modal visivel={!!modalCronograma} titulo={`Cronograma · ${modalCronograma?.cursoNome || ''}`} onFechar={() => setModalCronograma(null)}>
        <Text style={estilos.label}>Tipo</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          <Chip label="Universal (a escola sobe)" ativo={tipoCronograma === 'UNIVERSAL'} onPress={() => setTipoCronograma('UNIVERSAL')} />
          <Chip label="Pessoal (professor sobe)" ativo={tipoCronograma === 'PESSOAL'} onPress={() => setTipoCronograma('PESSOAL')} />
        </View>
        {tipoCronograma === 'PESSOAL' && (
          <>
            <Text style={estilos.label}>Professor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {professores.map((p) => <Chip key={p.id} label={p.nome} ativo={professorCronogramaId === p.id} onPress={() => setProfessorCronogramaId(p.id)} />)}
              </View>
            </ScrollView>
          </>
        )}
        <Campo label="Título" value={tituloCronograma} onChangeText={setTituloCronograma} placeholder="Ex.: Cronograma 2º semestre" />
        <Campo label="URL do anexo" value={anexoCronograma} onChangeText={setAnexoCronograma} placeholder="https://..." autoCapitalize="none" />
        <Botao texto="Salvar cronograma" onPress={salvarCronograma} carregando={salvandoCronograma} />
      </Modal>

      <Modal visivel={modalRelatorio} titulo="Novo relatório de aluno" onFechar={() => setModalRelatorio(false)}>
        <Text style={estilos.label}>Aluno</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {alunos.map((a) => <Chip key={a.id} label={a.nome} ativo={alunoRelatorioId === a.id} onPress={() => setAlunoRelatorioId(a.id)} />)}
          </View>
        </ScrollView>
        <Campo label="Descrição" value={descricaoRelatorio} onChangeText={setDescricaoRelatorio} placeholder="Ex.: Relatório de progresso do trimestre" />
        <Campo label="URL do anexo" value={anexoRelatorio} onChangeText={setAnexoRelatorio} placeholder="https://..." autoCapitalize="none" />
        <Botao texto="Salvar relatório" onPress={salvarRelatorio} carregando={salvandoRelatorio} />
      </Modal>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', color: ERP.textoMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  numeroGrande: { fontSize: 18, fontWeight: '800', color: ERP.texto },
  estrelas: { fontSize: 15, color: '#F5A623' },
  estrelasNumero: { fontSize: 12, color: ERP.textoSecundario },
  semDados: { fontSize: 12, color: ERP.textoMuted },
  linhaCronograma: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  linhaCronogramaTexto: { fontSize: 13, color: ERP.texto, fontWeight: '600' },
  linhaRelatorio: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ERP.fundo, borderWidth: 1, borderColor: ERP.borda },
  chipAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
});
