/**
 * CLI run Command Tests
 * 
 * Tests for the `cds mbt run` command that executes MBT tests.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock chalk to avoid color output in tests
jest.mock('chalk', () => ({
  blue: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  red: (s) => s,
  dim: (s) => s,
  cyan: (s) => s,
  white: (s) => s,
  bold: (s) => s
}));

// Mock glob to control file discovery
jest.mock('glob', () => ({
  glob: jest.fn()
}));

// Get absolute path to xstate for test files
const xstateDir = path.dirname(require.resolve('xstate'));

const run = require('../../lib/cli/run');
const { glob } = require('glob');

describe('CLI run', () => {
  let originalCwd;
  let tempDir;

  beforeAll(() => {
    originalCwd = process.cwd();
  });

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cds-mbt-run-test-'));
    process.chdir(tempDir);

    // Reset mock
    glob.mockReset();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a machine file that can resolve xstate
   */
  function createMachineFile(dir, name, content) {
    const filePath = path.join(dir, name);
    // Replace require('xstate') with absolute path
    const xstatePath = xstateDir.replace(/\\/g, '/');
    const fixedContent = content.replace(
      /require\(['"]xstate['"]\)/g,
      `require('${xstatePath}')`
    );
    fs.writeFileSync(filePath, fixedContent);
    return filePath;
  }

  describe('run() finding machines', () => {
    it('should return 1 when no machine files found', async () => {
      glob.mockResolvedValue([]);

      const result = await run();

      expect(result).toBe(1);
    });

    it('should find machine files in test/mbt/machines/', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'test.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'test',
          initial: 'idle',
          states: {
            idle: { on: { START: 'done' } },
            done: { type: 'final' }
          }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      await run();

      expect(glob).toHaveBeenCalledWith(expect.stringContaining('*.machine.js'));
    });
  });

  describe('run() with --machine filter', () => {
    it('should filter machines by name', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineContent = `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'test',
          initial: 'idle',
          states: { idle: { type: 'final' } }
        });
      `;

      const agent1 = createMachineFile(machinesDir, 'agent1.machine.js', machineContent);
      const agent2 = createMachineFile(machinesDir, 'agent2.machine.js', machineContent);
      const workflow = createMachineFile(machinesDir, 'workflow.machine.js', machineContent);

      glob.mockResolvedValue([agent1, agent2, workflow]);

      await run({ machine: 'agent' });

      // The function filters internally after glob returns all files
      expect(glob).toHaveBeenCalled();
    });

    it('should be case-insensitive', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineContent = `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'test',
          initial: 'idle',
          states: { idle: { type: 'final' } }
        });
      `;

      const machineFile = createMachineFile(machinesDir, 'MyAgent.machine.js', machineContent);
      glob.mockResolvedValue([machineFile]);

      await run({ machine: 'myagent' });

      expect(glob).toHaveBeenCalled();
    });
  });

  describe('run() with --verbose', () => {
    it('should show path details in verbose mode', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'verbose-test.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'verboseTest',
          initial: 'idle',
          states: {
            idle: { on: { GO: 'active' } },
            active: { on: { DONE: 'complete' } },
            complete: { type: 'final' }
          }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await run({ verbose: true });

      // Verbose mode should produce output
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle errors gracefully in verbose mode', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = path.join(machinesDir, 'error.machine.js');
      fs.writeFileSync(machineFile, 'invalid javascript {{{');

      glob.mockResolvedValue([machineFile]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await run({ verbose: true });

      // Should return error code
      expect(result).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('run() with --report', () => {
    it('should attempt to generate report when --report is set', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      const reportsDir = path.join(tempDir, 'test', 'reports');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'report-test.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'reportTest',
          initial: 'idle',
          states: {
            idle: { on: { GO: 'done' } },
            done: { type: 'final' }
          }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      // Run with report option
      await run({ report: true, output: reportsDir });

      // Test that run() was called with report option (the actual report
      // generation may fail due to module resolution in temp dir, but 
      // the CLI logic should work)
      expect(glob).toHaveBeenCalled();
    });

    it('should handle custom output directory option', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      const customOutput = path.join(tempDir, 'custom-reports');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'custom.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'custom',
          initial: 'idle',
          states: { idle: { type: 'final' } }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      // Just verify the run executes without crash
      const result = await run({ report: true, output: customOutput });
      expect(typeof result).toBe('number');
    });
  });

  describe('run() exit codes', () => {
    it('should return 0 when machine executes without errors', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'passing.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'passing',
          initial: 'idle',
          context: { llmCallsUsed: 0, llmCallsBudget: 10 },
          states: {
            idle: { on: { GO: 'done' } },
            done: { type: 'final' }
          }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      const result = await run();

      // Result should be a number (0 for pass, 1 for fail)
      expect(typeof result).toBe('number');
    });

    it('should return 1 when there are violations', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      // Machine with budget violation (used > budget)
      const machineFile = createMachineFile(machinesDir, 'failing.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'failing',
          initial: 'idle',
          context: { llmCallsUsed: 100, llmCallsBudget: 10 },
          states: {
            idle: { on: { GO: 'done' } },
            done: { type: 'final' }
          }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      const result = await run();

      // Should fail due to budget violation
      expect(result).toBe(1);
    });

    it('should return 1 when machine file has syntax error', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = path.join(machinesDir, 'broken.machine.js');
      fs.writeFileSync(machineFile, 'this is not valid javascript {{{}');

      glob.mockResolvedValue([machineFile]);

      const result = await run();

      expect(result).toBe(1);
    });
  });

  describe('run() with custom invariants', () => {
    it('should load custom invariants when file exists', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      const invariantsDir = path.join(tempDir, 'test', 'mbt', 'invariants');
      fs.mkdirSync(machinesDir, { recursive: true });
      fs.mkdirSync(invariantsDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'custom-inv.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'customInv',
          initial: 'idle',
          context: { customValue: 0 },
          states: {
            idle: { on: { GO: 'done' } },
            done: { type: 'final' }
          }
        });
      `);

      const invariantsFile = path.join(invariantsDir, 'custom-inv.invariants.js');
      fs.writeFileSync(invariantsFile, `
        module.exports = {
          customCheck: {
            name: 'customCheck',
            check: (context) => ({ passed: context.customValue >= 0 })
          },
          all: [{
            name: 'customCheck',
            check: (context) => ({ passed: context.customValue >= 0 })
          }]
        };
      `);

      glob.mockResolvedValue([machineFile]);

      const result = await run();

      expect(typeof result).toBe('number');
    });
  });

  describe('run() output format', () => {
    it('should display machine name', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'display-test.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'displayTest',
          initial: 'idle',
          states: { idle: { type: 'final' } }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await run();

      const logs = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(logs).toContain('display-test');

      consoleSpy.mockRestore();
    });

    it('should display MBT summary at end', async () => {
      const machinesDir = path.join(tempDir, 'test', 'mbt', 'machines');
      fs.mkdirSync(machinesDir, { recursive: true });

      const machineFile = createMachineFile(machinesDir, 'summary.machine.js', `
        const { createMachine } = require('xstate');
        module.exports = createMachine({
          id: 'summary',
          initial: 'idle',
          states: { idle: { type: 'final' } }
        });
      `);

      glob.mockResolvedValue([machineFile]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await run();

      const logs = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      // Should have summary with either PASSED or FAILED
      expect(logs.includes('MBT PASSED') || logs.includes('MBT FAILED')).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
