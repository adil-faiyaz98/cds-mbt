/**
 * TLA+ Spec Generator Tests
 * 
 * Tests for generating TLA+ specifications from XState machines.
 */

const { createMachine, assign } = require('xstate');
const {
  generateTLASpec,
  generateTLCConfig,
  extractStates,
  extractTransitions,
  extractContextVariables,
  sanitizeName,
  translateInvariant
} = require('../../lib/tla/spec-generator');

describe('spec-generator', () => {
  describe('generateTLASpec()', () => {
    const simpleMachine = createMachine({
      id: 'testMachine',
      initial: 'idle',
      context: {
        count: 0,
        active: false
      },
      states: {
        idle: { on: { START: 'running' } },
        running: { on: { STOP: 'stopped' } },
        stopped: { type: 'final' }
      }
    });

    it('should generate valid TLA+ spec with MODULE declaration', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('---- MODULE testMachine ----');
      expect(spec).toContain('====');
    });

    it('should include VARIABLE declaration', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('VARIABLES');
      expect(spec).toContain('state,');
    });

    it('should include Init definition', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('Init ==');
      expect(spec).toContain('state = State_idle');
    });

    it('should include Next definition', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('Next ==');
    });

    it('should include Spec definition', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('Spec == Init /\\ [][Next]_vars');
    });

    it('should include state constants', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('CONSTANTS');
      expect(spec).toContain('State_idle');
      expect(spec).toContain('State_running');
      expect(spec).toContain('State_stopped');
    });

    it('should include TypeOK invariant', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('TypeOK ==');
      expect(spec).toContain('state \\in {');
    });

    it('should include context variables', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('count,');
      expect(spec).toContain('active,');
    });

    it('should include EXTENDS clause', () => {
      const spec = generateTLASpec(simpleMachine);

      expect(spec).toContain('EXTENDS');
      expect(spec).toContain('TLC');
    });

    it('should allow custom module name', () => {
      const spec = generateTLASpec(simpleMachine, [], { moduleName: 'CustomModule' });

      expect(spec).toContain('---- MODULE CustomModule ----');
    });

    it('should throw error for null machine', () => {
      expect(() => {
        generateTLASpec(null);
      }).toThrow('Machine definition is required');
    });

    it('should translate invariants to TLA+', () => {
      const invariants = [
        { name: 'budgetRespected', description: 'Budget check' }
      ];

      const spec = generateTLASpec(simpleMachine, invariants);

      expect(spec).toContain('budgetRespected ==');
    });
  });

  describe('generateTLASpec() with multi-state machine', () => {
    const complexMachine = createMachine({
      id: 'complexAgent',
      initial: 'idle',
      context: {
        llmCallsUsed: 0,
        llmCallsBudget: 10,
        retryCount: 0
      },
      states: {
        idle: {
          on: { START: 'planning' }
        },
        planning: {
          on: {
            PLAN_READY: 'executing',
            PLAN_FAILED: 'escalated'
          }
        },
        executing: {
          on: {
            TOOL_SUCCESS: 'synthesizing',
            TOOL_FAILURE: { target: 'executing' },
            TOOL_TIMEOUT: 'escalated'
          }
        },
        synthesizing: {
          on: {
            DONE: 'completed',
            FAILED: 'escalated'
          }
        },
        completed: { type: 'final' },
        escalated: { type: 'final' }
      }
    });

    it('should handle multiple states', () => {
      const spec = generateTLASpec(complexMachine);

      expect(spec).toContain('State_idle');
      expect(spec).toContain('State_planning');
      expect(spec).toContain('State_executing');
      expect(spec).toContain('State_synthesizing');
      expect(spec).toContain('State_completed');
      expect(spec).toContain('State_escalated');
    });

    it('should generate transition actions', () => {
      const spec = generateTLASpec(complexMachine);

      // Should have action definitions for transitions
      expect(spec).toContain('Action_');
      expect(spec).toContain('state\' =');
    });

    it('should include vars tuple', () => {
      const spec = generateTLASpec(complexMachine);

      expect(spec).toContain('vars == <<');
    });
  });

  describe('generateTLASpec() with special characters', () => {
    it('should sanitize state names with special characters', () => {
      // Use machine config directly to avoid XState validation of state names
      const machineConfig = {
        id: 'special-chars_machine.v2',
        initial: 'state-one',
        states: {
          'state-one': { on: { GO: 'state_two' } },
          'state_two': { type: 'final' }
        }
      };

      const spec = generateTLASpec(machineConfig);

      // Should sanitize special characters in identifiers
      expect(spec).toContain('State_state_one');
      expect(spec).toContain('special_chars_machine_v2');
    });

    it('should sanitize numeric-leading names', () => {
      // Use machine config directly to avoid XState validation
      const machineConfig = {
        id: '123machine',
        initial: 'start1',
        states: {
          'start1': { on: { GO: 'end2' } },
          'end2': { type: 'final' }
        }
      };

      const spec = generateTLASpec(machineConfig);

      // Module name should be sanitized for numeric leading
      expect(spec).toContain('_123machine');
    });
  });

  describe('extractStates()', () => {
    it('should extract states from machine config', () => {
      const machineConfig = {
        states: {
          idle: {},
          running: {},
          done: { type: 'final' }
        }
      };

      const states = extractStates(machineConfig);

      expect(states).toContain('idle');
      expect(states).toContain('running');
      expect(states).toContain('done');
    });

    it('should handle nested states', () => {
      const machineConfig = {
        states: {
          idle: {},
          active: {
            states: {
              loading: {},
              ready: {}
            }
          }
        }
      };

      const states = extractStates(machineConfig);

      expect(states).toContain('idle');
      expect(states).toContain('active');
      expect(states).toContain('active_loading');
      expect(states).toContain('active_ready');
    });

    it('should handle empty states', () => {
      const machineConfig = { states: {} };
      const states = extractStates(machineConfig);
      expect(states).toEqual([]);
    });
  });

  describe('extractTransitions()', () => {
    it('should extract transitions from machine config', () => {
      const machineConfig = {
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle', DONE: 'complete' } },
          complete: { type: 'final' }
        }
      };

      const transitions = extractTransitions(machineConfig);

      expect(transitions.length).toBe(3);
      expect(transitions.some(t => t.from === 'idle' && t.to === 'running')).toBe(true);
      expect(transitions.some(t => t.from === 'running' && t.to === 'idle')).toBe(true);
      expect(transitions.some(t => t.from === 'running' && t.to === 'complete')).toBe(true);
    });

    it('should extract event names', () => {
      const machineConfig = {
        states: {
          a: { on: { GO: 'b' } },
          b: { type: 'final' }
        }
      };

      const transitions = extractTransitions(machineConfig);

      expect(transitions[0].event).toBe('GO');
    });

    it('should handle object target config', () => {
      const machineConfig = {
        states: {
          a: { on: { GO: { target: 'b', guard: 'canGo' } } },
          b: { type: 'final' }
        }
      };

      const transitions = extractTransitions(machineConfig);

      expect(transitions[0].to).toBe('b');
      expect(transitions[0].guard).toBe('canGo');
    });
  });

  describe('extractContextVariables()', () => {
    it('should extract context variables with types', () => {
      const machineConfig = {
        context: {
          count: 0,
          active: false,
          name: 'test',
          items: []
        }
      };

      const variables = extractContextVariables(machineConfig);

      expect(variables.find(v => v.name === 'count').type).toBe('Int');
      expect(variables.find(v => v.name === 'active').type).toBe('BOOLEAN');
      expect(variables.find(v => v.name === 'name').type).toBe('STRING');
      expect(variables.find(v => v.name === 'items').type).toBe('Seq');
    });

    it('should handle empty context', () => {
      const machineConfig = { context: {} };
      const variables = extractContextVariables(machineConfig);
      expect(variables).toEqual([]);
    });

    it('should handle missing context', () => {
      const machineConfig = {};
      const variables = extractContextVariables(machineConfig);
      expect(variables).toEqual([]);
    });
  });

  describe('sanitizeName()', () => {
    it('should replace special characters with underscores', () => {
      expect(sanitizeName('my-name')).toBe('my_name');
      expect(sanitizeName('my.name')).toBe('my_name');
      expect(sanitizeName('my name')).toBe('my_name');
    });

    it('should prefix numeric-leading names', () => {
      expect(sanitizeName('123start')).toBe('_123start');
    });

    it('should collapse multiple underscores', () => {
      expect(sanitizeName('a--b__c')).toBe('a_b_c');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeName(null)).toBe('Unknown');
      expect(sanitizeName(undefined)).toBe('Unknown');
    });
  });

  describe('translateInvariant()', () => {
    it('should translate budgetRespected invariant', () => {
      const invariant = { name: 'budgetRespected' };
      const result = translateInvariant(invariant, [], []);

      expect(result).toContain('llmCallsUsed');
      expect(result).toContain('llmCallsBudget');
    });

    it('should translate retriesBounded invariant', () => {
      const invariant = { name: 'retriesBounded' };
      const result = translateInvariant(invariant, [], []);

      expect(result).toContain('retryCount');
      expect(result).toContain('maxRetries');
    });

    it('should translate noInvalidCompletion invariant', () => {
      const invariant = { name: 'noInvalidCompletion' };
      const result = translateInvariant(invariant, [], []);

      expect(result).toContain('completed');
      expect(result).toContain('toolResults');
    });

    it('should translate escalationHasReason invariant', () => {
      const invariant = { name: 'escalationHasReason' };
      const result = translateInvariant(invariant, [], []);

      expect(result).toContain('escalated');
      expect(result).toContain('errorReason');
    });

    it('should generate placeholder for unknown invariants', () => {
      const invariant = { name: 'customInvariant' };
      const result = translateInvariant(invariant, [], []);

      expect(result).toContain('TODO');
      expect(result).toContain('customInvariant');
    });
  });

  describe('generateTLCConfig()', () => {
    const machine = createMachine({
      id: 'configTest',
      initial: 'idle',
      states: {
        idle: { on: { START: 'active' } },
        active: { on: { STOP: 'done' } },
        done: { type: 'final' }
      }
    });

    it('should generate TLC config file content', () => {
      const config = generateTLCConfig(machine);

      expect(config).toContain('CONSTANTS');
      expect(config).toContain('SPECIFICATION');
      expect(config).toContain('Spec');
      expect(config).toContain('INVARIANTS');
      expect(config).toContain('TypeOK');
    });

    it('should include state constants', () => {
      const config = generateTLCConfig(machine);

      expect(config).toContain('State_idle');
      expect(config).toContain('State_active');
      expect(config).toContain('State_done');
    });

    it('should include invariants from array', () => {
      const invariants = [
        { name: 'budgetRespected' },
        { name: 'retriesBounded' }
      ];

      const config = generateTLCConfig(machine, invariants);

      expect(config).toContain('budgetRespected');
      expect(config).toContain('retriesBounded');
    });

    it('should include liveness properties when requested', () => {
      const config = generateTLCConfig(machine, [], { checkLiveness: true });

      expect(config).toContain('PROPERTIES');
    });
  });
});
