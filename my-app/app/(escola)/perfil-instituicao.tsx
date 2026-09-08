import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BASE_URL, fetchComRetry } from '../api';
import { ERP } from '../../constants/erpTheme';
import { useEscolaContexto } from './_contexto';
import { Botao, Campo, ErpShell, PageHeader, SectionCard } from './_ui';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type DiaFuncionamento = { dia: number; aberto: boolean; abre: string; fecha: string };
type HorarioFuncionamento = { dias: DiaFuncionamento[] };

function horarioPadrao(): HorarioFuncionamento {
  return {
    dias: DIAS_SEMANA.map((_, dia) => ({
      dia,
      aberto: dia >= 1 && dia <= 5, // seg-sex aberto por padrão, sáb/dom fechado
      abre: '08:00',
      fecha: '18:00',
    })),
  };
}

function Chip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={({ hovered }: any) => [
        estilos.chip,
        ativo && estilos.chipAtivo,
        !ativo && hovered && { backgroundColor: ERP.hover },
      ]}
      onPress={onPress}
    >
      <Text style={[estilos.chipTexto, ativo && estilos.chipTextoAtivo]}>{label}</Text>
    </Pressable>
  );
}

export default function PerfilInstituicaoEscola() {
  const { papel } = useEscolaContexto();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [valorPorAula, setValorPorAula] = useState('');
  const [tipoRemuneracao, setTipoRemuneracao] = useState<'POR_AULA' | 'POR_ALUNO_MES'>('POR_AULA');
  const [diaFechamento, setDiaFechamento] = useState('');
  const [horario, setHorario] = useState<HorarioFuncionamento>(horarioPadrao());

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/perfil`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setNome(d.nome || '');
        setEmail(d.email || '');
        setLogoUrl(d.logoUrl || '');
        setValorPorAula(d.valorPorAula != null ? String(d.valorPorAula) : '');
        setTipoRemuneracao(d.tipoRemuneracaoProfessor === 'POR_ALUNO_MES' ? 'POR_ALUNO_MES' : 'POR_AULA');
        setDiaFechamento(d.diaFechamento != null ? String(d.diaFechamento) : '');
        if (d.horarioFuncionamento?.dias?.length === 7) setHorario(d.horarioFuncionamento);
      }
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const alternarDiaAberto = (dia: number) => {
    setHorario((h) => ({ dias: h.dias.map((d) => (d.dia === dia ? { ...d, aberto: !d.aberto } : d)) }));
  };
  const editarHorarioDia = (dia: number, campo: 'abre' | 'fecha', valor: string) => {
    setHorario((h) => ({ dias: h.dias.map((d) => (d.dia === dia ? { ...d, [campo]: valor } : d)) }));
  };

  const salvar = async () => {
    if (!nome.trim()) { Alert.alert('Atenção', 'O nome da instituição não pode ficar vazio.'); return; }
    setSalvando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/escola/perfil`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim() || null,
          logoUrl: logoUrl.trim() || null,
          valorPorAula: valorPorAula ? Number(valorPorAula.replace(',', '.')) : null,
          tipoRemuneracaoProfessor: tipoRemuneracao,
          diaFechamento: diaFechamento ? Number(diaFechamento) : null,
          horarioFuncionamento: horario,
        }),
      });
      if (res.ok) Alert.alert('Feito!', 'Perfil da Instituição atualizado.');
      else Alert.alert('Erro', (await res.json()).erro || 'Não foi possível salvar.');
    } catch {
      Alert.alert('Sem Conexão', 'Não conseguimos alcançar o servidor.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <ErpShell titulo="Perfil da Instituição">
        <View style={{ paddingTop: 60, alignItems: 'center' }}><ActivityIndicator color={ERP.acento} /></View>
      </ErpShell>
    );
  }

  return (
    <ErpShell titulo="Perfil da Instituição">
      <PageHeader
        titulo="Perfil da Instituição"
        subtitulo="Dados gerais, horário de funcionamento e a base do cálculo de pagamento dos professores."
        acao={papel === 'DONO' || papel === 'GESTOR' ? <Botao texto="Salvar tudo" onPress={salvar} carregando={salvando} icone="checkmark-circle-outline" /> : undefined}
      />

      <SectionCard titulo="Dados da instituição" subtitulo="Nome, logo e e-mail de contato">
        <Campo label="Nome da instituição" value={nome} onChangeText={setNome} placeholder="Ex.: Academia KAV" />
        <Campo label="E-mail da instituição" value={email} onChangeText={setEmail} placeholder="contato@suaescola.com" keyboardType="email-address" autoCapitalize="none" />
        <Campo label="URL do logo" value={logoUrl} onChangeText={setLogoUrl} placeholder="https://..." autoCapitalize="none" />
      </SectionCard>

      <SectionCard titulo="Horário de funcionamento" subtitulo="Usado na Grade de hoje, Logística e Cronograma">
        {horario.dias.map((d) => (
          <View key={d.dia} style={estilos.linhaDia}>
            <Pressable onPress={() => alternarDiaAberto(d.dia)} style={{ width: 130 }}>
              <Text style={[estilos.diaNome, !d.aberto && { color: ERP.textoMuted }]}>{DIAS_SEMANA[d.dia]}</Text>
            </Pressable>
            <Chip label={d.aberto ? 'Aberto' : 'Fechado'} ativo={d.aberto} onPress={() => alternarDiaAberto(d.dia)} />
            {d.aberto ? (
              <>
                <View style={{ width: 90 }}>
                  <Campo label="" value={d.abre} onChangeText={(v) => editarHorarioDia(d.dia, 'abre', v)} placeholder="08:00" />
                </View>
                <Text style={estilos.ate}>até</Text>
                <View style={{ width: 90 }}>
                  <Campo label="" value={d.fecha} onChangeText={(v) => editarHorarioDia(d.dia, 'fecha', v)} placeholder="18:00" />
                </View>
              </>
            ) : null}
          </View>
        ))}
      </SectionCard>

      <SectionCard titulo="Pagamento de professores" subtitulo="Base do cálculo de folha de pagamento (Financeiro)">
        <Text style={estilos.campoLabelSolto}>Remuneração calculada por</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Chip label="Por aula" ativo={tipoRemuneracao === 'POR_AULA'} onPress={() => setTipoRemuneracao('POR_AULA')} />
          <Chip label="Por aluno/mês" ativo={tipoRemuneracao === 'POR_ALUNO_MES'} onPress={() => setTipoRemuneracao('POR_ALUNO_MES')} />
        </View>
        <Campo
          label={tipoRemuneracao === 'POR_AULA' ? 'Valor por aula (R$)' : 'Valor por aluno/mês (R$)'}
          value={valorPorAula}
          onChangeText={setValorPorAula}
          placeholder="25.00"
          keyboardType="decimal-pad"
        />
        <Campo label="Dia de fechamento do mês" value={diaFechamento} onChangeText={setDiaFechamento} placeholder="Ex.: 25" keyboardType="number-pad" />
      </SectionCard>

      <SectionCard titulo="Catálogo" subtitulo="Planos, modalidades e cursos">
        <Botao texto="Abrir Planos, Modalidades e Cursos" variante="secundario" icone="library-outline" onPress={() => router.push('/(escola)/configuracoes-catalogo' as any)} />
      </SectionCard>
    </ErpShell>
  );
}

const estilos = StyleSheet.create({
  linhaDia: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, flexWrap: 'wrap' },
  diaNome: { fontSize: 13.5, fontWeight: '700', color: ERP.texto },
  ate: { fontSize: 12.5, color: ERP.textoMuted },
  campoLabelSolto: { fontSize: 12.5, fontWeight: '700', color: ERP.textoSecundario, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: ERP.raio.sm, borderWidth: 1,
    borderColor: ERP.bordaForte, backgroundColor: ERP.superficie,
  },
  chipAtivo: { backgroundColor: ERP.acentoSoft, borderColor: ERP.acento },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: ERP.textoSecundario },
  chipTextoAtivo: { color: ERP.acentoForte, fontWeight: '700' },
});
