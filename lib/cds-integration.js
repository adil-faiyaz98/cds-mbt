/**
 * CDS Integration Module
 *
 * Provides integration with SAP CDS framework for auto-running MBT tests.
 * This module hooks into cds.test to automatically execute model-based tests.
 */

const path = require('path');
const glob = require('glob');

/**
 * MBT Service class for CDS integration
 *
 * @example
 * // In your test setup
 * const { MbtService } = require('cds-mbt/lib/cds-integration');
 * const mbt = new MbtService();
 * await mbt.init({ testDir: 'test/mbt' });
 * const results = await mbt.run();
 */
class MbtService {
  /**
   * Create a new MbtService instance
   * @param {Object} options - Service options
   * @param {string} [options.testDir] - Directory containing MBT test files
   * @param {boolean} [options.verbose] - Enable verbose logging
   */
  constructor(options = {}) {
    this.testDir = options.testDir || 'test/mbt';
    this.verbose = options.verbose || false;
    this.initialized = false;
    this.machines = [];
    this.invariants = [];
    this.log = this._createLogger();
  }

  /**
   * Create a CDS-compatible logger
   * @returns {Object} Logger interface
   * @private
   */
  _createLogger() {
    // Try to use CDS logger if available
    try {
      const cds = require('@sap/cds');
      return cds.log('mbt');
    } catch {
      // Fallback to console-based logger
      return {
        debug: (...args) => this.verbose && console.debug('[mbt]', ...args),
        info: (...args) => console.info('[mbt]', ...args),
        warn: (...args) => console.warn('[mbt]', ...args),
        error: (...args) => console.error('[mbt]', ...args)
      };
    }
  }

  /**
   * Initialize the MBT service
   *
   * Discovers and loads machine definitions and invariants from the test directory.
   *
   * @param {Object} options - Initialization options
   * @param {string} [options.testDir] - Override test directory
   * @param {string[]} [options.machinePatterns] - Glob patterns for machine files
   * @param {string[]} [options.invariantPatterns] - Glob patterns for invariant files
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    const testDir = options.testDir || this.testDir;
    const machinePatterns = options.machinePatterns || ['**/*.machine.js'];
    const invariantPatterns = options.invariantPatterns || ['**/*.invariants.js'];

    this.log.debug(`Initializing MBT service with testDir: ${testDir}`);

    const baseDir = path.resolve(process.cwd(), testDir);

    // Discover machine files
    for (const pattern of machinePatterns) {
      const files = glob.sync(pattern, { cwd: baseDir, absolute: true });
      for (const file of files) {
        try {
          const machine = require(file);
          this.machines.push({
            file: path.relative(process.cwd(), file),
            machine: machine.default || machine
          });
          this.log.debug(`Loaded machine: ${path.basename(file)}`);
        } catch (err) {
          this.log.warn(`Failed to load machine ${file}: ${err.message}`);
        }
      }
    }

    // Discover invariant files
    for (const pattern of invariantPatterns) {
      const files = glob.sync(pattern, { cwd: baseDir, absolute: true });
      for (const file of files) {
        try {
          const invariantModule = require(file);
          const invariants = invariantModule.all || Object.values(invariantModule).filter(
            v => v && typeof v === 'object' && typeof v.check === 'function'
          );
          this.invariants.push({
            file: path.relative(process.cwd(), file),
            invariants
          });
          this.log.debug(`Loaded ${invariants.length} invariants from: ${path.basename(file)}`);
        } catch (err) {
          this.log.warn(`Failed to load invariants ${file}: ${err.message}`);
        }
      }
    }

    this.initialized = true;
    this.log.info(`MBT initialized: ${this.machines.length} machines, ${this.invariants.length} invariant files`);
  }

  /**
   * Run MBT tests on all discovered machines
   *
   * @param {Object} options - Run options
   * @param {string} [options.machine] - Run specific machine only
   * @param {boolean} [options.stopOnFailure] - Stop at first failure
   * @param {number} [options.maxPaths] - Maximum paths to explore per machine
   * @returns {Promise<Object>} Test results
   */
  async run(options = {}) {
    if (!this.initialized) {
      await this.init();
    }

    const { runMBT } = require('./core/path-explorer');
    const builtInInvariants = require('./invariants');

    const results = {
      passed: true,
      totalPaths: 0,
      totalViolations: 0,
      machines: []
    };

    // Filter machines if specific one requested
    const machinesToRun = options.machine
      ? this.machines.filter(m => m.file.includes(options.machine))
      : this.machines;

    this.log.info(`Running MBT on ${machinesToRun.length} machine(s)`);

    for (const { file, machine } of machinesToRun) {
      this.log.debug(`Testing machine: ${file}`);

      // Collect invariants for this machine
      const invariantsToUse = [
        ...builtInInvariants.all,
        ...this.invariants.flatMap(i => i.invariants)
      ];

      try {
        const result = await runMBT(machine, invariantsToUse, {
          maxPaths: options.maxPaths
        });

        results.machines.push({
          file,
          ...result
        });

        results.totalPaths += result.stats?.totalPaths || 0;
        results.totalViolations += result.violations?.length || 0;

        if (result.violations?.length > 0) {
          results.passed = false;
          this.log.warn(`Machine ${file} has ${result.violations.length} violation(s)`);

          if (options.stopOnFailure) {
            break;
          }
        } else {
          this.log.debug(`Machine ${file} passed all invariants`);
        }
      } catch (err) {
        this.log.error(`Error testing machine ${file}: ${err.message}`);
        results.machines.push({
          file,
          error: err.message,
          passed: false
        });
        results.passed = false;
      }
    }

    this.log.info(`MBT complete: ${results.totalPaths} paths, ${results.totalViolations} violations`);
    return results;
  }

  /**
   * Get statistics about discovered tests
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      machineCount: this.machines.length,
      invariantFileCount: this.invariants.length,
      totalInvariants: this.invariants.reduce((sum, i) => sum + i.invariants.length, 0)
    };
  }
}

module.exports = {
  MbtService
};
