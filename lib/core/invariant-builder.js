/**
 * Invariant Builder
 *
 * Utilities for creating and validating invariants
 */

/**
 * Create a named invariant with metadata
 * @param {Object} config - Invariant configuration
 * @returns {Object} Invariant object
 */
function createInvariant(config) {
  const {
    name,
    description,
    check,
    severity = 'error',
    category = 'custom'
  } = config;

  if (!name) {
    throw new Error('Invariant must have a name');
  }

  if (!check || typeof check !== 'function') {
    throw new Error('Invariant must have a check function');
  }

  return {
    name,
    description: description || `Invariant: ${name}`,
    check,
    severity,
    category,
    toString() {
      return `[Invariant: ${name}]`;
    }
  };
}

/**
 * Create an invariant from a simple predicate
 * @param {string} name - Invariant name
 * @param {Function} predicate - (context, state) => boolean
 * @param {string} description - Optional description
 * @returns {Object} Invariant object
 */
function fromPredicate(name, predicate, description) {
  return createInvariant({
    name,
    description,
    check: (context, state) => {
      const result = predicate(context, state);
      return {
        passed: result,
        message: result ? null : `${name} violated`
      };
    }
  });
}

/**
 * Combine multiple invariants into one
 * @param {string} name - Combined invariant name
 * @param {Array} invariants - Array of invariants
 * @returns {Object} Combined invariant
 */
function combine(name, invariants) {
  return createInvariant({
    name,
    description: `Combined: ${invariants.map(i => i.name).join(', ')}`,
    check: (context, state, meta) => {
      const failures = [];

      for (const inv of invariants) {
        const result = inv.check(context, state, meta);
        const passed = typeof result === 'boolean' ? result : result.passed;

        if (!passed) {
          failures.push({
            invariant: inv.name,
            message: result.message || `${inv.name} violated`
          });
        }
      }

      return {
        passed: failures.length === 0,
        message: failures.length > 0
          ? failures.map(f => f.message).join('; ')
          : null
      };
    }
  });
}

/**
 * Create a conditional invariant
 * @param {string} name - Invariant name
 * @param {Function} condition - When to apply (context, state) => boolean
 * @param {Function} check - The actual check
 * @returns {Object} Invariant object
 */
function when(name, condition, check) {
  return createInvariant({
    name,
    description: `Conditional: ${name}`,
    check: (context, state, meta) => {
      // Skip if condition not met
      if (!condition(context, state)) {
        return { passed: true, skipped: true };
      }
      return check(context, state, meta);
    }
  });
}

/**
 * Create an invariant that checks a context property bound
 * @param {string} property - Context property name
 * @param {string} operator - 'lt', 'lte', 'gt', 'gte', 'eq'
 * @param {string} boundProperty - Property to compare against
 * @returns {Object} Invariant object
 */
function bound(property, operator, boundProperty) {
  const ops = {
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    eq: (a, b) => a === b
  };

  const opNames = {
    lt: 'less than',
    lte: 'at most',
    gt: 'greater than',
    gte: 'at least',
    eq: 'equal to'
  };

  return createInvariant({
    name: `${property}_${operator}_${boundProperty}`,
    description: `${property} must be ${opNames[operator]} ${boundProperty}`,
    check: (context) => {
      const value = context[property];
      const boundValue = context[boundProperty];

      if (value === undefined || boundValue === undefined) {
        return { passed: true, skipped: true };
      }

      const passed = ops[operator](value, boundValue);
      return {
        passed,
        message: passed
          ? null
          : `${property} (${value}) is not ${opNames[operator]} ${boundProperty} (${boundValue})`
      };
    }
  });
}

/**
 * Validate an invariant definition
 * @param {Object} invariant - Invariant to validate
 * @returns {Object} Validation result
 */
function validateInvariant(invariant) {
  const errors = [];

  if (!invariant) {
    errors.push('Invariant is null or undefined');
    return { valid: false, errors };
  }

  if (!invariant.name) {
    errors.push('Invariant must have a name');
  }

  if (!invariant.check) {
    errors.push('Invariant must have a check function');
  } else if (typeof invariant.check !== 'function') {
    errors.push('Invariant check must be a function');
  }

  // Test the check function with empty context
  if (invariant.check && typeof invariant.check === 'function') {
    try {
      const result = invariant.check({}, 'test');
      if (result !== undefined && typeof result !== 'boolean' && typeof result !== 'object') {
        errors.push('Check function must return boolean or { passed: boolean }');
      }
    } catch (err) {
      errors.push(`Check function threw on empty input: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  createInvariant,
  fromPredicate,
  combine,
  when,
  bound,
  validateInvariant
};
