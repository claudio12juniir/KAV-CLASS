// Painel do professor INSTITUTION — grade do dia + modal ao tocar numa aula
// com 3 blocos (cronograma vigente, presença biométrica, material didático).
// Endpoints já existentes, reaproveitados sem alteração: GET /api/dashboard
// (mesmo usado pelo SELF), GET /api/escola/cronograma-conteudo (liberado a
// qualquer professor da Escola), POST /api/aulas/:id/checkin-professor,
// POST /api/aulas/:id/material.
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Botao, Campo, EstadoVazio, Modal, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

type Aula = {
  id: string;
  dataHora: string;
  presenca: string | null;
  presencaProfessorEm: string | null;
  presencaAlunoEm: string | null;
  assuntoTratado: string | null;
  aluno?: { id: string; nome: string; status: string };
};

type Cronograma = {
  id: string;
  titulo: string | null;
  tipo: 'UNIVERSAL' | 'PESSOAL';
  anexoUrl: string | null;
  curso?: { nome: string };
  professor?: { nome: string } | null;
};

export default function PainelProfessorEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useProfessorEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [aulasHoje, setAulasHoje] = useState<Aula[]>([]);
  const [cronogramas, setCronogramas] = useState<Cronograma[]>([]);

  const [aulaAberta, setAulaAberta] = useState<Aula | null>(null);
  const [assunto, setAssunto] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const [tituloMaterial, setTituloMaterial] = useState('');
  const [tipoMaterial, setTipoMaterial] = useState<'TEXTO' | 'LINK'>('TEXTO');
  const [conteudoMaterial, setConteudoMaterial] = useState('');
  const [enviandoMaterial, setEnviandoMaterial] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resDashboard, resCronograma] = await Promise.all([
        fetchComRetry(`${BASE_URL}/api/dashboard`, { headers }),
        fetchComRetry(`${BASE_URL}/api/escola/cronograma-conteudo`, { headers }),
      ]);
      if (resDashboard.ok) {
        const dados = await resDashboard.json();
        setAulasHoje(dados.aulasHoje || []);
      }
      if (resCronograma.ok) {
        setCronogramas(await resCronograma.json());
      }
    } catch {
      // sem conexão — telas ficam vazias, usuário pode reabrir pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirAula = (aula: Aula) => {
    setAulaAberta(aula);
    setAssunto(aula.assuntoTratado || '');
    setTituloMaterial('');
    setTipoMaterial('TEXTO');
    setConteudoMaterial('');
  };

  const confirmarPresenca = async () => {
    if (!aulaAberta) return;
    try {
      const temHardware = await LocalAuthentication.hasHardwareAsync();
      const inscrito = await LocalAuthentication.isEnrolledAsync();
      if (temHardware && inscrito) {
        const resultado = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirmar presença',
          fallbackLabel: 'Usar senha do dispositivo',
          cancelLabel: 'Cancelar',
        });
        if (!resultado.success) return;
      }

      setConfirmando(true);
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas/${aulaAberta.id}/checkin-professor`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assuntoTratado: assunto }),
      });
      const dados = await res.json();
      if (res.ok) {
        // dados.aula vem de um prisma.aula.update() sem include — não traz
        // o relacionamento `aluno`, então preserva o que já tínhamos em tela.
        setAulaAberta((prev) => (prev ? { ...prev, ...dados.aula, aluno: prev.aluno } : prev));
        setAulasHoje((prev) => prev.map((a) => (a.id === dados.aula.id ? { ...a, ...dados.aula, aluno: a.aluno } : a)));
        Alert.alert('Presença confirmada!', dados.mensagem);
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível confirmar.');
      }
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setConfirmando(false);
    }
  };

  const enviarMaterial = async () => {
    if (!aulaAberta || !tituloMaterial.trim() || !conteudoMaterial.trim()) {
      Alert.alert('Atenção', 'Preencha título e conteúdo do material.');
      return;
    }
    setEnviandoMaterial(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aulas/${aulaAberta.id}/material`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: tituloMaterial.trim(),
          tipo: tipoMaterial,
          conteudo: tipoMaterial === 'LINK' ? null : conteudoMaterial.trim(),
          url: tipoMaterial === 'LINK' ? conteudoMaterial.trim() : null,
        }),
      });
      const dados = await res.json();
      if (res.ok) {
        setTituloMaterial('');
        setConteudoMaterial('');
        Alert.alert('Enviado!', 'Material didático enviado ao aluno.');
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível enviar o material.');
      }
    } catch {
      Alert.alert('Sem conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setEnviandoMaterial(false);
    }
  };

  const cronogramasRelevantes = cronogramas.filter(
    (c) => c.tipo === 'UNIVERSAL' || c.professor?.nome === nome,
  );

  return (
    <MobileErpShell
      titulo="Painel"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo={`Olá, ${nome.split(' ')[0] || 'professor'}!`} subtitulo="Grade de aulas de hoje" />

      <SectionCard titulo="Aulas de hoje">
        {aulasHoje.length === 0 ? (
          <EstadoVazio icone="calendar-outline" texto="Nenhuma aula agendada para hoje." />
        ) : (
          aulasHoje.map((aula) => {
            const confirmadoProfessor = !!aula.presencaProfessorEm;
            return (
              <TouchableOpacity key={aula.id} style={estilos.linhaAula} onPress={() => abrirAula(aula)}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nomeAluno}>{aula.aluno?.nome || 'Aluno'}</Text>
                  <Text style={estilos.horario}>
                    {new Date(aula.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Badge texto={confirmadoProfessor ? 'Presença confirmada' : 'Aguardando presença'} tom={confirmadoProfessor ? 'sucesso' : 'aviso'} />
                <Ionicons name="chevron-forward" size={18} color={ERP.textoMuted} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            );
          })
        )}
      </SectionCard>

      <Modal
        visivel={!!aulaAberta}
        titulo={aulaAberta?.aluno?.nome || 'Aula'}
        onFechar={() => setAulaAberta(null)}
      >
        {aulaAberta && (
          <View>
            <Text style={estilos.blocoTitulo}>Cronograma vigente</Text>
            {cronogramasRelevantes.length === 0 ? (
              <Text style={estilos.textoMuted}>Nenhum conteúdo cadastrado ainda.</Text>
            ) : (
              cronogramasRelevantes.map((c) => (
                <View key={c.id} style={estilos.itemCronograma}>
                  <Text style={estilos.itemCronogramaCurso}>{c.curso?.nome || 'Curso'}{c.tipo === 'PESSOAL' ? ' · pessoal' : ''}</Text>
                  <Text style={estilos.itemCronogramaTitulo}>{c.titulo || 'Sem título'}</Text>
                </View>
              ))
            )}

            <Text style={[estilos.blocoTitulo, { marginTop: 20 }]}>Presença</Text>
            {aulaAberta.presencaProfessorEm ? (
              <Badge texto="Você já confirmou presença" tom="sucesso" />
            ) : (
              <>
                <Campo
                  label="Assunto tratado (opcional)"
                  placeholder="O que foi dado na aula"
                  value={assunto}
                  onChangeText={setAssunto}
                />
                <Botao
                  texto="Confirmar presença"
                  icone="finger-print-outline"
                  onPress={confirmarPresenca}
                  carregando={confirmando}
                />
              </>
            )}

            <Text style={[estilos.blocoTitulo, { marginTop: 20 }]}>Material didático</Text>
            <Campo label="Título" placeholder="Ex: Lista de exercícios" value={tituloMaterial} onChangeText={setTituloMaterial} />
            <View style={estilos.tipoRow}>
              {(['TEXTO', 'LINK'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[estilos.tipoBtn, tipoMaterial === t && estilos.tipoBtnAtivo]}
                  onPress={() => setTipoMaterial(t)}
                >
                  <Text style={[estilos.tipoBtnTexto, tipoMaterial === t && estilos.tipoBtnTextoAtivo]}>{t === 'TEXTO' ? 'Texto' : 'Link'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Campo
              label={tipoMaterial === 'LINK' ? 'URL' : 'Conteúdo'}
              placeholder={tipoMaterial === 'LINK' ? 'https://...' : 'Descreva o material'}
              value={conteudoMaterial}
              onChangeText={setConteudoMaterial}
            />
            <Botao texto="Enviar material" icone="send-outline" onPress={enviarMaterial} carregando={enviandoMaterial} />
          </View>
        )}
      </Modal>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  linhaAula: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave,
  },
  nomeAluno: { fontSize: 14, fontWeight: '700', color: ERP.texto },
  horario: { fontSize: 12.5, color: ERP.textoSecundario, marginTop: 2 },
  blocoTitulo: { fontSize: 13, fontWeight: '800', color: ERP.texto, marginBottom: 8 },
  textoMuted: { fontSize: 13, color: ERP.textoMuted },
  itemCronograma: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave },
  itemCronogramaCurso: { fontSize: 11, fontWeight: '700', color: ERP.acentoForte, textTransform: 'uppercase' },
  itemCronogramaTitulo: { fontSize: 13.5, color: ERP.texto, marginTop: 2 },
  tipoRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tipoBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: ERP.raio.sm,
    borderWidth: 1, borderColor: ERP.bordaForte, backgroundColor: ERP.superficie,
  },
  tipoBtnAtivo: { backgroundColor: ERP.texto, borderColor: ERP.texto },
  tipoBtnTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.texto },
  tipoBtnTextoAtivo: { color: '#fff' },
});
