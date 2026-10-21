/**
 * Joule Integration Module
 *
 * Model-Based Testing support for SAP Joule/CAP agents.
 * Provides machine extraction, ReAct loop templates,
 * and runtime validation adapters.
 *
 * @module cds-mbt/joule
 */

const { extractMachine, extractFromDefinition, parseAnnotations, buildStates } = require('./machine-extractor');
const { createReActMachine, createA2AMachine, createHITLMachine, createSubagentMachine } = require('./react-templates');
const { RuntimeAdapter } = require('./runtime-adapter');

module.exports = {
  // Machine Extractor
  extractMachine,
  extractFromDefinition,
  parseAnnotations,
  buildStates,

  // ReAct Templates
  createReActMachine,
  createA2AMachine,
  createHITLMachine,
  createSubagentMachine,

  // Runtime Adapter
  RuntimeAdapter
};
