const config = {
  rootDir: './',
  modulePaths: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js'],
  clearMocks: true,
  resetMocks: true,
  transform: {
    '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$': ['ts-jest'],
  },
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
  testTimeout: 60000
}

module.exports = config
