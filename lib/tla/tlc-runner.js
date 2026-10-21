/**
 * TLC Model Checker Runner
 *
 * Provides integration with TLC model checker for verifying TLA+ specifications.
 * Handles TLC execution, output parsing, and result formatting.
 *
 * @module cds-mbt/tla/tlc-runner
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * TLC Model Checker Runner
 *
 * Runs TLC model checker on TLA+ specifications and parses results.
 */
class TLCRunner {
  /**
   * Create a TLC runner instance
   * @param {Object} options - Runner configuration
   * @param {string} options.tlcPath - Path to TLC jar file (optional, auto-detected)
   * @param {string} options.javaPath - Path to Java executable (default: 'java')
   * @param {string} options.tempDir - Directory for temporary files
   */
  constructor(options = {}) {
    this.tlcPath = options.tlcPath || null;
    this.javaPath = options.javaPath || 'java';
    this.tempDir = options.tempDir || os.tmpdir();
  }

  /**
   * Check a TLA+ specification provided as a string
   * @param {string} tlaContent - TLA+ specification content
   * @param {Object} options - Check options
   * @param {number} options.workers - Number of worker threads (default: 1)
   * @param {number} options.depth - Maximum trace depth (default: 100)
   * @param {string} options.configContent - TLC config content (optional)
   * @param {number} options.timeout - Timeout in milliseconds (default: 60000)
   * @returns {Promise<Object>} Result object with passed, counterexample, stats
   */
  async checkSpec(tlaContent, options = {}) {
    const {
      workers = 1,
      depth = 100,
      configContent = null,
      timeout = 60000
    } = options;

    // Extract module name from content
    const moduleMatch = tlaContent.match(/----\s*MODULE\s+(\w+)\s*----/);
    if (!moduleMatch) {
      return {
        passed: false,
        counterexample: null,
        stats: {},
        error: 'Could not extract module name from TLA+ specification'
      };
    }
    const moduleName = moduleMatch[1];

    // Create temporary directory for this run
    const runDir = path.join(this.tempDir, `tlc-run-${Date.now()}`);
    fs.mkdirSync(runDir, { recursive: true });

    try {
      // Write TLA+ file
      const tlaFile = path.join(runDir, `${moduleName}.tla`);
      fs.writeFileSync(tlaFile, tlaContent, 'utf-8');

      // Write config file if provided
      if (configContent) {
        const cfgFile = path.join(runDir, `${moduleName}.cfg`);
        fs.writeFileSync(cfgFile, configContent, 'utf-8');
      }

      // Run TLC
      return await this.runFile(tlaFile, { workers, depth, timeout });

    } finally {
      // Cleanup temporary files
      try {
        this._cleanupDir(runDir);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run TLC on a TLA+ file
   * @param {string} tlaFilePath - Path to .tla file
   * @param {Object} options - Run options
   * @param {number} options.workers - Number of worker threads (default: 1)
   * @param {number} options.depth - Maximum trace depth (default: 100)
   * @param {number} options.timeout - Timeout in milliseconds (default: 60000)
   * @param {boolean} options.deadlock - Check for deadlocks (default: true)
   * @returns {Promise<Object>} Result object with passed, counterexample, stats
   */
  async runFile(tlaFilePath, options = {}) {
    const {
      workers = 1,
      depth = 100,
      timeout = 60000,
      deadlock = true
    } = options;

    // Check if TLC is available
    const tlcAvailable = await this._checkTLCAvailable();
    if (!tlcAvailable) {
      return {
        passed: null,
        counterexample: null,
        stats: {},
        error: 'TLC is not installed or not found. Install TLA+ tools from https://github.com/tlaplus/tlaplus/releases'
      };
    }

    // Build TLC command arguments
    const args = this._buildTLCArgs(tlaFilePath, { workers, depth, deadlock });

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(this.javaPath, args, {
        cwd: path.dirname(tlaFilePath)
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);

        if (timedOut) {
          resolve({
            passed: null,
            counterexample: null,
            stats: { timedOut: true },
            error: `TLC execution timed out after ${timeout}ms`
          });
          return;
        }

        const result = this._parseOutput(stdout, stderr, code);
        resolve(result);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          passed: null,
          counterexample: null,
          stats: {},
          error: `Failed to run TLC: ${err.message}`
        });
      });
    });
  }

  /**
   * Check if TLC is available
   * @returns {Promise<boolean>} True if TLC is available
   */
  async _checkTLCAvailable() {
    // If explicit path provided, check it exists
    if (this.tlcPath) {
      return fs.existsSync(this.tlcPath);
    }

    // Try to find TLC in common locations
    const commonPaths = [
      process.env.TLC_HOME,
      path.join(os.homedir(), 'tla-tools', 'tla2tools.jar'),
      path.join(os.homedir(), '.tla', 'tla2tools.jar'),
      '/usr/local/lib/tla2tools.jar',
      '/opt/tla/tla2tools.jar'
    ].filter(Boolean);

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        this.tlcPath = p;
        return true;
      }
    }

    // Try running java -cp tla2tools.jar tlc2.TLC -h
    return new Promise((resolve) => {
      const proc = spawn(this.javaPath, ['-version']);
      proc.on('close', (code) => {
        // At least Java is available
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Build TLC command arguments
   * @param {string} tlaFilePath - Path to TLA+ file
   * @param {Object} options - TLC options
   * @returns {Array<string>} Command arguments
   */
  _buildTLCArgs(tlaFilePath, options) {
    const args = [];

    if (this.tlcPath) {
      args.push('-cp', this.tlcPath, 'tlc2.TLC');
    } else {
      // Assume tla2tools.jar is in classpath or TLC is installed as command
      args.push('-cp', 'tla2tools.jar', 'tlc2.TLC');
    }

    // Worker threads
    if (options.workers > 1) {
      args.push('-workers', String(options.workers));
    }

    // Trace depth
    if (options.depth) {
      args.push('-depth', String(options.depth));
    }

    // Deadlock checking
    if (!options.deadlock) {
      args.push('-deadlock');
    }

    // Output options
    args.push('-terse');  // Less verbose output
    args.push('-cleanup'); // Clean up states directory

    // The TLA+ file
    args.push(tlaFilePath);

    return args;
  }

  /**
   * Parse TLC output
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @param {number} code - Exit code
   * @returns {Object} Parsed result
   */
  _parseOutput(stdout, stderr, code) {
    const output = stdout + stderr;
    const result = {
      passed: null,
      counterexample: null,
      stats: {},
      raw: output
    };

    // Check for success
    if (output.includes('Model checking completed. No error has been found')) {
      result.passed = true;
    } else if (output.includes('Error:') || output.includes('Invariant') && output.includes('violated')) {
      result.passed = false;
    } else if (code === 0) {
      result.passed = true;
    } else {
      result.passed = false;
    }

    // Parse stats
    const statesMatch = output.match(/(\d+)\s+states\s+generated/i);
    if (statesMatch) {
      result.stats.statesGenerated = parseInt(statesMatch[1], 10);
    }

    const distinctMatch = output.match(/(\d+)\s+distinct\s+states/i);
    if (distinctMatch) {
      result.stats.distinctStates = parseInt(distinctMatch[1], 10);
    }

    const depthMatch = output.match(/depth\s*:\s*(\d+)/i);
    if (depthMatch) {
      result.stats.depth = parseInt(depthMatch[1], 10);
    }

    const timeMatch = output.match(/Finished\s+in\s+(\d+)ms/i);
    if (timeMatch) {
      result.stats.timeMs = parseInt(timeMatch[1], 10);
    }

    // Parse counterexample if present
    if (!result.passed && output.includes('Error:')) {
      result.counterexample = this._parseCounterexample(output);
    }

    return result;
  }

  /**
   * Parse counterexample from TLC output
   * @param {string} output - TLC output
   * @returns {Object|null} Counterexample object
   */
  _parseCounterexample(output) {
    const counterexample = {
      invariant: null,
      trace: []
    };

    // Find violated invariant
    const invMatch = output.match(/Invariant\s+(\w+)\s+is\s+violated/i);
    if (invMatch) {
      counterexample.invariant = invMatch[1];
    }

    // Parse state trace
    const statePattern = /State\s+(\d+):\s*<([^>]+)>/g;
    let match;
    while ((match = statePattern.exec(output)) !== null) {
      counterexample.trace.push({
        step: parseInt(match[1], 10),
        state: match[2]
      });
    }

    return counterexample.invariant || counterexample.trace.length > 0
      ? counterexample
      : null;
  }

  /**
   * Recursively clean up a directory
   * @param {string} dirPath - Directory to clean up
   */
  _cleanupDir(dirPath) {
    if (fs.existsSync(dirPath)) {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory()) {
          this._cleanupDir(entryPath);
        } else {
          fs.unlinkSync(entryPath);
        }
      }
      fs.rmdirSync(dirPath);
    }
  }

  /**
   * Generate a minimal test spec to verify TLC installation
   * @returns {string} TLA+ specification for testing
   */
  static getTestSpec() {
    return `---- MODULE TLCTest ----
EXTENDS Naturals

VARIABLE x

Init == x = 0

Next == x' = (x + 1) % 10

Spec == Init /\\ [][Next]_x

TypeOK == x \\in 0..9

====`;
  }
}

module.exports = {
  TLCRunner
};
