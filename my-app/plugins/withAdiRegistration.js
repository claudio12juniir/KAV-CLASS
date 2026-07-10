const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAdiRegistration = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
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
