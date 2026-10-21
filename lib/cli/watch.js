/**
 * cds mbt watch
 * 
 * Runtime validation mode - watches a running CAP service and validates
 * state transitions against invariants in real-time.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { RuntimeAdapter } = require('../joule/runtime-adapter');
const invariantsModule = require('../invariants');

/**
 * Watch a running service for state transitions
 * @param {Object} options - Command options
 * @param {string} options.port - Port of running service
 * @param {string} options.url - Full URL of service (alternative to port)
 * @param {string} options.invariants - Invariants file path
 * @param {string} options.machine - Machine file path for reference
 * @param {boolean} options.verbose - Show detailed output
 * @param {boolean} options.continuous - Run continuously (default: true)
 * @returns {Promise<number>} Exit code
 */
async function watch(options = {}) {
  const {
    port = 4004,
    url,
    invariants: invariantsFile,
    machine: machineFile,
    verbose = false,
    continuous = true
  } = options;

  console.log(chalk.blue('\n👁 cds-mbt watch'));
  console.log(chalk.dim('━'.repeat(50)));

  const cwd = process.cwd();

  // Determine service URL
  const serviceUrl = url || `http://localhost:${port}`;
  console.log(chalk.white(`Service: ${chalk.bold(serviceUrl)}`));

  // Load invariants
  let invariants = [...invariantsModule.all];

  if (invariantsFile) {
    const invariantsPath = path.resolve(cwd, invariantsFile);
    if (fs.existsSync(invariantsPath)) {
      console.log(chalk.white(`Invariants: ${chalk.bold(path.relative(cwd, invariantsPath))}`));
      try {
        const customModule = require(invariantsPath);
        const customInvariants = customModule.all || Object.values(customModule).filter(v => v && v.check);
        invariants = [...invariants, ...customInvariants];
      } catch (err) {
        console.log(chalk.yellow(`\n⚠ Could not load invariants: ${err.message}`));
      }
    }
  }

  console.log(chalk.dim(`\n  Checking ${invariants.length} invariants:`));
  for (const inv of invariants) {
    console.log(chalk.dim(`    - ${inv.name}`));
  }

  // Load reference machine if provided
  let referenceMachine = null;
  if (machineFile) {
    const machinePath = path.resolve(cwd, machineFile);
    if (fs.existsSync(machinePath)) {
      try {
        referenceMachine = require(machinePath);
        console.log(chalk.white(`Reference machine: ${chalk.bold(path.relative(cwd, machinePath))}`));
      } catch (err) {
        console.log(chalk.yellow(`\n⚠ Could not load reference machine: ${err.message}`));
      }
    }
  }

  console.log(chalk.dim('\n' + '━'.repeat(50)));
  console.log(chalk.blue('\n🔄 Starting runtime adapter...'));

  try {
    // Create runtime adapter
    const adapter = new RuntimeAdapter({
      serviceUrl,
      invariants,
      referenceMachine,
      verbose
    });

    // Set up event handlers
    let totalEvents = 0;
    let violations = 0;

    adapter.on('transition', (event) => {
      totalEvents++;
      const arrow = chalk.dim('→');
      console.log(chalk.white(`\n[${new Date().toISOString()}] Transition: ${event.from} ${arrow} ${event.to}`));
      if (event.eventType) {
        console.log(chalk.dim(`  Event: ${event.eventType}`));
      }
    });

    adapter.on('violation', (violation) => {
      violations++;
      console.log(chalk.red(`\n❌ INVARIANT VIOLATION`));
      console.log(chalk.red(`   Invariant: ${violation.invariant}`));
      console.log(chalk.red(`   Message: ${violation.message}`));
      console.log(chalk.dim(`   State: ${violation.state}`));
      if (violation.context && verbose) {
        console.log(chalk.dim(`   Context: ${JSON.stringify(violation.context, null, 2)}`));
      }
    });

    adapter.on('valid', (result) => {
      if (verbose) {
        console.log(chalk.green(`  ✓ All invariants passed`));
      }
    });

    adapter.on('error', (err) => {
      console.log(chalk.red(`\n⚠ Adapter error: ${err.message}`));
    });

    adapter.on('connected', () => {
      console.log(chalk.green(`✓ Connected to ${serviceUrl}`));
      console.log(chalk.dim('\n  Watching for state transitions...'));
      console.log(chalk.dim('  Press Ctrl+C to stop\n'));
    });

    adapter.on('disconnected', () => {
      console.log(chalk.yellow('\n⚠ Disconnected from service'));
    });

    // Start watching
    await adapter.connect();

    if (continuous) {
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log(chalk.blue('\n\n📊 Watch Summary'));
        console.log(chalk.dim('━'.repeat(50)));
        console.log(chalk.white(`  Total transitions observed: ${totalEvents}`));
        console.log(violations > 0 
          ? chalk.red(`  Violations found: ${violations}`)
          : chalk.green(`  Violations found: 0`));
        console.log();

        await adapter.disconnect();
        process.exit(violations > 0 ? 1 : 0);
      });

      // Keep process alive
      await new Promise(() => {});
    } else {
      // Single check mode - wait for one transition then exit
      await new Promise((resolve) => {
        adapter.once('transition', () => {
          setTimeout(resolve, 1000);
        });
        // Timeout after 30 seconds
        setTimeout(resolve, 30000);
      });

      await adapter.disconnect();
      return violations > 0 ? 1 : 0;
    }

  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.log(chalk.red(`\n✗ Could not connect to ${serviceUrl}`));
      console.log(chalk.dim('  Make sure the CAP service is running'));
      console.log(chalk.dim(`  Start it with: cds watch\n`));
    } else {
      console.log(chalk.red(`\n✗ Watch failed: ${err.message}`));
      if (verbose) {
        console.log(chalk.dim(err.stack));
      }
    }
    return 1;
  }
}

module.exports = watch;
