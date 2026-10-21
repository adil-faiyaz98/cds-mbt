/**
 * cds mbt export
 *
 * Exports XState machines to TLA+ specifications for formal verification.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { generateTLASpec, generateTLCConfig } = require('../tla');

/**
 * Export a machine to TLA+ format
 * @param {Object} options - Command options
 * @param {string} options.machine - Machine file path
 * @param {string} options.output - Output file path for .tla
 * @param {string} options.invariants - Invariants file path
 * @param {boolean} options.config - Also generate .cfg file
 * @param {boolean} options.verbose - Show detailed output
 * @returns {Promise<number>} Exit code
 */
async function exportCommand(options = {}) {
  const {
    machine: machineFile,
    output,
    invariants: invariantsFile,
    config: generateConfig = true,
    verbose = false
  } = options;

  console.log(chalk.blue('\n🔍 cds-mbt export'));
  console.log(chalk.dim('━'.repeat(50)));

  const cwd = process.cwd();

  // Find machine file
  let machinePath = machineFile;
  if (!machinePath) {
    // Default: look for machines in test/mbt/machines
    const machinesDir = path.join(cwd, 'test', 'mbt', 'machines');
    if (fs.existsSync(machinesDir)) {
      const files = fs.readdirSync(machinesDir).filter(f => f.endsWith('.machine.js'));
      if (files.length === 1) {
        machinePath = path.join(machinesDir, files[0]);
      } else if (files.length > 1) {
        console.log(chalk.yellow('\n⚠ Multiple machine files found'));
        console.log(chalk.dim('  Use --machine option to specify which one to export'));
        files.forEach(f => console.log(chalk.dim(`    - ${f}`)));
        console.log();
        return 1;
      }
    }
  }

  if (!machinePath || !fs.existsSync(machinePath)) {
    console.log(chalk.yellow('\n⚠ No machine file specified or found'));
    console.log(chalk.dim('  Use --machine option to specify the machine file path'));
    console.log(chalk.dim('  Example: cds mbt export --machine test/mbt/machines/agent.machine.js\n'));
    return 1;
  }

  console.log(chalk.white(`Machine: ${chalk.bold(path.relative(cwd, machinePath))}`));

  try {
    // Load machine
    const machine = require(path.resolve(machinePath));

    // Load invariants if provided
    let invariants = [];
    let invariantsPath = invariantsFile;

    if (!invariantsPath) {
      // Try to find matching invariants file
      const machineName = path.basename(machinePath, '.machine.js');
      const defaultInvariantsPath = path.join(
        path.dirname(machinePath),
        '..',
        'invariants',
        `${machineName}.invariants.js`
      );

      if (fs.existsSync(defaultInvariantsPath)) {
        invariantsPath = defaultInvariantsPath;
      }
    }

    if (invariantsPath && fs.existsSync(invariantsPath)) {
      console.log(chalk.white(`Invariants: ${chalk.bold(path.relative(cwd, invariantsPath))}`));
      const invModule = require(path.resolve(invariantsPath));
      invariants = invModule.all || Object.values(invModule).filter(v => v && v.check);
    }

    // Generate TLA+ specification
    if (verbose) {
      console.log(chalk.dim('\n  Generating TLA+ specification...'));
    }

    const tlaSpec = generateTLASpec(machine, invariants);

    // Determine output paths
    const machineName = path.basename(machinePath, '.machine.js');
    const outputPath = output || path.join(cwd, 'test', 'mbt', 'tla', `${machineName}.tla`);
    const configPath = outputPath.replace('.tla', '.cfg');

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write TLA+ file
    fs.writeFileSync(outputPath, tlaSpec, 'utf-8');
    console.log(chalk.green(`\n✓ TLA+ spec written to ${path.relative(cwd, outputPath)}`));

    // Write config file if requested
    if (generateConfig) {
      const cfgContent = generateTLCConfig(machine, invariants);
      fs.writeFileSync(configPath, cfgContent, 'utf-8');
      console.log(chalk.green(`✓ TLC config written to ${path.relative(cwd, configPath)}`));
    }

    // Show spec summary
    if (verbose) {
      const lines = tlaSpec.split('\n');
      const stateCount = (tlaSpec.match(/State_/g) || []).length / 2; // Rough estimate
      console.log(chalk.dim(`\n  Lines: ${lines.length}`));
      console.log(chalk.dim(`  States: ~${Math.round(stateCount)}`));
      console.log(chalk.dim(`  Invariants: ${invariants.length}`));
    }

    console.log(chalk.blue('\n📁 Next steps:'));
    console.log(chalk.dim('  1. Review the generated TLA+ spec'));
    console.log(chalk.dim('  2. Install TLA+ tools if not already installed'));
    console.log(chalk.dim(`  3. Run TLC: java -jar tla2tools.jar ${path.basename(outputPath)}`));
    console.log(chalk.dim('  Or use TLA+ Toolbox IDE\n'));

    return 0;

  } catch (err) {
    console.log(chalk.red(`\n✗ Export failed: ${err.message}`));
    if (verbose) {
      console.log(chalk.dim(err.stack));
    }
    return 1;
  }
}

module.exports = exportCommand;
