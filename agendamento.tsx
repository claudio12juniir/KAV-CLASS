import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HORARIOS = [
  '07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00',
];

const API_URL = "https://kav-class-1.onrender.com";

type TipoAula = 'individual' | 'grupo';

export default function AgendamentoScreen() {
  const navigation = useNavigation();
  const router = useRouter();

  const [tipo, setTipo]                       = useState<TipoAula>('individual');
  const [alunosSelecionados, setAlunos]       = useState<string[]>([]);
  const [diaSemana, setDiaSemana]             = useState<number | null>(null);
  const [horario, setHorario]                 = useState<string | null>(null);
  const [curso, setCurso]                     = useState<string>('');

  // Estados Reais (Backend)
  const [alunosAtivos, setAlunosAtivos]       = useState<any[]>([]);
  const [cursos, setCursos]                   = useState<string[]>([]);
  const [carregando, setCarregando]           = useState(true);

  useEffect(() => {
    async function carregarDados() {
      try {
        const token = await SecureStore.getItemAsync('kav_token');
        const professorId = await SecureStore.getItemAsync('kav_professor_id') || "";

        const [resAlunos, resCursos] = await Promise.all([
          fetch(`${API_URL}/api/meus-alunos?professorId=${professorId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API_URL}/api/meus-cursos?professorId=${professorId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
        ]);

        if (resAlunos.ok) {
          const dados = await resAlunos.json();
          setAlunosAtivos(dados);
        }

        if (resCursos.ok) {
          const dadosCursos = await resCursos.json();
          const lista: string[] = Array.isArray(dadosCursos)
            ? dadosCursos.map((c: any) => (typeof c === 'string' ? c : c.nome))
            : [];
          setCursos(lista);
          if (lista.length > 0) setCurso(lista[0]);
        }
      } catch (error) {
        console.error("Erro ao buscar dados:", error);
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, []);

  const toggleAluno = (id: string) => {
    if (tipo === 'individual') { setAlunos([id]); return; }
    setAlunos(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const podeSalvar = alunosSelecionados.length > 0 && diaSemana !== null && horario !== null && curso !== '';

  // 2. Enviar a aula para a Base de Dados (Node.js -> Prisma)
  const registrar = async () => {
    if (!podeSalvar) return;

    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const professorId = await SecureStore.getItemAsync('kav_professor_id') || '';

      const payload = {
        professorId,
        tipo,
        curso,
        diaSemana,
        horario,
        alunosIds: alunosSelecionados,
      };

      const resposta = await fetch(`${API_URL}/api/aulas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (resposta.ok) {
        Alert.alert(
          'Aula Registrada! ✅',
          'O agendamento foi salvo na sua base de dados com sucesso.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Erro', 'Não foi possível salvar a aula no banco de dados.');
      }

    } catch (error) {
      console.error(error);
      Alert.alert('Erro de Conexão', 'Não conseguimos conectar ao servidor KAV Class.');
    }
  };

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={{ marginTop: 10, color: '#666' }}>Carregando seus alunos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.titulo}>AGENDAMENTOS</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Tipo ─────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Tipo de Aula</Text>
        <View style={styles.tipoRow}>
          {(['individual', 'grupo'] as TipoAula[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tipoBotao, tipo === t && styles.tipoBotaoAtivo]}
              onPress={() => { setTipo(t); setAlunos([]); }}
            >
              <Ionicons name={t === 'individual' ? 'person' : 'people'} size={20} color={tipo === t ? '#ffffff' : '#555'} />
              <Text style={[styles.tipoTexto, tipo === t && styles.tipoTextoAtivo]}>
                {t === 'individual' ? 'Individual' : 'Em Grupo'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Curso — pré-populado com os cursos do professor ───────────── */}
        <Text style={styles.sectionLabel}>Curso</Text>
        <Text style={styles.sectionHint}>Apenas os cursos que você leciona aparecem aqui</Text>
        <View style={styles.cursosRow}>
          {cursos.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.cursoChip, curso === c && styles.cursoChipAtivo]}
              onPress={() => setCurso(c)}
            >
              <Ionicons name="musical-notes" size={16} color={curso === c ? '#ffffff' : '#555'} />
              <Text style={[styles.cursoTexto, curso === c && styles.cursoTextoAtivo]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Alunos (Agora vêm do Banco de Dados) ───────────────────────── */}
        <Text style={styles.sectionLabel}>
          {tipo === 'individual' ? 'Selecionar Aluno' : 'Selecionar Alunos do Grupo'}
        </Text>
        {tipo === 'grupo' && (
          <Text style={styles.sectionHint}>Toque em todos os alunos que fazem parte deste grupo</Text>
        )}
        
        {alunosAtivos.map(aluno => {
          const sel = alunosSelecionados.includes(aluno.id);
          return (
            <TouchableOpacity
              key={aluno.id}
              style={[styles.cardAluno, sel && styles.cardAlunoSel]}
              onPress={() => toggleAluno(aluno.id)}
            >
              <View style={[styles.avatar, sel && styles.avatarSel]}>
                <Text style={styles.avatarLetra}>{aluno.nome.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nomeAluno}>{aluno.nome}</Text>
                <Text style={styles.cursoAluno}>{aluno.curso || 'Sem curso definido'}</Text>
              </View>
              {sel && <Ionicons name="checkmark-circle" size={24} color="#154a22" />}
            </TouchableOpacity>
          );
        })}

        {/* ── Dia da semana ─────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Dia da Semana</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <View style={styles.chipRow}>
            {DIAS_SEMANA.map((dia, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.chip, diaSemana === idx && styles.chipAtivo]}
                onPress={() => setDiaSemana(idx)}
              >
                <Text style={[styles.chipTexto, diaSemana === idx && styles.chipTextoAtivo]}>{dia}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* ── Horário ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Horário</Text>
        <View style={styles.horariosGrid}>
          {HORARIOS.map(h => (
            <TouchableOpacity
              key={h}
              style={[styles.chip, horario === h && styles.chipAtivo]}
              onPress={() => setHorario(h)}
            >
              <Text style={[styles.chipTexto, horario === h && styles.chipTextoAtivo]}>{h}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Resumo ────────────────────────────────────────────────────── */}
        {podeSalvar && (
          <View style={styles.resumoBox}>
            <Text style={styles.resumoTitulo}>Resumo</Text>
            <Text style={styles.resumoLinha}>
              👤 {alunosSelecionados.map(id => alunosAtivos.find(a => a.id === id)?.nome).join(', ')}
            </Text>
            <Text style={styles.resumoLinha}>📅 Toda {DIAS_SEMANA[diaSemana!]} às {horario}</Text>
            <Text style={styles.resumoLinha}>🎵 {curso} · {tipo === 'grupo' ? 'Grupo' : 'Individual'}</Text>
            <Text style={styles.resumoLinha}>🔁 Semanal até 31/12/2026</Text>
          </View>
        )}

        {/* ── Botão ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.botaoRegistrar, !podeSalvar && { opacity: 0.4 }]}
          onPress={registrar}
          disabled={!podeSalvar}
        >
          <Ionicons name="calendar-outline" size={22} color="#ffffff" />
          <Text style={styles.textoBotaoRegistrar}>Registrar Aula</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#D0D8DC',
  },
  hamburger: { padding: 4 },
  titulo:    { color: '#000000', fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  subtitulo: { color: '#666', fontSize: 13, marginTop: 2 },

  content: { padding: 20 },

  sectionLabel: { color: '#000000', fontSize: 16, fontWeight: 'bold', marginBottom: 6, marginTop: 8 },
  sectionHint:  { color: '#888', fontSize: 13, marginBottom: 10 },

  // Tipo
  tipoRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  tipoBotao: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 14,
    backgroundColor: '#F0F4F8', borderWidth: 1.5, borderColor: '#D0D8DC',
  },
  tipoBotaoAtivo: { backgroundColor: '#000000', borderColor: '#000000' },
  tipoTexto:      { color: '#555', fontWeight: 'bold', fontSize: 15 },
  tipoTextoAtivo: { color: '#ffffff' },

  // Cursos
  cursosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  cursoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#F0F4F8', borderWidth: 1.5, borderColor: '#D0D8DC',
  },
  cursoChipAtivo: { backgroundColor: '#000000', borderColor: '#000000' },
  cursoTexto:     { color: '#555', fontWeight: '700', fontSize: 14 },
  cursoTextoAtivo:{ color: '#ffffff' },

  // Alunos
  cardAluno: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0F4F8', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1.5, borderColor: '#D0D8DC', gap: 12,
  },
  cardAlunoSel: { borderColor: '#154a22', backgroundColor: '#E8F8EE' },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center',
  },
  avatarSel:  { backgroundColor: '#154a22' },
  avatarLetra:{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  nomeAluno:  { color: '#000000', fontWeight: 'bold', fontSize: 16 },
  cursoAluno: { color: '#666', fontSize: 13, marginTop: 2 },

  // Chips genéricos (dias e horários)
  chipRow:     { flexDirection: 'row', gap: 8 },
  horariosGrid:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#F0F4F8', borderWidth: 1, borderColor: '#D0D8DC',
  },
  chipAtivo:      { backgroundColor: '#000000', borderColor: '#000000' },
  chipTexto:      { color: '#555', fontWeight: '600', fontSize: 14 },
  chipTextoAtivo: { color: '#ffffff' },

  // Resumo
  resumoBox: {
    backgroundColor: '#F0F4F8', borderRadius: 14, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: '#D0D8DC', gap: 6,
  },
  resumoTitulo: { color: '#000000', fontWeight: 'bold', fontSize: 15, marginBottom: 8 },
  resumoLinha:  { color: '#555', fontSize: 14, lineHeight: 22 },

  // Botão
  botaoRegistrar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#000000', borderRadius: 14, padding: 18,
  },
  textoBotaoRegistrar: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
});