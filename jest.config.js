/**
 * Jest Configuration for cds-mbt
 * 
 * Standard Jest configuration with coverage thresholds
 * for model-based testing library.
 */

module.exports = {
  // Test file patterns
  testMatch: [
    '**/*.test.js',
    '**/*.spec.js'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/examples/',
    '/templates/'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'lib/**/*.js',
    '!lib/**/*.test.js',
    '!lib/**/*.spec.js'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'html'
  ],

  // Test environment
  testEnvironment: 'node',

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Timeout for async tests (10 seconds)
  testTimeout: 10000,

  // Module paths
  moduleDirectories: [
    'node_modules',
    'lib'
  ],

  // Setup files
  setupFilesAfterEnv: [],

  // Transform ignore patterns (don't transform node_modules)
  transformIgnorePatterns: [
    '/node_modules/'
  ]
};
