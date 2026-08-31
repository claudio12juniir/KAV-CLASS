import { BASE_URL, fetchComRetry } from '../app/api';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SyncLoader from './SyncLoader';

const API_URL = BASE_URL;

// Payload gravado no cartaz da sala (ver GET /api/salas/:id/cartaz no
// backend, S5.3): "KAVCLASS_SALA:<id>". Não é um link — a leitura acontece
// dentro do app, então não precisa ser uma URL abrível fora dele.
const PREFIXO_QR = 'KAVCLASS_SALA:';

export default function EscanearPresenca() {
  const navigation = useNavigation();
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const travaLeitura = useRef(false);

  const registrarPresenca = useCallback(async (salaId: string) => {
    setProcessando(true);
    try {
      const token = await SecureStore.getItemAsync('kav_token');
      const res = await fetchComRetry(`${API_URL}/api/presenca/qrcode`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ salaId }),
      });
      const dados = await res.json();
      if (res.ok) {
        setResultado({ ok: true, texto: dados.mensagem });
      } else {
        setResultado({ ok: false, texto: dados.erro || 'Não foi possível registrar.' });
      }
    } catch {
      setResultado({ ok: false, texto: 'Sem conexão com o servidor.' });
    } finally {
      setProcessando(false);
    }
  }, []);

  const aoLerCodigo = useCallback((evento: { data: string }) => {
    if (travaLeitura.current) return;
    const conteudo = evento.data || '';
    if (!conteudo.startsWith(PREFIXO_QR)) {
      Alert.alert('QR Code inválido', 'Esse código não é um QR Code de presença do KAV Class.');
      return;
    }
    travaLeitura.current = true;
    const salaId = conteudo.slice(PREFIXO_QR.length);
    registrarPresenca(salaId);
  }, [registrarPresenca]);

  const escanearNovamente = () => {
    setResultado(null);
    travaLeitura.current = false;
  };

  if (!permissao) {
    return (
      <View style={[styles.container, styles.centralizado]}>
        <SyncLoader size="large" color="#000000" />
      </View>
    );
  }

  if (!permissao.granted) {
    return (
      <View style={[styles.container, styles.centralizado, { paddingHorizontal: 30 }]}>
        <StatusBar style="dark" backgroundColor="#ffffff" />
        <Ionicons name="camera-outline" size={48} color="#999" />
        <Text style={styles.textoPermissao}>
          Pra escanear o QR Code de presença, o app precisa de acesso à câmera.
        </Text>
        <TouchableOpacity style={styles.botaoPrincipal} onPress={pedirPermissao}>
          <Text style={styles.botaoPrincipalTexto}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={styles.hamburger}>
          <Ionicons name="menu" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.titulo}>ESCANEAR PRESENÇA</Text>
        <View style={{ width: 40 }} />
      </View>

      {!resultado ? (
        <>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={processando ? undefined : aoLerCodigo}
          />
          <View style={styles.moldura} pointerEvents="none" />
          <Text style={styles.instrucao}>Aponte a câmera pro QR Code fixado na sala</Text>
          {processando && (
            <View style={styles.overlayProcessando}>
              <SyncLoader size="large" color="#ffffff" />
            </View>
          )}
        </>
      ) : (
        <View style={[styles.centralizado, { flex: 1, paddingHorizontal: 30 }]}>
          <Ionicons
            name={resultado.ok ? 'checkmark-circle' : 'close-circle'}
            size={72}
            color={resultado.ok ? '#1B7A3D' : '#B00020'}
          />
          <Text style={styles.resultadoTexto}>{resultado.texto}</Text>
          <TouchableOpacity style={styles.botaoPrincipal} onPress={escanearNovamente}>
            <Text style={styles.botaoPrincipalTexto}>Escanear outro</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centralizado: { justifyContent: 'center', alignItems: 'center' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  hamburger: { padding: 4 },
  titulo: { color: '#ffffff', fontSize: 14, fontWeight: 'bold', letterSpacing: 3 },
  moldura: {
    position: 'absolute', top: '30%', left: '15%', right: '15%', bottom: '40%',
    borderWidth: 3, borderColor: '#ffffff', borderRadius: 20,
  },
  instrucao: {
    position: 'absolute', bottom: 60, left: 0, right: 0,
    textAlign: 'center', color: '#ffffff', fontSize: 15, fontWeight: '600',
  },
  overlayProcessando: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  textoPermissao: { color: '#ccc', fontSize: 15, textAlign: 'center', marginTop: 16, marginBottom: 24, lineHeight: 22 },
  resultadoTexto: { color: '#ffffff', fontSize: 17, fontWeight: '600', textAlign: 'center', marginTop: 20, marginBottom: 30 },
  botaoPrincipal: { backgroundColor: '#32BCAD', borderRadius: 10, paddingHorizontal: 30, paddingVertical: 14 },
  botaoPrincipalTexto: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
