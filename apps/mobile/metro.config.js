const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-symbols подменяем заглушкой: см. src/stubs/expo-symbols.js.
const stub = path.resolve(__dirname, 'src/stubs/expo-symbols.js');
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) =>
  name === 'expo-symbols'
    ? { type: 'sourceFile', filePath: stub }
    : (resolve ?? context.resolveRequest)(context, name, platform);

module.exports = config;
