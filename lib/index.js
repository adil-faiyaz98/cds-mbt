/**
 * cds-mbt - Model-Based Testing for SAP CAP
 * 
 * Main entry point exporting all public APIs
 */

const { runMBT, explorePaths, checkInvariants } = require('./core/path-explorer');
const { createInvariant, validateInvariant } = require('./core/invariant-builder');
const { generateReport } = require('./core/report-generator');
const invariants = require('./invariants');
const machines = require('./machines');
const { MbtService } = require('./cds-integration');
const joule = require('./joule');

/**
 * TLA+ Integration Module (placeholder)
 * Will provide TLA+ specification support for formal verification
 * @see FEAT-003 for implementation
 */
const tla = {
  /** @deprecated Placeholder - not yet implemented */
  generateTLASpec: () => {
    throw new Error('TLA+ integration not yet implemented. See FEAT-003.');
  },
  /** @deprecated Placeholder - not yet implemented */
  verifyWithTLC: () => {
    throw new Error('TLA+ integration not yet implemented. See FEAT-003.');
  }
};

module.exports = {
  // Core functions
  runMBT,
  explorePaths,
  checkInvariants,

  // Invariant helpers
  createInvariant,
  validateInvariant,

  // Built-in invariants
  invariants,

  // Machine templates
  machines,
  createAgentMachine: machines.createAgentMachine,
  createWorkflowMachine: machines.createWorkflowMachine,
  createMigrationMachine: machines.createMigrationMachine,

  // CDS Integration
  MbtService,

  // Reporting
  generateReport,

  // Future modules (placeholders)
  joule,
  tla,

  // Version
  version: require('../package.json').version
};
