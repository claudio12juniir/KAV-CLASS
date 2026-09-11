const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAdiRegistration = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      // Falso positivo de scanner de path-traversal: platformProjectRoot é
      // resolvido internamente pelo Expo config-plugins a partir do próprio
      // diretório do projeto (pasta android/ local) durante `expo prebuild` —
      // não vem de request HTTP, input de usuário nem de rede. Sem essa
      // entrada externa não há fronteira de confiança sendo cruzada aqui.
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/assets'
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        'DQWCMRCBPFBJKAAAAAAAAAAAAA'
      );
      return config;
    },
  ]);
};

module.exports = withAdiRegistration;
