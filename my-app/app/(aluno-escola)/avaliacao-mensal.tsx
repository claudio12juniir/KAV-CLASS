// Avaliação mensal do aluno INSTITUTION (Sprint 9, briefing 08/09/2026) —
// backend já existia (POST /api/aluno/avaliacao-mensal), mas nenhuma tela
// consumia (auditoria INSTITUTION, 11/09/2026). Responder pausa a régua de
// cobrança/lembrete até o mês seguinte (Matricula.avaliacaoPendenteAte).
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Botao, Campo, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

function SeletorNota({ label, valor, onMudar }: { label: string; valor: number; onMudar: (n: number) => void }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={estilos.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} style={[estilos.notaBotao, valor === n && estilos.notaBotaoAtivo]} onPress={() => onMudar(n)}>
            <Ionicons name="star" size={18} color={valor >= n ? '#fff' : ERP.textoMuted} />
            <Text style={[estilos.notaTexto, valor === n && { color: '#fff' }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AvaliacaoMensalAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();

  const [notaProfessor, setNotaProfessor] = useState(0);
  const [notaEscola, setNotaEscola] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    if (!notaProfessor || !notaEscola) {
      Alert.alert('Atenção', 'Dê uma nota pro professor e pra escola antes de enviar.');
      return;
    }
    setEnviando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/avaliacao-mensal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notaProfessor, notaEscola, comentario: comentario.trim() || undefined }),
      });
      const dados = await res.json();
      if (res.ok) {
        setEnviado(true);
      } else {
        Alert.alert('Não foi possível enviar', dados.erro || 'Tente novamente.');
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MobileErpShell
      titulo="Avaliação mensal"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={false}
    >
      <PageHeader titulo="Avaliação mensal" subtitulo="Como foi sua experiência este mês?" />

      <SectionCard>
        {enviado ? (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Ionicons name="checkmark-circle" size={40} color={ERP.sucesso} />
            <Text style={{ color: ERP.texto, fontSize: 14.5, fontWeight: '700', marginTop: 10, textAlign: 'center' }}>Obrigado pela avaliação!</Text>
            <Text style={{ color: ERP.textoSecundario, fontSize: 13, marginTop: 4, textAlign: 'center' }}>Sua cobrança fica pausada até o próximo mês.</Text>
          </View>
        ) : (
          <>
            <SeletorNota label="Nota pro professor" valor={notaProfessor} onMudar={setNotaProfessor} />
            <SeletorNota label="Nota pra escola" valor={notaEscola} onMudar={setNotaEscola} />
            <Campo label="Comentário (opcional)" placeholder="Conta pra gente como foi" value={comentario} onChangeText={setComentario} multiline />
            <Botao texto="Enviar avaliação" onPress={enviar} carregando={enviando} />
          </>
        )}
      </SectionCard>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: '700', color: ERP.texto, marginBottom: 8 },
  notaBotao: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: ERP.raio.sm, borderWidth: 1, borderColor: ERP.bordaForte, backgroundColor: ERP.superficie,
  },
  notaBotaoAtivo: { backgroundColor: ERP.acento, borderColor: ERP.acento },
  notaTexto: { fontSize: 13, fontWeight: '700', color: ERP.texto },
});
