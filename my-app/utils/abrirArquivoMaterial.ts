// Fix: "erro ao abrir arquivo" em Materiais (18/09/2026) — a versão antiga
// (duplicada em 3 telas) derivava a extensão só do subtipo MIME
// ("application/vnd.openxmlformats-officedocument.wordprocessingml.document"
// virava a extensão inteira em vez de "docx"), o que quebra a abertura de
// Word/Excel/PowerPoint/vários áudios. Agora usa o nome do arquivo original
// (Material.nomeArquivo, salvo no upload) quando disponível, com um mapa de
// MIME → extensão como fallback pra materiais antigos enviados antes desse
// campo existir.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

const MIME_PARA_EXTENSAO: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function extensaoDoArquivo(nomeArquivo: string | null | undefined, mimeType: string): string {
  if (nomeArquivo) {
    const match = nomeArquivo.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1].toLowerCase();
  }
  const mimeLimpo = mimeType.split(';')[0].trim().toLowerCase();
  if (MIME_PARA_EXTENSAO[mimeLimpo]) return MIME_PARA_EXTENSAO[mimeLimpo];
  // Último recurso: tenta limpar o subtipo MIME (ex.: "vnd.foo+xml" -> "xml").
  const subtipo = mimeLimpo.split('/')[1] || 'bin';
  return subtipo.split('+').pop()?.split('.').pop() || 'bin';
}

export async function abrirArquivoBase64Material(anexo: { id: string; titulo: string; conteudo?: string | null; nomeArquivo?: string | null }) {
  const matches = anexo.conteudo?.match(/^data:([^;]+);base64,(.+)$/s);
  if (!matches) {
    throw new Error('Formato de arquivo não reconhecido.');
  }
  const mimeType = matches[1];
  const base64Data = matches[2];
  const ext = extensaoDoArquivo(anexo.nomeArquivo, mimeType);
  const nomeFinal = anexo.nomeArquivo || `${anexo.titulo}.${ext}`;
  const fileUri = `${FileSystem.cacheDirectory}${nomeFinal.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await FileSystem.writeAsStringAsync(fileUri, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // Linking.openURL com file:// falha no Android (bloqueado desde o Android 7+);
  // Sharing usa FileProvider (content://) por baixo dos panos e funciona nas
  // duas plataformas — no iOS, a extensão correta no fileUri (ao contrário
  // da versão antiga) já basta pro sistema resolver o tipo/app certo, sem
  // precisar de UTI explícito.
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: anexo.titulo });
  } else {
    await Linking.openURL(fileUri);
  }
}
