// Rede Social Fase 3 — perfil público "vitrine". Acessível a partir da
// tela de Busca (qualquer papel: professor, aluno, ou conta neutra), fora
// dos grupos de rota (professor)/(aluno) de propósito — é a mesma tela
// pra quem quer que esteja olhando.

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES } from '../constants/theme';
import { apiFetch } from './api';
import SyncLoader from '../components/SyncLoader';

type PerfilProfessor = {
  id: string; nome: string; fotoUrl: string | null; bio: string | null;
  cidade: string | null; estado: string | null; cursos: string[];
  videoApresentacaoUrl: string | null; notaMedia: number | null; totalAvaliacoes: number;
  precoAssinaturaPremium: number | null;
};

type PerfilEscola = {
  id: string; nome: string; logoUrl: string | null; bio: string | null;
  cidade: string | null; estado: string | null; cursos: string[];
  notaMedia: number | null; totalAvaliacoes: number;
};

export default function PerfilPublicoScreen() {
  const { id, tipo } = useLocalSearchParams<{ id: string; tipo: 'professor' | 'escola' }>();
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState<(PerfilProfessor | PerfilEscola) | null>(null);
  const [erro, setErro] = useState(false);
  const [papel, setPapel] = useState<string | null>(null);
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [carregandoPremium, setCarregandoPremium] = useState(false);
  const [processandoPremium, setProcessandoPremium] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const endpoint = tipo === 'escola' ? `/escolas/${id}/perfil-publico` : `/professores/${id}/perfil-publico`;
        const resposta = await apiFetch(endpoint);
        if (!resposta.ok) { setErro(true); return; }
        setPerfil(await resposta.json());
      } catch {
        setErro(true);
      } finally {
        setCarregando(false);
      }
    })();
    SecureStore.getItemAsync('kav_papel').then(setPapel);
  }, [id, tipo]);

  useEffect(() => {
    if (tipo !== 'professor' || papel !== 'aluno') return;
    (async () => {
      setCarregandoPremium(true);
      try {
        const resposta = await apiFetch(`/professores/${id}/premium/status`);
        if (resposta.ok) {
          const dados = await resposta.json();
          setAssinaturaAtiva(!!dados.ativa);
        }
      } catch {
        // silencioso — botão de assinar continua disponível
      } finally {
        setCarregandoPremium(false);
      }
    })();
  }, [id, tipo, papel]);

  const assinarPremium = async () => {
    setProcessandoPremium(true);
    try {
      const resposta = await apiFetch(`/professores/${id}/premium/assinar`, { method: 'POST' });
      const dados = await resposta.json();
      if (resposta.ok && dados.url) {
        await Linking.openURL(dados.url);
      } else {
        Alert.alert('Erro', dados.erro || 'Não foi possível iniciar a assinatura.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Não foi possível falar com o servidor.');
    } finally {
      setProcessandoPremium(false);
    }
  };

  const cancelarPremium = () => {
    Alert.alert(
      'Cancelar assinatura',
      'Você mantém acesso ao conteúdo exclusivo até o fim do período já pago. Deseja continuar?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar assinatura', style: 'destructive', onPress: async () => {
            setProcessandoPremium(true);
            try {
              const resposta = await apiFetch(`/professores/${id}/premium/cancelar`, { method: 'POST' });
              const dados = await resposta.json();
              if (resposta.ok) {
                Alert.alert('Assinatura cancelada', dados.mensagem);
              } else {
                Alert.alert('Erro', dados.erro || 'Não foi possível cancelar.');
              }
            } catch {
              Alert.alert('Erro de conexão', 'Não foi possível falar com o servidor.');
            } finally {
              setProcessandoPremium(false);
            }
          },
        },
      ]
    );
  };

  const foto = perfil ? ('fotoUrl' in perfil ? perfil.fotoUrl : perfil.logoUrl) : null;
  const precoPremium = perfil && tipo === 'professor' ? (perfil as PerfilProfessor).precoAssinaturaPremium : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topo}>
        <TouchableOpacity onPress={() => router.back()} style={styles.voltar}>
          <Ionicons name="arrow-back" size={22} color={CORES.primaria} />
        </TouchableOpacity>
        <Text style={styles.topoTitulo}>{tipo === 'escola' ? 'Escola' : 'Professor'}</Text>
      </View>

      {carregando ? (
        <View style={styles.centro}><SyncLoader size="large" color={CORES.primaria} /></View>
      ) : erro || !perfil ? (
        <View style={styles.centro}>
          <Text style={styles.erroTexto}>Perfil não encontrado.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.cabecalho}>
            {foto ? (
              <Image source={{ uri: foto }} style={styles.foto} />
            ) : (
              <View style={styles.fotoFallback}>
                <Text style={styles.fotoLetra}>{perfil.nome[0]?.toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.nome}>{perfil.nome}</Text>
            {(perfil.cidade || perfil.estado) && (
              <Text style={styles.local}>
                <Ionicons name="location-outline" size={13} color={CORES.secundaria} />{' '}
                {[perfil.cidade, perfil.estado].filter(Boolean).join(' - ')}
              </Text>
            )}
            {perfil.notaMedia != null && (
              <View style={styles.notaBox}>
                <Ionicons name="star" size={16} color="#E6A700" />
                <Text style={styles.notaTexto}>{perfil.notaMedia.toFixed(1)} ({perfil.totalAvaliacoes} avaliações)</Text>
              </View>
            )}
          </View>

          {perfil.bio ? (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Sobre</Text>
              <Text style={styles.bioTexto}>{perfil.bio}</Text>
            </View>
          ) : null}

          {perfil.cursos?.length > 0 && (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Cursos</Text>
              <View style={styles.cursosLista}>
                {perfil.cursos.map((c) => (
                  <View key={c} style={styles.cursoChip}><Text style={styles.cursoChipTexto}>{c}</Text></View>
                ))}
              </View>
            </View>
          )}

          {'videoApresentacaoUrl' in perfil && perfil.videoApresentacaoUrl ? (
            <TouchableOpacity
              style={styles.videoBotao}
              onPress={() => Linking.openURL(perfil.videoApresentacaoUrl!)}
            >
              <Ionicons name="play-circle-outline" size={20} color="#ffffff" />
              <Text style={styles.videoBotaoTexto}>Ver vídeo de apresentação</Text>
            </TouchableOpacity>
          ) : null}

          {precoPremium ? (
            <View style={styles.premiumBox}>
              <View style={styles.premiumTopo}>
                <Ionicons name="star" size={18} color="#E6A700" />
                <Text style={styles.premiumTitulo}>Conteúdo exclusivo</Text>
              </View>
              <Text style={styles.premiumTexto}>
                Assine por R$ {precoPremium.toFixed(2).replace('.', ',')}/mês e tenha acesso aos posts exclusivos deste professor no feed.
              </Text>
              {papel !== 'aluno' ? null : carregandoPremium ? (
                <SyncLoader size="small" color={CORES.primaria} />
              ) : assinaturaAtiva ? (
                <>
                  <View style={styles.premiumAtivoBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={CORES.sucesso} />
                    <Text style={styles.premiumAtivoTexto}>Assinatura ativa</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.premiumBotaoCancelar}
                    onPress={cancelarPremium}
                    disabled={processandoPremium}
                  >
                    <Text style={styles.premiumBotaoCancelarTexto}>{processandoPremium ? 'Aguarde...' : 'Cancelar assinatura'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.premiumBotaoAssinar}
                  onPress={assinarPremium}
                  disabled={processandoPremium}
                >
                  <Text style={styles.premiumBotaoAssinarTexto}>{processandoPremium ? 'Abrindo...' : 'Assinar conteúdo exclusivo'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  voltar: { padding: 4 },
  topoTitulo: { fontSize: 16, fontWeight: '700', color: CORES.primaria },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  erroTexto: { color: CORES.secundaria, fontSize: 14 },
  cabecalho: { alignItems: 'center', marginBottom: 20 },
  foto: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  fotoFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: CORES.acento, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  fotoLetra: { color: '#ffffff', fontWeight: '700', fontSize: 32 },
  nome: { fontSize: 20, fontWeight: '700', color: CORES.primaria },
  local: { fontSize: 13, color: CORES.secundaria, marginTop: 4 },
  notaBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  notaTexto: { fontSize: 13, color: CORES.primaria, fontWeight: '600' },
  secao: { marginBottom: 20 },
  secaoTitulo: { fontSize: 13, fontWeight: '700', color: CORES.secundaria, marginBottom: 8, letterSpacing: 0.5 },
  bioTexto: { fontSize: 14, color: CORES.primaria, lineHeight: 20 },
  cursosLista: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cursoChip: { backgroundColor: CORES.acentoClaro, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  cursoChipTexto: { color: CORES.acento, fontSize: 12, fontWeight: '600' },
  videoBotao: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: CORES.primaria, borderRadius: 8, paddingVertical: 12, marginTop: 4 },
  videoBotaoTexto: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  premiumBox: { backgroundColor: CORES.acentoClaro, borderRadius: 12, padding: 16, marginTop: 8 },
  premiumTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  premiumTitulo: { fontSize: 14, fontWeight: '700', color: CORES.primaria },
  premiumTexto: { fontSize: 13, color: CORES.secundaria, lineHeight: 18, marginBottom: 12 },
  premiumAtivoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  premiumAtivoTexto: { fontSize: 13, fontWeight: '600', color: CORES.sucesso },
  premiumBotaoAssinar: { backgroundColor: CORES.acento, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  premiumBotaoAssinarTexto: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  premiumBotaoCancelar: { borderWidth: 1, borderColor: CORES.erro, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  premiumBotaoCancelarTexto: { color: CORES.erro, fontWeight: '700', fontSize: 13 },
});
