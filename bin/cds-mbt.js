#!/usr/bin/env node

/**
 * cds-mbt CLI
 *
 * Standalone CLI that can also be invoked via `cds mbt`
 */

const { program } = require('commander');
const { init, run } = require('../lib/cli');
const pkg = require('../package.json');

program
  .name('cds-mbt')
  .description('Model-Based Testing for SAP CAP agents and services')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize MBT test scaffolding in your project')
  .option('-f, --force', 'Overwrite existing files')
  .option('-t, --template <type>', 'Template type: agent, workflow, migration', 'agent')
  .action(async (options) => {
    await init(options);
  });

program
  .command('run')
  .description('Run MBT tests')
  .option('-v, --verbose', 'Show all paths explored')
  .option('-m, --machine <name>', 'Run specific machine only')
  .option('-r, --report', 'Generate HTML report')
  .option('-o, --output <path>', 'Output path for report', './test/reports')
  .option('--fail-fast', 'Stop on first violation')
  .action(async (options) => {
    const exitCode = await run(options);
    process.exit(exitCode);
  });

program
  .command('validate')
  .description('Validate machine definitions without running full MBT')
  .option('-m, --machine <name>', 'Validate specific machine only')
  .action(async (options) => {
    const { validate } = require('../lib/cli');
    await validate(options);
  });

program.parse();
