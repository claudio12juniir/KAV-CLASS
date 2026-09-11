// Comunicados recebidos — aluno INSTITUTION (Sprint 11, briefing
// 08/09/2026). Backend já existia (GET /api/aluno/comunicados,
// PUT /api/aluno/comunicados/:envioId/lido), mas nenhuma tela consumia
// (auditoria INSTITUTION, 11/09/2026). Sem anexos — Comunicado é só
// título+corpo (texto simples), mesmo formato da tela de quem envia
// ((escola)/comunicados.tsx).
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EstadoVazio, PageHeader, SectionCard } from '../(escola)/_ui';
import { ERP } from '../../constants/erpTheme';
import { MobileErpShell } from '../../components/institution/MobileErpShell';
import { BASE_URL, fetchComRetry } from '../api';
import { useAlunoEscolaContexto } from './_contexto';
import { NAV_ALUNO_ESCOLA } from './_nav';

type Envio = {
  id: string; lidoEm: string | null;
  comunicado: { id: string; titulo: string; corpo: string; enviadoEm: string | null };
};

export default function ComunicadosAlunoEscola() {
  const { nome, fotoUrl, escolaNome, sair } = useAlunoEscolaContexto();

  const [carregando, setCarregando] = useState(true);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${BASE_URL}/api/aluno/comunicados`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEnvios(await res.json());
    } catch {
      // sem conexão — usuário pode reabrir a tela pra tentar de novo
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrir = async (envio: Envio) => {
    setExpandido(expandido === envio.id ? null : envio.id);
    if (!envio.lidoEm) {
      setEnvios((prev) => prev.map((e) => (e.id === envio.id ? { ...e, lidoEm: new Date().toISOString() } : e)));
      try {
        const token = await SecureStore.getItemAsync('kav_token');
        await fetchComRetry(`${BASE_URL}/api/aluno/comunicados/${envio.id}/lido`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // marcar como lido é best-effort — não vale travar a leitura por isso
      }
    }
  };

  return (
    <MobileErpShell
      titulo="Comunicados"
      navGrupos={NAV_ALUNO_ESCOLA}
      rotaBase="/(aluno-escola)"
      identidade={{ nome, fotoUrl, subtitulo: escolaNome }}
      tag="Aluno"
      aoSair={sair}
      carregando={carregando}
    >
      <PageHeader titulo="Comunicados" subtitulo={`Avisos de ${escolaNome || 'sua escola'}`} />

      <SectionCard>
        {envios.length === 0 ? (
          <EstadoVazio icone="megaphone-outline" texto="Nenhum comunicado recebido ainda." />
        ) : (
          envios.map((envio) => {
            const aberto = expandido === envio.id;
            return (
              <TouchableOpacity key={envio.id} style={estilos.card} onPress={() => abrir(envio)} activeOpacity={0.7}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {!envio.lidoEm && <View style={estilos.pontoNaoLido} />}
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.titulo}>{envio.comunicado.titulo}</Text>
                    {envio.comunicado.enviadoEm && (
                      <Text style={estilos.data}>{new Date(envio.comunicado.enviadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
                    )}
                  </View>
                  <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={ERP.textoMuted} />
                </View>
                {aberto && <Text style={estilos.corpo}>{envio.comunicado.corpo}</Text>}
              </TouchableOpacity>
            );
          })
        )}
      </SectionCard>
    </MobileErpShell>
  );
}

const estilos = StyleSheet.create({
  card: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ERP.bordaSuave,
  },
  pontoNaoLido: { width: 8, height: 8, borderRadius: 4, backgroundColor: ERP.info },
  titulo: { fontSize: 14, fontWeight: '700', color: ERP.texto },
  data: { fontSize: 11.5, color: ERP.textoMuted, marginTop: 2, textTransform: 'uppercase' },
  corpo: { fontSize: 13.5, color: ERP.textoSecundario, lineHeight: 20, marginTop: 10 },
});
