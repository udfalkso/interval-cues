// Single source of truth for the marketing version is package.json — it flows to
// the native build (via prebuild), expo-constants, and the release scripts.
const { version } = require('./package.json');

module.exports = {
  expo: {
    // Home-screen label. The App Store Connect record is named "Interval Coach"
    // (the plain name "Intervals" is already taken on the store); the on-device
    // name does not need to be unique.
    name: 'Intervals',
    slug: 'intervals',
    version,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0F0F0F',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.udi.intervals',
      appleTeamId: 'K5FGQ428RU',
      infoPlist: {
        // audio background mode + a persistent (silent) audio session is what
        // keeps our JS timer alive while the screen is locked / phone pocketed.
        UIBackgroundModes: ['audio'],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.udi.intervals',
      edgeToEdgeEnabled: true,
    },
    plugins: ['expo-audio'],
    extra: {
      eas: {
        // Filled in later if we ever wire EAS; local xcodebuild + asc is the
        // real release path (see scripts/).
      },
    },
  },
};
