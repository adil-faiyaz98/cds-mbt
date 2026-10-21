/**
 * cds mbt run
 *
 * Runs MBT tests and reports results
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { glob } = require('glob');
const { runMBT, invariants } = require('../index');
const { generateReport } = require('../core/report-generator');

async function run(options = {}) {
  const {
    verbose = false,
    machine: machineFilter,
    report = false,
    output = './test/reports',
    failFast = false
  } = options;

  const cwd = process.cwd();
  const startTime = Date.now();

  console.log(chalk.blue(`\n🔍 cds-mbt v${require('../../package.json').version}`));
  console.log(chalk.dim('━'.repeat(50)));

  // Find machine files
  const machinePattern = path.join(cwd, 'test', 'mbt', 'machines', '*.machine.js');
  let machineFiles = await glob(machinePattern);

  if (machineFilter) {
    machineFiles = machineFiles.filter(f =>
      path.basename(f).toLowerCase().includes(machineFilter.toLowerCase())
    );
  }

  if (machineFiles.length === 0) {
    console.log(chalk.yellow('\n⚠ No machine files found'));
    console.log(chalk.dim('  Run `cds mbt init` to create scaffolding\n'));
    return 1;
  }

  let totalViolations = 0;
  let totalPaths = 0;
  const results = [];

  for (const machineFile of machineFiles) {
    const machineName = path.basename(machineFile, '.machine.js');
    console.log(chalk.white(`\nMachine: ${chalk.bold(machineName)}`));

    try {
      // Load machine
      const machine = require(machineFile);

      // Load custom invariants if exist
      const invariantsFile = path.join(
        path.dirname(machineFile),
        '..',
        'invariants',
        `${machineName}.invariants.js`
      );

      let customInvariants = [];
      if (fs.existsSync(invariantsFile)) {
        const mod = require(invariantsFile);
        customInvariants = mod.all || Object.values(mod).filter(v => v && v.check);
      }

      // Combine invariants
      const allInvariants = [...invariants.all, ...customInvariants];

      // Run MBT
      const result = await runMBT(machine, allInvariants, {
        verbose,
        failFast
      });

      results.push({ machine: machineName, result });
      totalPaths += result.stats.totalPaths;
      totalViolations += result.violations.length;

      // Display results
      console.log(chalk.dim(`  States: ${countStates(machine)}`));
      console.log(chalk.dim(`  Exploring ${result.stats.totalPaths} paths...`));

      if (verbose && result.paths) {
        console.log();
        for (let i = 0; i < Math.min(result.paths.length, 10); i++) {
          const p = result.paths[i];
          const hasViolation = result.violations.some(v => v.path === formatPathShort(p));
          const icon = hasViolation ? chalk.red('✗') : chalk.green('✓');
          console.log(`  ${icon} Path ${i + 1}: ${chalk.dim(formatPathShort(p))}`);
        }
        if (result.paths.length > 10) {
          console.log(chalk.dim(`  ... and ${result.paths.length - 10} more paths`));
        }
      }

      // Display invariant results
      console.log(chalk.dim('\n  Invariants:'));
      for (const inv of allInvariants) {
        const violated = result.violations.filter(v => v.invariant === inv.name);
        if (violated.length > 0) {
          console.log(chalk.red(`  ✗ ${inv.name} (${violated.length} violations)`));
        } else {
          console.log(chalk.green(`  ✓ ${inv.name}`));
        }
      }

      // Display violations
      if (result.violations.length > 0) {
        console.log(chalk.red(`\n  ❌ ${result.violations.length} violation(s) found:`));
        for (const v of result.violations.slice(0, 5)) {
          console.log(chalk.red(`\n  Invariant: ${v.invariant}`));
          console.log(chalk.white(`  Message: ${v.message}`));
          console.log(chalk.dim(`  State: ${v.state}`));
          console.log(chalk.dim(`  Path: ${v.path.slice(0, 100)}${v.path.length > 100 ? '...' : ''}`));
        }
        if (result.violations.length > 5) {
          console.log(chalk.dim(`\n  ... and ${result.violations.length - 5} more violations`));
        }
      }

      // Generate report if requested
      if (report) {
        const reportPath = path.join(output, `${machineName}-mbt-report.html`);
        await generateReport(result, { output: reportPath });
        console.log(chalk.dim(`\n  Report: ${reportPath}`));
      }

    } catch (err) {
      console.log(chalk.red(`  Error: ${err.message}`));
      if (verbose) {
        console.log(chalk.dim(err.stack));
      }
      totalViolations++;
    }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(chalk.dim(`\n${'━'.repeat(50)}`));

  if (totalViolations === 0) {
    console.log(chalk.green(`\n✅ MBT PASSED - ${totalPaths} paths verified, 0 violations`));
  } else {
    console.log(chalk.red(`\n❌ MBT FAILED - ${totalViolations} violation(s) found`));
  }

  console.log(chalk.dim(`\nTime: ${elapsed}s\n`));

  return totalViolations > 0 ? 1 : 0;
}

function countStates(machine) {
  if (!machine || !machine.states) return 0;
  return Object.keys(machine.states).length;
}

function formatPathShort(path) {
  if (!path || !path.steps) return '';
  return path.steps
    .slice(0, 6)
    .map(s => s.toState)
    .filter(Boolean)
    .join(' → ')
    + (path.steps.length > 6 ? ' → ...' : '');
}

module.exports = run;
