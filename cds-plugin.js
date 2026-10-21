/**
 * CDS Plugin for Model-Based Testing
 * 
 * This file is automatically detected by CAP and registers the 'mbt' CLI command.
 * See: https://cap.cloud.sap/docs/node.js/cds-plugins
 */

const cds = require('@sap/cds');
const path = require('path');

// Register CLI commands when available
if (cds.cli) {
  cds.cli.commands = cds.cli.commands || {};

  // Main mbt command with subcommands
  cds.cli.commands.mbt = {
    desc: 'Model-Based Testing for CAP agents',
    options: [
      { name: 'init', desc: 'Initialize MBT test scaffolding' },
      { name: 'run', desc: 'Run MBT tests' },
      { name: 'extract', desc: 'Extract machine from @agent service' },
      { name: 'export', desc: 'Export machine to TLA+ format' },
      { name: 'watch', desc: 'Runtime validation mode' },
      { name: 'verbose', short: 'v', desc: 'Show detailed output' },
      { name: 'machine', short: 'm', desc: 'Specify machine file' },
      { name: 'service', short: 's', desc: 'Specify service file (for extract)' },
      { name: 'output', short: 'o', desc: 'Output file path' },
      { name: 'invariants', short: 'i', desc: 'Invariants file path' },
      { name: 'port', short: 'p', desc: 'Service port (for watch)' },
      { name: 'report', short: 'r', desc: 'Generate HTML report' }
    ],
    impl: async (options) => {
      const cli = require('./lib/cli');

      // Determine which subcommand to run
      if (options.init) {
        return cli.init(options);
      } else if (options.extract) {
        return cli.extract(options);
      } else if (options.export) {
        return cli.export(options);
      } else if (options.watch) {
        return cli.watch(options);
      } else {
        // Default: run MBT tests
        return cli.run(options);
      }
    }
  };
}

// Log activation in debug mode
cds.on('bootstrap', () => {
  const log = cds.log('mbt');
  log.debug('cds-mbt plugin loaded');
});

module.exports = {
  // Export for programmatic use
  ...require('./lib/index')
};
