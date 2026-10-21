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
const tla = require('./tla');

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

  // Joule Integration
  joule,

  // TLA+ Integration
  tla,
  generateTLASpec: tla.generateTLASpec,
  TLCRunner: tla.TLCRunner,

  // Version
  version: require('../package.json').version
};
