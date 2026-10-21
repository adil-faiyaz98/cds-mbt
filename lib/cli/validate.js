/**
 * cds mbt validate
 *
 * Validates machine definitions without running full MBT
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { glob } = require('glob');
const { validateInvariant } = require('../core/invariant-builder');

async function validate(options = {}) {
  const { machine: machineFilter } = options;
  const cwd = process.cwd();

  console.log(chalk.blue('\n🔍 Validating MBT definitions...\n'));

  // Find machine files
  const machinePattern = path.join(cwd, 'test', 'mbt', 'machines', '*.machine.js');
  let machineFiles = await glob(machinePattern);

  if (machineFilter) {
    machineFiles = machineFiles.filter(f =>
      path.basename(f).toLowerCase().includes(machineFilter.toLowerCase())
    );
  }

  if (machineFiles.length === 0) {
    console.log(chalk.yellow('No machine files found'));
    return 1;
  }

  let hasErrors = false;

  for (const machineFile of machineFiles) {
    const machineName = path.basename(machineFile, '.machine.js');
    console.log(chalk.white(`Machine: ${machineName}`));

    try {
      // Validate machine loads
      const machine = require(machineFile);

      if (!machine) {
        console.log(chalk.red('  ✗ Machine is null or undefined'));
        hasErrors = true;
        continue;
      }

      if (!machine.states) {
        console.log(chalk.red('  ✗ Machine has no states'));
        hasErrors = true;
        continue;
      }

      // Check required properties
      const states = Object.keys(machine.states);
      console.log(chalk.green(`  ✓ ${states.length} states defined`));

      // Check for final states
      const finalStates = states.filter(s =>
        machine.states[s].type === 'final'
      );
      if (finalStates.length === 0) {
        console.log(chalk.yellow('  ⚠ No final states defined'));
      } else {
        console.log(chalk.green(`  ✓ ${finalStates.length} final states`));
      }

      // Check initial state
      if (machine.initial) {
        console.log(chalk.green(`  ✓ Initial state: ${machine.initial}`));
      } else {
        console.log(chalk.yellow('  ⚠ No initial state defined'));
      }

      // Check context
      if (machine.context) {
        const contextKeys = Object.keys(machine.context);
        console.log(chalk.green(`  ✓ Context with ${contextKeys.length} properties`));
      }

      // Validate associated invariants
      const invariantsFile = path.join(
        path.dirname(machineFile),
        '..',
        'invariants',
        `${machineName}.invariants.js`
      );

      if (fs.existsSync(invariantsFile)) {
        const invModule = require(invariantsFile);
        const invariants = invModule.all || Object.values(invModule).filter(v => v && v.check);

        for (const inv of invariants) {
          const validation = validateInvariant(inv);
          if (validation.valid) {
            console.log(chalk.green(`  ✓ Invariant: ${inv.name || 'unnamed'}`));
          } else {
            console.log(chalk.red(`  ✗ Invariant: ${inv.name || 'unnamed'}`));
            validation.errors.forEach(e => console.log(chalk.red(`    - ${e}`)));
            hasErrors = true;
          }
        }
      } else {
        console.log(chalk.dim('  • No custom invariants file'));
      }

    } catch (err) {
      console.log(chalk.red(`  ✗ Failed to load: ${err.message}`));
      hasErrors = true;
    }

    console.log();
  }

  if (hasErrors) {
    console.log(chalk.red('Validation found errors\n'));
    return 1;
  }

  console.log(chalk.green('✓ All definitions valid\n'));
  return 0;
}

module.exports = validate;
