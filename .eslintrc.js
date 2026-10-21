/**
 * ESLint Configuration for cds-mbt
 * 
 * ES6+ configuration for Node.js environment
 * with rules matching the existing code style.
 */

module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },

  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },

  extends: [
    'eslint:recommended'
  ],

  rules: {
    // Semicolons required (matching existing code style)
    'semi': ['error', 'always'],

    // Single quotes (matching existing code style)
    'quotes': ['error', 'single', { 'avoidEscape': true }],

    // Indentation (2 spaces)
    'indent': ['error', 2, { 'SwitchCase': 1 }],

    // No unused variables (warn for args prefixed with _)
    'no-unused-vars': ['error', { 
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_'
    }],

    // Consistent brace style
    'brace-style': ['error', '1tbs', { 'allowSingleLine': true }],

    // Comma dangle in multiline
    'comma-dangle': ['error', 'never'],

    // Consistent spacing
    'keyword-spacing': 'error',
    'space-before-blocks': 'error',
    'space-infix-ops': 'error',
    'space-in-parens': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],

    // No trailing spaces
    'no-trailing-spaces': 'error',

    // EOL at end of file
    'eol-last': ['error', 'always'],

    // No multiple empty lines
    'no-multiple-empty-lines': ['error', { 'max': 2, 'maxEOF': 1 }],

    // Prefer const
    'prefer-const': 'error',

    // No var
    'no-var': 'error',

    // Arrow function style
    'arrow-spacing': 'error',
    'arrow-parens': ['error', 'as-needed', { 'requireForBlockBody': true }],

    // Template literals over string concatenation
    'prefer-template': 'warn',

    // Object shorthand
    'object-shorthand': ['warn', 'properties'],

    // Consistent return
    'consistent-return': 'warn',

    // No console in production code (warn only)
    'no-console': 'off',

    // Require JSDoc for exported functions
    'require-jsdoc': 'off', // Handled by convention, not enforced

    // Valid JSDoc when present
    'valid-jsdoc': 'off'
  },

  overrides: [
    {
      // Test files can have slightly relaxed rules
      files: ['**/*.test.js', '**/*.spec.js', 'test/**/*.js'],
      rules: {
        'no-unused-expressions': 'off'
      }
    }
  ]
};
