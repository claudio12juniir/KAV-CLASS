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
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CORES, RAIO } from '../constants/theme';
import { apiFetch } from './api';
import SyncLoader from '../components/SyncLoader';
import Avatar from '../components/ui/Avatar';
import ReelCard, { Reel, reelThumbnailUrl } from '../components/ui/ReelCard';

type ModalidadeEnsino = 'PRESENCIAL' | 'REMOTO' | 'ONLINE';
const MODALIDADE_LABEL: Record<ModalidadeEnsino, string> = {
  PRESENCIAL: 'Presencial', REMOTO: 'Remoto', ONLINE: 'Online',
};

type AvaliacaoPublica = {
  id: string; nota: number; comentario: string | null; createdAt: string;
  aluno: { nome: string; fotoUrl: string | null };
};

type PerfilProfessor = {
  id: string; nome: string; fotoUrl: string | null; bio: string | null;
  cidade: string | null; estado: string | null; cursos: string[];
  videoApresentacaoUrl: string | null; notaMedia: number | null; totalAvaliacoes: number;
  precoAssinaturaPremium: number | null; modalidadeEnsino: ModalidadeEnsino[];
  avaliacoes: AvaliacaoPublica[];
};

type PerfilEscola = {
  id: string; nome: string; logoUrl: string | null; bio: string | null;
  cidade: string | null; estado: string | null; cursos: string[];
  notaMedia: number | null; totalAvaliacoes: number; modalidadeEnsino: ModalidadeEnsino[];
  avaliacoes: AvaliacaoPublica[];
};

export default function PerfilPublicoScreen() {
  const { id, tipo } = useLocalSearchParams<{ id: string; tipo: 'professor' | 'escola' }>();
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState<(PerfilProfessor | PerfilEscola) | null>(null);
  const [erro, setErro] = useState(false);
  const [papel, setPapel] = useState<string | null>(null);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [assinaturaAtiva, setAssinaturaAtiva] = useState(false);
  const [carregandoPremium, setCarregandoPremium] = useState(false);
  const [processandoPremium, setProcessandoPremium] = useState(false);
  const [reels, setReels] = useState<Omit<Reel, 'autor'>[]>([]);
  const [reelAberto, setReelAberto] = useState<Reel | null>(null);

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
    SecureStore.getItemAsync('kav_papel').then(async (p) => {
      setPapel(p);
      if (p === 'professor' || p === 'aluno') {
        setMeuId(await SecureStore.getItemAsync(p === 'professor' ? 'kav_professor_id' : 'kav_aluno_id'));
      }
    });
  }, [id, tipo]);

  const abrirMensagem = () => {
    if (!perfil) return;
    router.push({
      pathname: papel === 'professor' ? '/(professor)/chat' : '/(aluno)/chat',
      params: { tipo: 'professor', id: perfil.id, nome: perfil.nome, fotoUrl: 'fotoUrl' in perfil ? (perfil.fotoUrl || '') : '' },
    } as any);
  };

  const [enviandoInteresse, setEnviandoInteresse] = useState(false);
  const querSerAluno = async () => {
    if (!perfil || enviandoInteresse) return;
    setEnviandoInteresse(true);
    try {
      const endpoint = tipo === 'escola' ? `/escolas/${perfil.id}/quero-ser-aluno` : `/professores/${perfil.id}/quero-ser-aluno`;
      const resposta = await apiFetch(endpoint, { method: 'POST' });
      const dados = await resposta.json();
      if (resposta.ok) {
        Alert.alert('Pronto!', dados.mensagem);
      } else {
        Alert.alert('Não foi possível', dados.erro || 'Tente novamente mais tarde.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Não foi possível falar com o servidor.');
    } finally {
      setEnviandoInteresse(false);
    }
  };

  useEffect(() => {
    const endpoint = tipo === 'escola' ? `/escolas/${id}/reels` : `/professores/${id}/reels`;
    apiFetch(endpoint).then((r) => r.ok && r.json()).then((d) => d && setReels(d.reels || [])).catch(() => {});
  }, [id, tipo]);

  const abrirReel = (r: Omit<Reel, 'autor'>) => {
    if (!perfil) return;
    setReelAberto({
      ...r,
      autor: tipo === 'escola'
        ? { tipo: 'escola', id: perfil.id, nome: perfil.nome, fotoUrl: (perfil as PerfilEscola).logoUrl }
        : { tipo: 'professor', id: perfil.id, nome: perfil.nome, fotoUrl: (perfil as PerfilProfessor).fotoUrl },
    });
  };

  const curtirReelAberto = async () => {
    if (!reelAberto) return;
    const atualizado = { ...reelAberto, curtidoPeloUsuario: !reelAberto.curtidoPeloUsuario, totalCurtidas: reelAberto.totalCurtidas + (reelAberto.curtidoPeloUsuario ? -1 : 1) };
    setReelAberto(atualizado);
    setReels((atual) => atual.map((r) => r.id === atualizado.id ? atualizado : r));
    try {
      await apiFetch(`/reels/${reelAberto.id}/curtir`, { method: 'POST' });
    } catch {
      // otimista — se falhar, o próximo carregamento da lista ressincroniza
    }
  };

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
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.banner} />
          <View style={styles.corpo}>
          <View style={styles.cabecalho}>
            <View style={styles.fotoAnel}>
              <Avatar fotoUrl={foto} nome={perfil.nome} tamanho={84} />
            </View>
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
            {perfil.modalidadeEnsino?.length > 0 && (
              <View style={styles.modalidadeLista}>
                {perfil.modalidadeEnsino.map((m) => (
                  <View key={m} style={styles.modalidadeBadge}>
                    <Text style={styles.modalidadeBadgeTexto}>{MODALIDADE_LABEL[m] || m}</Text>
                  </View>
                ))}
              </View>
            )}
            {(papel === 'professor' || papel === 'aluno' || papel === 'conta') && perfil.id !== meuId && (
              <View style={styles.acoesLinha}>
                {tipo === 'professor' && (papel === 'professor' || papel === 'aluno') && (
                  <TouchableOpacity style={styles.botaoMensagem} onPress={abrirMensagem} activeOpacity={0.85}>
                    <Ionicons name="chatbubble-outline" size={16} color={CORES.acento} />
                    <Text style={styles.botaoMensagemTexto}>Mensagem</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.botaoMensagem, styles.botaoQuerSerAluno]}
                  onPress={querSerAluno}
                  disabled={enviandoInteresse}
                  activeOpacity={0.85}
                >
                  <Ionicons name="hand-right-outline" size={16} color="#ffffff" />
                  <Text style={[styles.botaoMensagemTexto, { color: '#ffffff' }]}>
                    {enviandoInteresse ? 'Enviando...' : 'Quero ser aluno'}
                  </Text>
                </TouchableOpacity>
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

          {perfil.avaliacoes?.length > 0 && (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Avaliações</Text>
              {perfil.avaliacoes.map((a) => (
                <View key={a.id} style={styles.avaliacaoItem}>
                  <Avatar fotoUrl={a.aluno.fotoUrl} nome={a.aluno.nome} tamanho={36} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.avaliacaoTopo}>
                      <Text style={styles.avaliacaoNome}>{a.aluno.nome}</Text>
                      <Text style={styles.avaliacaoData}>{new Date(a.createdAt).toLocaleDateString('pt-BR')}</Text>
                    </View>
                    <View style={styles.avaliacaoEstrelas}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons key={n} name={n <= a.nota ? 'star' : 'star-outline'} size={13} color="#E6A700" />
                      ))}
                    </View>
                    {a.comentario ? <Text style={styles.avaliacaoTexto}>{a.comentario}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          )}

          {reels.length > 0 && (
            <View style={styles.secao}>
              <Text style={styles.secaoTitulo}>Reels</Text>
              <View style={styles.reelsGrid}>
                {reels.map((r) => (
                  <TouchableOpacity key={r.id} style={styles.reelGridItem} onPress={() => abrirReel(r)} activeOpacity={0.85}>
                    <Image source={{ uri: reelThumbnailUrl(r as any) }} style={styles.reelGridThumb} />
                    <Ionicons name="play" size={16} color="#ffffff" style={styles.reelGridPlayIcone} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

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
          </View>
        </ScrollView>
      )}

      <Modal visible={!!reelAberto} animationType="slide" onRequestClose={() => setReelAberto(null)}>
        {reelAberto && (
          <View style={{ flex: 1 }}>
            <ReelCard
              reel={reelAberto}
              ativo
              podeApagar={false}
              onVerPerfil={() => {}}
              onCurtir={curtirReelAberto}
              onAbrirComentarios={() => {}}
              onApagar={() => {}}
            />
            <TouchableOpacity style={styles.reelFecharBotao} onPress={() => setReelAberto(null)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
      </Modal>
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
  banner: { height: 100, backgroundColor: CORES.acentoClaro },
  corpo: { paddingHorizontal: 20 },
  cabecalho: { alignItems: 'center', marginTop: -44, marginBottom: 20 },
  fotoAnel: { borderRadius: 46, borderWidth: 3, borderColor: CORES.fundo, marginBottom: 12 },
  nome: { fontSize: 20, fontWeight: '700', color: CORES.primaria },
  local: { fontSize: 13, color: CORES.secundaria, marginTop: 4 },
  notaBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  notaTexto: { fontSize: 13, color: CORES.primaria, fontWeight: '600' },
  modalidadeLista: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' },
  modalidadeBadge: { backgroundColor: CORES.acentoClaro, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  modalidadeBadgeTexto: { color: CORES.acento, fontSize: 11, fontWeight: '700' },
  acoesLinha: { flexDirection: 'row', gap: 10, marginTop: 14 },
  botaoMensagem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: CORES.acento, borderRadius: RAIO.pill,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  botaoMensagemTexto: { color: CORES.acento, fontWeight: '700', fontSize: 13 },
  botaoQuerSerAluno: { backgroundColor: CORES.acento },
  secao: { marginBottom: 20 },
  secaoTitulo: { fontSize: 13, fontWeight: '700', color: CORES.secundaria, marginBottom: 8, letterSpacing: 0.5 },
  bioTexto: { fontSize: 14, color: CORES.primaria, lineHeight: 20 },
  cursosLista: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cursoChip: { backgroundColor: CORES.acentoClaro, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  cursoChipTexto: { color: CORES.acento, fontSize: 12, fontWeight: '600' },
  avaliacaoItem: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 14, marginTop: 14 },
  avaliacaoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avaliacaoNome: { fontSize: 13, fontWeight: '700', color: CORES.primaria },
  avaliacaoData: { fontSize: 11, color: CORES.secundaria },
  avaliacaoEstrelas: { flexDirection: 'row', gap: 2, marginTop: 3, marginBottom: 4 },
  avaliacaoTexto: { fontSize: 13, color: CORES.primaria, lineHeight: 18 },
  reelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reelGridItem: { width: '32%', aspectRatio: 9 / 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' },
  reelGridThumb: { width: '100%', height: '100%' },
  reelGridPlayIcone: { position: 'absolute', top: 6, right: 6 },
  reelFecharBotao: { position: 'absolute', top: 52, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  videoBotao: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: CORES.primaria, borderRadius: RAIO.pill, paddingVertical: 12, marginTop: 4 },
  videoBotaoTexto: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  premiumBox: { backgroundColor: CORES.acentoClaro, borderRadius: 12, padding: 16, marginTop: 8 },
  premiumTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  premiumTitulo: { fontSize: 14, fontWeight: '700', color: CORES.primaria },
  premiumTexto: { fontSize: 13, color: CORES.secundaria, lineHeight: 18, marginBottom: 12 },
  premiumAtivoBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  premiumAtivoTexto: { fontSize: 13, fontWeight: '600', color: CORES.sucesso },
  premiumBotaoAssinar: { backgroundColor: CORES.acento, borderRadius: RAIO.pill, paddingVertical: 12, alignItems: 'center' },
  premiumBotaoAssinarTexto: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  premiumBotaoCancelar: { borderWidth: 1, borderColor: CORES.erro, borderRadius: RAIO.pill, paddingVertical: 12, alignItems: 'center' },
  premiumBotaoCancelarTexto: { color: CORES.erro, fontWeight: '700', fontSize: 13 },
});
