// Confirmar Presença — aluno INSTITUTION (27/09/2026). Único lugar de
// marcar presença agora (antes vivia embutido no card "Próxima aula" do
// Painel) — biometria/digital obrigatória, sem fallback manual, e só
// funciona dentro do horário da aula: fora da janela, mostra aviso e não
// registra nada (nem chega a pedir a biometria).
//
// Aula não guarda duração própria no banco (só `dataHora`, o início), então
// a janela usa uma margem fixa e generosa em vez de calcular o fim exato da
// aula: de 15 min antes até 60 min depois do horário marcado. Ajustável aqui
// se no futuro Aula passar a ter duração própria.
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Badge, EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

const MINUTOS_ANTES = 15;
const MINUTOS_DEPOIS = 60;

interface ProximaAula {
  id: string;
  dataHora: string;
  tipo: string;
  professor: { nome: string };
  presencaProfessorEm: string | null;
  presencaAlunoEm: string | null;
}

function estaEmHorarioDeAula(dataHoraISO: string): boolean {
  const inicio = new Date(dataHoraISO).getTime();
  const agora = Date.now();
  return agora >= inicio - MINUTOS_ANTES * 60000 && agora <= inicio + MINUTOS_DEPOIS * 60000;
}

export default function ConfirmarPresencaAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [proximaAula, setProximaAula] = useState<ProximaAula | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const dados = await res.json();
        setProximaAula(dados.proximaAula || null);
      }
    } catch {
      // sem conexão — usuário pode reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const confirmarPresenca = async () => {
    if (!proximaAula || !estaEmHorarioDeAula(proximaAula.dataHora)) {
      Alert.alert('Fora do horário', 'Você não está em horário de aula.');
      return;
    }

    const temHardware = await LocalAuthentication.hasHardwareAsync();
    const inscrito = await LocalAuthentication.isEnrolledAsync();
    if (!temHardware || !inscrito) {
      Alert.alert('Biometria não configurada', 'Seu dispositivo precisa ter digital ou Face ID configurado pra confirmar presença.');
      return;
    }
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirmar presença',
      fallbackLabel: 'Usar senha do dispositivo',
      cancelLabel: 'Cancelar',
    });
    if (!resultado.success) return;

    setConfirmando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas/${proximaAula.id}/checkin-aluno`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const resposta = await res.json();
      if (res.ok) { Alert.alert('Presença confirmada!', resposta.mensagem); carregar(); }
      else Alert.alert('Erro', resposta.erro || 'Não foi possível confirmar.');
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConfirmando(false);
    }
  };

  const dentroDoHorario = !!proximaAula && estaEmHorarioDeAula(proximaAula.dataHora);

  return (
    <MobileErpShell
      titulo="Confirmar Presença"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Confirmar Presença" subtitulo="Só funciona no horário da sua aula, com digital ou Face ID." />

      <SectionCard>
        {!proximaAula ? (
          <EstadoVazio icone="calendar-clear-outline" texto="Nenhuma aula agendada ainda." />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: ERP.fundo, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: ERP.texto }}>
                  {new Date(proximaAula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: ERP.texto }}>Prof. {proximaAula.professor?.nome || 'Professor'}</Text>
                <Text style={{ fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 }}>
                  {new Date(proximaAula.dataHora).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {proximaAula.tipo === 'REGULAR' ? 'Aula regular' : 'Reposição'}
                </Text>
              </View>
            </View>

            {proximaAula.presencaAlunoEm ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Badge texto="Você já confirmou presença" tom="sucesso" />
                <Badge
                  texto={proximaAula.presencaProfessorEm ? 'Professor confirmou' : 'Aguardando professor'}
                  tom={proximaAula.presencaProfessorEm ? 'sucesso' : 'aviso'}
                />
              </View>
            ) : (
              <>
                {!dentroDoHorario && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: ERP.avisoSoft, borderRadius: ERP.raio.md, borderWidth: 1, borderColor: '#F5D9A8', padding: 12, marginBottom: 14 }}>
                    <Ionicons name="time-outline" size={18} color="#8A5A00" />
                    <Text style={{ flex: 1, color: '#8A5A00', fontSize: 12.5, lineHeight: 18 }}>
                      Você só consegue confirmar presença perto do horário da aula.
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ERP.texto, borderRadius: ERP.raio.md, paddingVertical: 14 }}
                  onPress={confirmarPresenca}
                  disabled={confirmando}
                >
                  <Ionicons name="finger-print-outline" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{confirmando ? 'Confirmando...' : 'Confirmar presença'}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </SectionCard>
    </MobileErpShell>
  );
}
