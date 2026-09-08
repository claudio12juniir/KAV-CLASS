import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Documento raiz do build web (Expo Router). Criado pra travar o idioma da
// página: o tradutor automático do navegador (Google Translate no Chrome)
// reescreve textos e classes internas do DOM, o que embaralha layout e
// interações no app web — <html translate="no"> + meta "notranslate"
// desabilitam a oferta/execução de tradução automática, mantendo qualquer
// texto em inglês (nomes de marca, termos técnicos) do jeito que está.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR" translate="no">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="google" content="notranslate" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
