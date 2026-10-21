/**
 * Invariant Builder Tests
 * 
 * Tests for the invariant creation and validation utilities.
 */

const {
  createInvariant,
  fromPredicate,
  combine,
  when,
  bound,
  validateInvariant
} = require('../../lib/core/invariant-builder');

describe('invariant-builder', () => {
  describe('createInvariant()', () => {
    it('should create an invariant with valid config', () => {
      const invariant = createInvariant({
        name: 'testInvariant',
        description: 'A test invariant',
        check: () => ({ passed: true })
      });

      expect(invariant.name).toBe('testInvariant');
      expect(invariant.description).toBe('A test invariant');
      expect(typeof invariant.check).toBe('function');
      expect(invariant.severity).toBe('error');
      expect(invariant.category).toBe('custom');
    });

    it('should throw error when name is missing', () => {
      expect(() => {
        createInvariant({
          description: 'No name',
          check: () => ({ passed: true })
        });
      }).toThrow('Invariant must have a name');
    });

    it('should throw error when check function is missing', () => {
      expect(() => {
        createInvariant({
          name: 'noCheck',
          description: 'No check function'
        });
      }).toThrow('Invariant must have a check function');
    });

    it('should throw error when check is not a function', () => {
      expect(() => {
        createInvariant({
          name: 'invalidCheck',
          check: 'not a function'
        });
      }).toThrow('Invariant must have a check function');
    });

    it('should use default description when not provided', () => {
      const invariant = createInvariant({
        name: 'minimalInvariant',
        check: () => true
      });

      expect(invariant.description).toBe('Invariant: minimalInvariant');
    });

    it('should allow custom severity and category', () => {
      const invariant = createInvariant({
        name: 'custom',
        check: () => true,
        severity: 'warning',
        category: 'resource'
      });

      expect(invariant.severity).toBe('warning');
      expect(invariant.category).toBe('resource');
    });

    it('should have toString() method', () => {
      const invariant = createInvariant({
        name: 'stringable',
        check: () => true
      });

      expect(invariant.toString()).toBe('[Invariant: stringable]');
    });
  });

  describe('fromPredicate()', () => {
    it('should create invariant from simple predicate', () => {
      const invariant = fromPredicate(
        'positiveCount',
        (context) => context.count >= 0,
        'Count should be positive'
      );

      expect(invariant.name).toBe('positiveCount');
      expect(invariant.description).toBe('Count should be positive');
    });

    it('should pass when predicate returns true', () => {
      const invariant = fromPredicate(
        'alwaysTrue',
        () => true
      );

      const result = invariant.check({}, 'idle');
      expect(result.passed).toBe(true);
    });

    it('should fail when predicate returns false', () => {
      const invariant = fromPredicate(
        'alwaysFalse',
        () => false
      );

      const result = invariant.check({}, 'idle');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('alwaysFalse violated');
    });

    it('should receive context and state', () => {
      let receivedContext, receivedState;
      const invariant = fromPredicate(
        'receiver',
        (context, state) => {
          receivedContext = context;
          receivedState = state;
          return true;
        }
      );

      invariant.check({ value: 42 }, 'testing');

      expect(receivedContext).toEqual({ value: 42 });
      expect(receivedState).toBe('testing');
    });
  });

  describe('combine()', () => {
    const passing1 = createInvariant({
      name: 'pass1',
      check: () => ({ passed: true })
    });

    const passing2 = createInvariant({
      name: 'pass2',
      check: () => ({ passed: true })
    });

    const failing = createInvariant({
      name: 'fail',
      check: () => ({ passed: false, message: 'Failed!' })
    });

    it('should pass when all invariants pass', () => {
      const combined = combine('allPass', [passing1, passing2]);

      const result = combined.check({}, 'idle');
      expect(result.passed).toBe(true);
    });

    it('should fail when any invariant fails', () => {
      const combined = combine('someFail', [passing1, failing, passing2]);

      const result = combined.check({}, 'idle');
      expect(result.passed).toBe(false);
    });

    it('should include all failure messages', () => {
      const failing1 = createInvariant({
        name: 'fail1',
        check: () => ({ passed: false, message: 'First failure' })
      });

      const failing2 = createInvariant({
        name: 'fail2',
        check: () => ({ passed: false, message: 'Second failure' })
      });

      const combined = combine('multipleFail', [failing1, failing2]);

      const result = combined.check({}, 'idle');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('First failure');
      expect(result.message).toContain('Second failure');
    });

    it('should have correct description', () => {
      const combined = combine('combo', [passing1, passing2]);

      expect(combined.description).toContain('pass1');
      expect(combined.description).toContain('pass2');
    });

    it('should handle invariants that return boolean', () => {
      const booleanInvariant = createInvariant({
        name: 'boolean',
        check: () => false
      });

      const combined = combine('withBoolean', [passing1, booleanInvariant]);

      const result = combined.check({}, 'idle');
      expect(result.passed).toBe(false);
    });
  });

  describe('when()', () => {
    it('should check invariant when condition is met', () => {
      const conditional = when(
        'checkWhenActive',
        (context) => context.isActive,
        (context) => ({ 
          passed: context.value > 0, 
          message: 'Value must be positive when active' 
        })
      );

      // Condition met, check passes
      let result = conditional.check({ isActive: true, value: 5 }, 'idle');
      expect(result.passed).toBe(true);

      // Condition met, check fails
      result = conditional.check({ isActive: true, value: -1 }, 'idle');
      expect(result.passed).toBe(false);
    });

    it('should skip check when condition is not met', () => {
      const conditional = when(
        'skipWhenInactive',
        (context) => context.isActive,
        () => ({ passed: false })
      );

      const result = conditional.check({ isActive: false }, 'idle');
      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should receive state in condition', () => {
      let receivedState;
      const conditional = when(
        'stateCondition',
        (context, state) => {
          receivedState = state;
          return true;
        },
        () => ({ passed: true })
      );

      conditional.check({}, 'testState');
      expect(receivedState).toBe('testState');
    });
  });

  describe('bound()', () => {
    it('should check less than bound', () => {
      const invariant = bound('used', 'lt', 'budget');

      expect(invariant.check({ used: 5, budget: 10 }).passed).toBe(true);
      expect(invariant.check({ used: 10, budget: 10 }).passed).toBe(false);
      expect(invariant.check({ used: 15, budget: 10 }).passed).toBe(false);
    });

    it('should check less than or equal bound', () => {
      const invariant = bound('used', 'lte', 'budget');

      expect(invariant.check({ used: 5, budget: 10 }).passed).toBe(true);
      expect(invariant.check({ used: 10, budget: 10 }).passed).toBe(true);
      expect(invariant.check({ used: 15, budget: 10 }).passed).toBe(false);
    });

    it('should check greater than bound', () => {
      const invariant = bound('progress', 'gt', 'minimum');

      expect(invariant.check({ progress: 5, minimum: 3 }).passed).toBe(true);
      expect(invariant.check({ progress: 3, minimum: 3 }).passed).toBe(false);
    });

    it('should check greater than or equal bound', () => {
      const invariant = bound('progress', 'gte', 'minimum');

      expect(invariant.check({ progress: 5, minimum: 3 }).passed).toBe(true);
      expect(invariant.check({ progress: 3, minimum: 3 }).passed).toBe(true);
      expect(invariant.check({ progress: 1, minimum: 3 }).passed).toBe(false);
    });

    it('should check equality', () => {
      const invariant = bound('actual', 'eq', 'expected');

      expect(invariant.check({ actual: 5, expected: 5 }).passed).toBe(true);
      expect(invariant.check({ actual: 5, expected: 10 }).passed).toBe(false);
    });

    it('should skip when values are undefined', () => {
      const invariant = bound('used', 'lte', 'budget');

      expect(invariant.check({ used: undefined, budget: 10 }).skipped).toBe(true);
      expect(invariant.check({ used: 5, budget: undefined }).skipped).toBe(true);
      expect(invariant.check({}).skipped).toBe(true);
    });

    it('should have descriptive name', () => {
      const invariant = bound('calls', 'lte', 'maxCalls');

      expect(invariant.name).toBe('calls_lte_maxCalls');
      expect(invariant.description).toContain('calls');
      expect(invariant.description).toContain('at most');
      expect(invariant.description).toContain('maxCalls');
    });

    it('should include values in failure message', () => {
      const invariant = bound('used', 'lte', 'budget');

      const result = invariant.check({ used: 15, budget: 10 });
      expect(result.message).toContain('15');
      expect(result.message).toContain('10');
    });
  });

  describe('validateInvariant()', () => {
    it('should validate a correct invariant', () => {
      const invariant = createInvariant({
        name: 'valid',
        check: () => ({ passed: true })
      });

      const result = validateInvariant(invariant);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report null invariant', () => {
      const result = validateInvariant(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invariant is null or undefined');
    });

    it('should report missing name', () => {
      const result = validateInvariant({
        check: () => true
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invariant must have a name');
    });

    it('should report missing check', () => {
      const result = validateInvariant({
        name: 'noCheck'
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invariant must have a check function');
    });

    it('should report non-function check', () => {
      const result = validateInvariant({
        name: 'badCheck',
        check: 'not a function'
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invariant check must be a function');
    });

    it('should test check function with empty input', () => {
      const result = validateInvariant({
        name: 'throwsOnEmpty',
        check: (context) => {
          // This should be caught
          throw new Error('Cannot handle empty');
        }
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('threw on empty input'))).toBe(true);
    });

    it('should accept check returning boolean', () => {
      const result = validateInvariant({
        name: 'booleanReturn',
        check: () => true
      });

      expect(result.valid).toBe(true);
    });

    it('should accept check returning object', () => {
      const result = validateInvariant({
        name: 'objectReturn',
        check: () => ({ passed: true })
      });

      expect(result.valid).toBe(true);
    });
  });
});
