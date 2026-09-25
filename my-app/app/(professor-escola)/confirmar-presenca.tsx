// Confirmar Presença — professor INSTITUTION (27/09/2026). Único lugar de
// marcar presença agora (antes vivia embutido no modal de aula do Painel) —
// mesmo fluxo do professor SELF ((professor)/checkin-presenca.tsx): lista as
// aulas de hoje (+ experimentais), biometria/digital obrigatória (sem
// fallback manual — "apenas uma opção de marcar presença"), mesmos
// endpoints reaproveitados sem alteração.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Badge, EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

type Aula = {
  id: string;
  dataHora: string;
  presencaProfessorEm: string | null;
  presencaAlunoEm: string | null;
  aluno?: { nome: string };
};

type Experimental = {
  id: string;
  dataHora: string;
  status: string;
  lead?: { nome: string };
};

function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function autenticarBiometria(mensagem: string): Promise<boolean> {
  const temHardware = await LocalAuthentication.hasHardwareAsync();
  const inscrito = await LocalAuthentication.isEnrolledAsync();
  if (!temHardware || !inscrito) {
    Alert.alert('Biometria não configurada', 'Seu dispositivo precisa ter digital ou Face ID configurado pra confirmar presença.');
    return false;
  }
  const resultado = await LocalAuthentication.authenticateAsync({
    promptMessage: mensagem,
    fallbackLabel: 'Usar senha do dispositivo',
    cancelLabel: 'Cancelar',
  });
  return resultado.success;
}

export default function ConfirmarPresencaProfessorEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useProfessorEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [aulasHoje, setAulasHoje] = useState<Aula[]>([]);
  const [experimentaisHoje, setExperimentaisHoje] = useState<Experimental[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [assuntos, setAssuntos] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resAulas, resExperimentais] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/aulas`, { headers }),
        fetchComRetry(`${BASE_URL}/api/aulas-experimentais?apenasMeu=1`, { headers }),
      ]);
      const hoje = new Date();
      if (resAulas.ok) {
        const todas: Aula[] = await resAulas.json();
        setAulasHoje(todas.filter((a) => mesmoDia(new Date(a.dataHora), hoje)));
      }
      if (resExperimentais.ok) {
        const todas: Experimental[] = await resExperimentais.json();
        setExperimentaisHoje(todas.filter((e) => mesmoDia(new Date(e.dataHora), hoje) && e.status === 'AGENDADA'));
      }
    } catch {
      // sem conexão — usuário pode reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const confirmarPresenca = async (aula: Aula) => {
    const autenticado = await autenticarBiometria('Confirmar presença');
    if (!autenticado) return;

    setConfirmandoId(aula.id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas/${aula.id}/checkin-professor`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assuntoTratado: assuntos[aula.id] || '' }),
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Presença confirmada!', dados.mensagem); carregar(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível confirmar.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConfirmandoId(null);
    }
  };

  const confirmarExperimental = async (exp: Experimental) => {
    const autenticado = await autenticarBiometria('Confirmar presença da experimental');
    if (!autenticado) return;

    setConfirmandoId(exp.id);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas-experimentais/${exp.id}/checkin-biometrico`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await res.json();
      if (res.ok) { Alert.alert('Presença confirmada!', dados.mensagem); carregar(); }
      else Alert.alert('Erro', dados.erro || 'Não foi possível confirmar.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConfirmandoId(null);
    }
  };

  return (
    <MobileErpShell
      titulo="Confirmar Presença"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Confirmar Presença" subtitulo="Confirme sua presença nas aulas de hoje — o aluno confirma a dele de forma independente." />

      <SectionCard titulo="Aulas de hoje">
        {aulasHoje.length === 0 ? (
          <EstadoVazio icone="calendar-outline" texto="Nenhuma aula hoje." />
        ) : (
          aulasHoje.map((aula) => {
            const confirmado = !!aula.presencaProfessorEm;
            return (
              <View key={aula.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: ERP.texto }}>{aula.aluno?.nome || 'Aluno'}</Text>
                    <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 }}>
                      {new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Badge texto={aula.presencaAlunoEm ? 'Aluno já confirmou' : 'Aluno ainda não confirmou'} tom={aula.presencaAlunoEm ? 'sucesso' : 'aviso'} />
                </View>

                {confirmado ? (
                  <Badge texto="Você já confirmou presença" tom="sucesso" />
                ) : (
                  <>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: ERP.borda, borderRadius: ERP.raio.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: ERP.texto, backgroundColor: ERP.superficie }}
                      placeholder="Assunto tratado (opcional)"
                      placeholderTextColor={ERP.textoMuted}
                      value={assuntos[aula.id] || ''}
                      onChangeText={(v) => setAssuntos((atual) => ({ ...atual, [aula.id]: v }))}
                    />
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ERP.texto, borderRadius: ERP.raio.sm, paddingVertical: 11 }}
                      onPress={() => confirmarPresenca(aula)}
                      disabled={confirmandoId === aula.id}
                    >
                      <Ionicons name="finger-print-outline" size={18} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{confirmandoId === aula.id ? 'Confirmando...' : 'Confirmar presença'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })
        )}
      </SectionCard>

      {experimentaisHoje.length > 0 && (
        <SectionCard titulo="Experimentais de hoje">
          {experimentaisHoje.map((exp) => (
            <View key={exp.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: ERP.texto }}>{exp.lead?.nome || 'Interessado'}</Text>
                <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 }}>
                  {new Date(exp.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ERP.texto, borderRadius: ERP.raio.sm, paddingHorizontal: 14, paddingVertical: 10 }}
                onPress={() => confirmarExperimental(exp)}
                disabled={confirmandoId === exp.id}
              >
                <Ionicons name="finger-print-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{confirmandoId === exp.id ? 'Confirmando...' : 'Confirmar'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </SectionCard>
      )}
    </MobileErpShell>
  );
}
