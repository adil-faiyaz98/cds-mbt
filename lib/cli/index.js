/**
 * CLI Commands
 *
 * All CLI command handlers for cds-mbt.
 */

const init = require('./init');
const run = require('./run');
const validate = require('./validate');
const extract = require('./extract');
const exportCommand = require('./export');
const watch = require('./watch');

module.exports = {
  init,
  run,
  validate,
  extract,
  export: exportCommand,
  watch
};
