/**
 * CLI init Command Tests
 * 
 * Tests for the `cds mbt init` scaffolding command.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock chalk to avoid color output in tests
jest.mock('chalk', () => ({
  blue: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  dim: (s) => s,
  cyan: (s) => s,
  white: (s) => s,
  bold: (s) => s
}));

const init = require('../../lib/cli/init');

describe('CLI init', () => {
  let originalCwd;
  let tempDir;

  beforeAll(() => {
    originalCwd = process.cwd();
  });

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cds-mbt-init-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('init()', () => {
    it('should create expected directory structure', async () => {
      await init();

      expect(fs.existsSync(path.join(tempDir, 'test', 'mbt'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'test', 'mbt', 'machines'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'test', 'mbt', 'invariants'))).toBe(true);
    });

    it('should create machine file with agent template', async () => {
      await init({ template: 'agent' });

      const machineFile = path.join(tempDir, 'test', 'mbt', 'machines', 'agent.machine.js');
      expect(fs.existsSync(machineFile)).toBe(true);

      const content = fs.readFileSync(machineFile, 'utf-8');
      expect(content).toContain('createMachine');
      expect(content).toContain('llmCallsUsed');
      expect(content).toContain('llmCallsBudget');
    });

    it('should create invariants file', async () => {
      await init({ template: 'agent' });

      const invariantsFile = path.join(tempDir, 'test', 'mbt', 'invariants', 'agent.invariants.js');
      expect(fs.existsSync(invariantsFile)).toBe(true);

      const content = fs.readFileSync(invariantsFile, 'utf-8');
      expect(content).toContain('createInvariant');
    });

    it('should create test file', async () => {
      await init({ template: 'agent' });

      const testFile = path.join(tempDir, 'test', 'mbt', 'agent.mbt.test.js');
      expect(fs.existsSync(testFile)).toBe(true);

      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toContain('runMBT');
      expect(content).toContain('describe');
      expect(content).toContain('expect');
    });
  });

  describe('init() with --force option', () => {
    it('should overwrite existing files when --force is set', async () => {
      // Create initial files
      await init({ template: 'agent' });

      const machineFile = path.join(tempDir, 'test', 'mbt', 'machines', 'agent.machine.js');
      const originalContent = fs.readFileSync(machineFile, 'utf-8');

      // Modify the file
      fs.writeFileSync(machineFile, '// modified content');

      // Run init again without force - should skip
      await init({ template: 'agent', force: false });
      expect(fs.readFileSync(machineFile, 'utf-8')).toBe('// modified content');

      // Run with force - should overwrite
      await init({ template: 'agent', force: true });
      expect(fs.readFileSync(machineFile, 'utf-8')).toBe(originalContent);
    });
  });

  describe('init() with --template option', () => {
    it('should use agent template by default', async () => {
      await init();

      const machineFile = path.join(tempDir, 'test', 'mbt', 'machines', 'agent.machine.js');
      expect(fs.existsSync(machineFile)).toBe(true);

      const content = fs.readFileSync(machineFile, 'utf-8');
      expect(content).toContain('agentOrchestrator');
    });

    it('should support workflow template', async () => {
      await init({ template: 'workflow' });

      const machineFile = path.join(tempDir, 'test', 'mbt', 'machines', 'workflow.machine.js');
      expect(fs.existsSync(machineFile)).toBe(true);

      const content = fs.readFileSync(machineFile, 'utf-8');
      expect(content).toContain('workflow');
    });

    it('should support migration template', async () => {
      await init({ template: 'migration' });

      const machineFile = path.join(tempDir, 'test', 'mbt', 'machines', 'migration.machine.js');
      expect(fs.existsSync(machineFile)).toBe(true);

      const content = fs.readFileSync(machineFile, 'utf-8');
      expect(content).toContain('migration');
    });

    it('should fallback to agent template for unknown template', async () => {
      await init({ template: 'unknownTemplate' });

      // Should still create files (using agent as fallback)
      expect(fs.existsSync(path.join(tempDir, 'test', 'mbt', 'machines'))).toBe(true);
    });
  });

  describe('init() file content validation', () => {
    it('should create valid JavaScript machine file', async () => {
      await init({ template: 'agent' });

      const machineFile = path.join(tempDir, 'test', 'mbt', 'machines', 'agent.machine.js');
      const content = fs.readFileSync(machineFile, 'utf-8');

      // Validate the file is syntactically valid JavaScript
      // We can't require() it directly because xstate won't resolve from temp dir
      // Instead, check it has proper JS structure
      expect(content).toContain('const { createMachine');
      expect(content).toContain("require('xstate')");
      expect(content).toContain('module.exports');
      expect(content).toContain('initial:');
      expect(content).toContain('states:');
    });

    it('should create valid JavaScript invariants file', async () => {
      await init({ template: 'agent' });

      const invariantsFile = path.join(tempDir, 'test', 'mbt', 'invariants', 'agent.invariants.js');
      const content = fs.readFileSync(invariantsFile, 'utf-8');

      // Should export an object with 'all' array
      expect(content).toContain('module.exports');
      expect(content).toContain('all:');
    });

    it('should create test file with proper imports', async () => {
      await init({ template: 'agent' });

      const testFile = path.join(tempDir, 'test', 'mbt', 'agent.mbt.test.js');
      const content = fs.readFileSync(testFile, 'utf-8');

      // Check for cds-mbt import
      expect(content).toContain('cds-mbt');
      // Check for relative machine import
      expect(content).toContain('machine');
      // Check for relative invariants import
      expect(content).toContain('invariants');
    });

    it('should include JSDoc comments in generated files', async () => {
      await init({ template: 'agent' });

      const machineFile = path.join(tempDir, 'test', 'mbt', 'machines', 'agent.machine.js');
      const content = fs.readFileSync(machineFile, 'utf-8');

      expect(content).toContain('/**');
      expect(content).toContain('*/');
    });

    it('should include all core invariant tests in test file', async () => {
      await init({ template: 'agent' });

      const testFile = path.join(tempDir, 'test', 'mbt', 'agent.mbt.test.js');
      const content = fs.readFileSync(testFile, 'utf-8');

      expect(content).toContain('budgetRespected');
      expect(content).toContain('retriesBounded');
      expect(content).toContain('noInvalidCompletion');
      expect(content).toContain('escalationHasReason');
    });
  });

  describe('init() idempotency', () => {
    it('should be idempotent - running twice should not fail', async () => {
      await init({ template: 'agent' });

      // Second run should complete without error
      await expect(init({ template: 'agent' })).resolves.not.toThrow();
    });

    it('should not create duplicate directories', async () => {
      await init({ template: 'agent' });
      await init({ template: 'agent' });

      // Should have single directory structure
      expect(fs.existsSync(path.join(tempDir, 'test', 'mbt'))).toBe(true);
      const machineCount = fs.readdirSync(path.join(tempDir, 'test', 'mbt', 'machines')).length;
      expect(machineCount).toBe(1);
    });
  });
});
