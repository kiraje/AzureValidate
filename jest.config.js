/** @type {import('jest').Config} */
module.exports = {
  projects: [
    // Node environment for existing JS tests
    {
      displayName: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.js'],
      testEnvironment: 'node',
    },
    // jsdom environment for React component tests
    {
      displayName: 'react',
      testMatch: ['<rootDir>/tests/**/*.test.tsx', '<rootDir>/tests/**/*.test.ts'],
      testEnvironment: 'jsdom',
      transform: {
        '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', {
          presets: [
            ['@babel/preset-env', { targets: { node: 'current' } }],
            ['@babel/preset-react', { runtime: 'automatic' }],
            '@babel/preset-typescript',
          ],
        }],
      },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
    },
  ],
};
