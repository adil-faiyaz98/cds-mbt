/**
 * TLA+ Specification Generator
 *
 * Converts XState machines to TLA+ specifications for formal verification.
 * Supports invariant translation and generates valid TLA+ syntax.
 *
 * @module cds-mbt/tla/spec-generator
 */

/**
 * Generate a TLA+ specification from an XState machine
 * @param {Object} machine - XState machine definition
 * @param {Array} invariants - Array of invariants to convert to TLA+ formulas
 * @param {Object} options - Generation options
 * @param {string} options.moduleName - Override module name (defaults to machine id)
 * @returns {string} TLA+ specification content
 */
function generateTLASpec(machine, invariants = [], options = {}) {
  if (!machine) {
    throw new Error('Machine definition is required');
  }

  const machineConfig = getMachineConfig(machine);
  const moduleName = options.moduleName || machineConfig.id || 'StateMachine';
  const safeModuleName = sanitizeName(moduleName);

  const states = extractStates(machineConfig);
  const transitions = extractTransitions(machineConfig);
  const contextVars = extractContextVariables(machineConfig);

  const lines = [];

  // Module header
  lines.push(`---- MODULE ${safeModuleName} ----`);
  lines.push('');

  // EXTENDS
  const extensions = determineExtensions(contextVars, invariants);
  if (extensions.length > 0) {
    lines.push(`EXTENDS ${extensions.join(', ')}`);
    lines.push('');
  }

  // Constants for state names
  lines.push('\\* State constants');
  lines.push(`CONSTANTS ${states.map(s => `State_${sanitizeName(s)}`).join(', ')}`);
  lines.push('');

  // Variables declaration
  lines.push('\\* Variables');
  lines.push('VARIABLES');
  lines.push('    state,           \\* Current state');

  for (const v of contextVars) {
    lines.push(`    ${sanitizeName(v.name)},       \\* ${v.description || v.name}`);
  }
  lines.push('');

  // vars tuple
  const allVars = ['state', ...contextVars.map(v => sanitizeName(v.name))];
  lines.push(`vars == <<${allVars.join(', ')}>>`);
  lines.push('');

  // Type invariant
  lines.push('\\* Type invariant');
  lines.push('TypeOK ==');
  lines.push(`    /\\ state \\in {${states.map(s => `State_${sanitizeName(s)}`).join(', ')}}`);
  for (const v of contextVars) {
    const typeConstraint = getTypeConstraint(v);
    if (typeConstraint) {
      lines.push(`    /\\ ${typeConstraint}`);
    }
  }
  lines.push('');

  // Initial state
  lines.push('\\* Initial state');
  lines.push('Init ==');
  const initial = machineConfig.initial || states[0];
  lines.push(`    /\\ state = State_${sanitizeName(initial)}`);
  for (const v of contextVars) {
    const initValue = getInitialValue(v);
    lines.push(`    /\\ ${sanitizeName(v.name)} = ${initValue}`);
  }
  lines.push('');

  // Transition actions
  lines.push('\\* Transition actions');
  for (const trans of transitions) {
    lines.push(`${trans.actionName} ==`);
    lines.push(`    /\\ state = State_${sanitizeName(trans.from)}`);

    // Guard conditions
    if (trans.guard) {
      lines.push(`    /\\ ${translateGuard(trans.guard, contextVars)}`);
    }

    lines.push(`    /\\ state' = State_${sanitizeName(trans.to)}`);

    // Context updates
    const updates = trans.contextUpdates || [];
    for (const update of updates) {
      lines.push(`    /\\ ${sanitizeName(update.var)}' = ${translateExpression(update.expr)}`);
    }

    // Unchanged variables
    const changedVars = new Set(['state', ...updates.map(u => sanitizeName(u.var))]);
    const unchangedVars = allVars.filter(v => !changedVars.has(v));
    if (unchangedVars.length > 0) {
      lines.push(`    /\\ UNCHANGED <<${unchangedVars.join(', ')}>>`);
    }
    lines.push('');
  }

  // Next state relation
  lines.push('\\* Next state relation');
  lines.push('Next ==');
  if (transitions.length > 0) {
    lines.push(`    \\/ ${transitions.map(t => t.actionName).join('\n    \\/ ')}`);
  } else {
    lines.push('    FALSE \\* No transitions defined');
  }
  lines.push('');

  // Specification
  lines.push('\\* Temporal specification');
  lines.push('Spec == Init /\\ [][Next]_vars');
  lines.push('');

  // Fairness (optional)
  lines.push('\\* Fairness constraint (uncomment if needed)');
  lines.push('\\* FairSpec == Spec /\\ WF_vars(Next)');
  lines.push('');

  // Invariants from MBT
  if (invariants.length > 0) {
    lines.push('\\* Invariants (translated from MBT)');
    for (const inv of invariants) {
      const tlaInvariant = translateInvariant(inv, contextVars, states);
      lines.push(`${sanitizeName(inv.name)} ==`);
      lines.push(`    ${tlaInvariant}`);
      lines.push('');
    }
  }

  // Properties section
  lines.push('\\* Liveness properties (examples)');
  lines.push('\\* EventuallyCompleted == <>(state \\in {State_completed, State_escalated})');
  lines.push('');

  // Footer
  lines.push('====');

  return lines.join('\n');
}

/**
 * Get machine configuration from XState machine
 * @param {Object} machine - XState machine (created or config)
 * @returns {Object} Machine configuration object
 */
function getMachineConfig(machine) {
  // Handle XState v5 machine
  if (machine.config) {
    return machine.config;
  }
  // Handle XState v4 machine or plain config
  if (machine.definition) {
    return machine.definition;
  }
  // Already a config object
  return machine;
}

/**
 * Extract state names from machine configuration
 * @param {Object} machineConfig - Machine configuration
 * @returns {Array<string>} Array of state names
 */
function extractStates(machineConfig) {
  const states = [];

  function collectStates(statesObj, prefix = '') {
    if (!statesObj) return;

    for (const [name, config] of Object.entries(statesObj)) {
      const fullName = prefix ? `${prefix}_${name}` : name;
      states.push(fullName);

      // Handle nested states
      if (config && config.states) {
        collectStates(config.states, fullName);
      }
    }
  }

  collectStates(machineConfig.states);
  return states;
}

/**
 * Extract transitions from machine configuration
 * @param {Object} machineConfig - Machine configuration
 * @returns {Array<Object>} Array of transition objects
 */
function extractTransitions(machineConfig) {
  const transitions = [];
  let transitionIndex = 0;

  function collectTransitions(statesObj, prefix = '') {
    if (!statesObj) return;

    for (const [stateName, stateConfig] of Object.entries(statesObj)) {
      if (!stateConfig || !stateConfig.on) continue;

      const fromState = prefix ? `${prefix}_${stateName}` : stateName;

      for (const [eventName, targetConfig] of Object.entries(stateConfig.on)) {
        const targets = Array.isArray(targetConfig) ? targetConfig : [targetConfig];

        for (const target of targets) {
          const toState = typeof target === 'string'
            ? target
            : (target && target.target) || stateName;

          const guard = target && typeof target === 'object' ? target.guard : null;

          transitions.push({
            from: fromState,
            to: toState,
            event: eventName,
            guard,
            actionName: `Action_${sanitizeName(eventName)}_${transitionIndex++}`,
            contextUpdates: extractContextUpdates(target)
          });
        }
      }

      // Handle nested states
      if (stateConfig.states) {
        collectTransitions(stateConfig.states, fromState);
      }
    }
  }

  collectTransitions(machineConfig.states);
  return transitions;
}

/**
 * Extract context updates from a transition
 * @param {Object} target - Transition target configuration
 * @returns {Array<Object>} Context updates
 */
function extractContextUpdates(target) {
  if (!target || typeof target !== 'object') return [];

  const updates = [];
  const actions = target.actions;

  if (!actions) return updates;

  const actionList = Array.isArray(actions) ? actions : [actions];

  for (const action of actionList) {
    if (action && action.type === 'xstate.assign') {
      // XState assign action
      const assignments = action.assignment || {};
      for (const [key, value] of Object.entries(assignments)) {
        updates.push({
          var: key,
          expr: typeof value === 'function' ? `${key} + 1` : String(value)
        });
      }
    }
  }

  return updates;
}

/**
 * Extract context variables from machine configuration
 * @param {Object} machineConfig - Machine configuration
 * @returns {Array<Object>} Array of variable definitions
 */
function extractContextVariables(machineConfig) {
  const context = machineConfig.context || {};
  const variables = [];

  // Handle function context (XState v5)
  const ctxObj = typeof context === 'function' ? {} : context;

  for (const [name, value] of Object.entries(ctxObj)) {
    variables.push({
      name,
      type: inferType(value),
      initialValue: value,
      description: `Context variable: ${name}`
    });
  }

  return variables;
}

/**
 * Infer TLA+ type from JavaScript value
 * @param {*} value - JavaScript value
 * @returns {string} TLA+ type hint
 */
function inferType(value) {
  if (typeof value === 'number') return 'Int';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'string') return 'STRING';
  if (Array.isArray(value)) return 'Seq';
  if (value && typeof value === 'object') return 'RECORD';
  return 'ANY';
}

/**
 * Get type constraint for a variable
 * @param {Object} variable - Variable definition
 * @returns {string} TLA+ type constraint
 */
function getTypeConstraint(variable) {
  const name = sanitizeName(variable.name);
  switch (variable.type) {
    case 'Int':
      return `${name} \\in Int`;
    case 'BOOLEAN':
      return `${name} \\in BOOLEAN`;
    case 'STRING':
      return `${name} \\in STRING`;
    case 'Seq':
      return `${name} \\in Seq(ANY)`;
    default:
      return null;
  }
}

/**
 * Get initial value for TLA+ variable
 * @param {Object} variable - Variable definition
 * @returns {string} TLA+ initial value
 */
function getInitialValue(variable) {
  const value = variable.initialValue;

  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return `"${value}"`;
  if (Array.isArray(value)) return '<<>>';
  if (typeof value === 'object') return '[empty |-> TRUE]';

  return '0';
}

/**
 * Determine which TLA+ modules to extend
 * @param {Array} contextVars - Context variables
 * @param {Array} _invariants - Invariants (reserved for future use)
 * @returns {Array<string>} Module names to extend
 */
function determineExtensions(contextVars, _invariants) {
  const extensions = new Set(['TLC']);

  // Check if we need Naturals or Integers
  const hasNumbers = contextVars.some(v => v.type === 'Int');
  if (hasNumbers) {
    extensions.add('Naturals');
    extensions.add('Integers');
  }

  // Check if we need Sequences
  const hasSequences = contextVars.some(v => v.type === 'Seq');
  if (hasSequences) {
    extensions.add('Sequences');
  }

  return Array.from(extensions);
}

/**
 * Translate guard condition to TLA+
 * @param {*} guard - Guard condition
 * @param {Array} _contextVars - Context variables (reserved for future use)
 * @returns {string} TLA+ guard expression
 */
function translateGuard(guard, _contextVars) {
  if (!guard) return 'TRUE';

  // String guard (guard name reference)
  if (typeof guard === 'string') {
    return `Guard_${sanitizeName(guard)}`;
  }

  // Object with type property
  if (guard.type) {
    return `Guard_${sanitizeName(guard.type)}`;
  }

  return 'TRUE';
}

/**
 * Translate JavaScript expression to TLA+
 * @param {string} expr - JavaScript expression
 * @returns {string} TLA+ expression
 */
function translateExpression(expr) {
  if (!expr) return '0';

  // Simple transformations
  return expr
    .replace(/&&/g, '/\\')
    .replace(/\|\|/g, '\\/')
    .replace(/!/g, '~')
    .replace(/===/g, '=')
    .replace(/==/g, '=')
    .replace(/!=/g, '#')
    .replace(/!==/g, '#')
    .replace(/<=/g, '<=')
    .replace(/>=/g, '>=')
    .replace(/true/gi, 'TRUE')
    .replace(/false/gi, 'FALSE');
}

/**
 * Translate an MBT invariant to TLA+
 * @param {Object} invariant - MBT invariant
 * @param {Array} _contextVars - Context variables (reserved for future use)
 * @param {Array} _states - State names (reserved for future use)
 * @returns {string} TLA+ invariant formula
 */
function translateInvariant(invariant, _contextVars, _states) {
  const name = invariant.name;

  // Built-in invariant translations
  switch (name) {
    case 'budgetRespected':
      return 'llmCallsUsed <= llmCallsBudget';

    case 'retriesBounded':
      return '\\A tool \\in DOMAIN retryCount: retryCount[tool] <= maxRetries';

    case 'noInvalidCompletion':
      return 'state = State_completed => \\A tool \\in requiredTools: toolResults[tool] = "success"';

    case 'escalationHasReason':
      return 'state = State_escalated => errorReason # NULL';

    case 'progressGuaranteed':
      return '\\* Requires temporal logic - see liveness properties';

    default:
      // Generic invariant placeholder
      return `TRUE \\* TODO: Translate ${name}`;
  }
}

/**
 * Sanitize a name for use in TLA+
 * @param {string} name - Original name
 * @returns {string} Sanitized name
 */
function sanitizeName(name) {
  if (!name) return 'Unknown';

  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/__+/g, '_');
}

/**
 * Generate a TLA+ configuration file (.cfg) for TLC
 * @param {Object} machine - XState machine definition
 * @param {Array} invariants - Invariants to check
 * @param {Object} options - Configuration options
 * @returns {string} TLA+ configuration file content
 */
function generateTLCConfig(machine, invariants = [], options = {}) {
  const machineConfig = getMachineConfig(machine);
  const states = extractStates(machineConfig);

  const lines = [];

  lines.push('\\* TLC Configuration File');
  lines.push('');

  // Constants
  lines.push('CONSTANTS');
  for (const state of states) {
    lines.push(`    State_${sanitizeName(state)} = State_${sanitizeName(state)}`);
  }
  lines.push('');

  // Specification
  lines.push('SPECIFICATION');
  lines.push('    Spec');
  lines.push('');

  // Invariants to check
  lines.push('INVARIANTS');
  lines.push('    TypeOK');
  for (const inv of invariants) {
    lines.push(`    ${sanitizeName(inv.name)}`);
  }
  lines.push('');

  // Properties (optional)
  if (options.checkLiveness) {
    lines.push('PROPERTIES');
    lines.push('    \\* Add liveness properties here');
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  generateTLASpec,
  generateTLCConfig,
  extractStates,
  extractTransitions,
  extractContextVariables,
  sanitizeName,
  translateInvariant
};
