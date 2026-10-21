/**
 * TLA+ Integration Module
 * 
 * Provides TLA+ specification generation and TLC model checker integration
 * for formal verification of XState machines.
 * 
 * @module cds-mbt/tla
 */

const { 
  generateTLASpec, 
  generateTLCConfig,
  extractStates,
  extractTransitions,
  extractContextVariables,
  sanitizeName,
  translateInvariant
} = require('./spec-generator');

const { TLCRunner } = require('./tlc-runner');

module.exports = {
  // Spec Generator
  generateTLASpec,
  generateTLCConfig,
  extractStates,
  extractTransitions,
  extractContextVariables,
  sanitizeName,
  translateInvariant,

  // TLC Runner
  TLCRunner
};
