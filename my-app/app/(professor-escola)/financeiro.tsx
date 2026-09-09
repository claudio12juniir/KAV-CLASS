// Financeiro do professor INSTITUTION — folha de pagamento do mês (mesmo
// dado que a escola vê sobre ele), com comprovantes anexados pela escola e
// estimativa de valor a receber. GET /api/professor/folha-pagamento é o
// mesmo endpoint já usado por (professor)/pagamento.tsx no SELF, agora
// estendido com o campo aditivo estimativaRestanteMes.
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, EstadoVazio, Kpi, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useProfessorEscolaContexto } from './_contexto';
import { NAV_PROFESSOR_ESCOLA } from './_nav';

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type Folha = {
  id: string | null;
  mes: number;
  ano: number;
  valorCalculado: number;
  valorAjustado: number | null;
  comprovantes: string[];
  status: 'ABERTA' | 'FECHADA';
  estimativaRestanteMes: number | null;
};

function formatarMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function FinanceiroProfessorEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useProfessorEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [mesAtual, setMesAtual] = useState(() => { const d = new Date(); return { mes: d.getMonth() + 1, ano: d.getFullYear() }; });
  const [folha, setFolha] = useState<Folha | null>(null);

  const carregar = useCallback(async (mes: number, ano: number) => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/professor/folha-pagamento?mes=${mes}&ano=${ano}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setFolha(await res.json());
    } catch {
      // sem conexão — tela fica vazia, dá pra tentar de novo trocando de mês
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(mesAtual.mes, mesAtual.ano); }, [carregar, mesAtual]);

  const mudarMes = (delta: number) => {
    setMesAtual((atual) => {
      const d = new Date(atual.ano, atual.mes - 1 + delta, 1);
      return { mes: d.getMonth() + 1, ano: d.getFullYear() };
    });
  };

  const valorFinal = folha ? (folha.valorAjustado ?? folha.valorCalculado) : 0;

  return (
    <MobileErpShell
      titulo="Financeiro"
      navGrupos={NAV_PROFESSOR_ESCOLA}
      rotaBase="/(professor-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Professor"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Financeiro" subtitulo="Sua folha de pagamento na escola" />

      <SectionCard>
        <View style={estilos.cabecalhoMes}>
          <TouchableOpacity onPress={() => mudarMes(-1)} style={estilos.setaBtn}>
            <Ionicons name="chevron-back" size={18} color={ERP.texto} />
          </TouchableOpacity>
          <Text style={estilos.tituloMes}>{NOMES_MES[mesAtual.mes - 1]} {mesAtual.ano}</Text>
          <TouchableOpacity onPress={() => mudarMes(1)} style={estilos.setaBtn}>
            <Ionicons name="chevron-forward" size={18} color={ERP.texto} />
          </TouchableOpacity>
        </View>

        {folha && (
          <>
            <View style={estilos.linhaKpis}>
              <Kpi label="Valor da folha" valor={formatarMoeda(valorFinal)} tom="sucesso" />
              {folha.estimativaRestanteMes != null && (
                <Kpi label="Estimativa a receber (restante do mês)" valor={formatarMoeda(folha.estimativaRestanteMes)} />
              )}
            </View>
            <View style={estilos.statusLinha}>
              <Badge texto={folha.status === 'FECHADA' ? 'Folha fechada' : 'Folha aberta'} tom={folha.status === 'FECHADA' ? 'sucesso' : 'aviso'} />
              {folha.valorAjustado != null && (
                <Text style={estilos.ajusteTexto}>valor ajustado pela escola (calculado: {formatarMoeda(folha.valorCalculado)})</Text>
              )}
            </View>
          </>
        )}
      </SectionCard>

      <SectionCard titulo="Comprovantes de pagamento">
        {!folha?.comprovantes?.length ? (
          <EstadoVazio icone="receipt-outline" texto="A escola ainda não anexou comprovante deste mês." />
        ) : (
          folha.comprovantes.map((url, i) => (
            <TouchableOpacity key={i} style={estilos.comprovanteLinha} onPress={() => Linking.openURL(url)}>
              <Ionicons name="document-attach-outline" size={18} color={ERP.acentoForte} />
              <Text style={estilos.comprovanteTexto} numberOfLines={1}>Comprovante {i + 1}</Text>
              <Ionicons name="open-outline" size={16} color={ERP.textoMuted} />
            </TouchableOpacity>
          ))
        )}
      </SectionCard>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  cabecalhoMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  setaBtn: { padding: 6 },
  tituloMes: { fontSize: 15, fontWeight: '800', color: ERP.texto },
  linhaKpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  ajusteTexto: { fontSize: 11.5, color: ERP.textoMuted, fontStyle: 'italic' },
  comprovanteLinha: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave,
  },
  comprovanteTexto: { flex: 1, fontSize: 13.5, color: ERP.texto },
});
