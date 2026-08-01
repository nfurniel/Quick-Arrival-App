const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// La carpeta de arriba es la web (Vite) y tiene su propio node_modules.
// Con esto Metro busca siempre primero en el node_modules del movil y no se
// lia cogiendo dependencias de la web.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
