// Tempo relativo compacto estilo X/Instagram ("3h", "2d", "1sem") — usado
// no cabeçalho dos posts do feed em vez da data cheia.
export function tempoRelativo(iso: string): string {
  const segundos = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'agora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `${dias}d`;
  const semanas = Math.floor(dias / 7);
  if (semanas < 5) return `${semanas}sem`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
