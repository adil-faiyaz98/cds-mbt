/**
 * Path Explorer Tests
 * 
 * Tests for the core MBT engine that explores state machine paths
 * and checks invariants.
 */

const { createMachine, assign } = require('xstate');
const { runMBT, explorePaths, checkInvariants, formatPath } = require('../../lib/core/path-explorer');
const { createInvariant } = require('../../lib/core/invariant-builder');

describe('path-explorer', () => {
  describe('explorePaths()', () => {
    it('should explore paths through a simple machine', () => {
      const machine = createMachine({
        id: 'simple',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'stopped' } },
          stopped: { type: 'final' }
        }
      });

      const paths = explorePaths(machine);

      expect(paths.length).toBeGreaterThan(0);
      // Should find path: idle -> running -> stopped
      const completePath = paths.find(p => 
        p.steps.some(s => s.toState === 'stopped')
      );
      expect(completePath).toBeDefined();
    });

    it('should detect loops in cyclic machines', () => {
      const machine = createMachine({
        id: 'cyclic',
        initial: 'a',
        states: {
          a: { on: { NEXT: 'b' } },
          b: { on: { NEXT: 'a', END: 'done' } },
          done: { type: 'final' }
        }
      });

      const paths = explorePaths(machine, { stopOnLoop: true });

      // Should find some paths with loops
      const loopPath = paths.find(p => p.hasLoop);
      expect(loopPath).toBeDefined();
    });

    it('should respect maxDepth limit', () => {
      const machine = createMachine({
        id: 'deep',
        initial: 's1',
        states: {
          s1: { on: { NEXT: 's2' } },
          s2: { on: { NEXT: 's3' } },
          s3: { on: { NEXT: 's4' } },
          s4: { on: { NEXT: 's5' } },
          s5: { type: 'final' }
        }
      });

      const paths = explorePaths(machine, { maxDepth: 2 });

      // All paths should have at most 3 steps (initial + 2 transitions)
      for (const path of paths) {
        expect(path.steps.length).toBeLessThanOrEqual(3);
      }
    });

    it('should respect maxPaths limit', () => {
      const machine = createMachine({
        id: 'branchy',
        initial: 'start',
        context: {},
        states: {
          start: { 
            on: { 
              A: 'middle',
              B: 'middle',
              C: 'middle'
            } 
          },
          middle: { 
            on: { 
              X: 'end',
              Y: 'end',
              Z: 'end'
            } 
          },
          end: { type: 'final' }
        }
      });

      const paths = explorePaths(machine, { maxPaths: 5 });

      expect(paths.length).toBeLessThanOrEqual(5);
    });

    it('should track context through transitions', () => {
      const machine = createMachine({
        id: 'contextful',
        initial: 'idle',
        context: { count: 0 },
        states: {
          idle: {
            on: {
              INCREMENT: {
                target: 'counting',
                actions: assign({ count: ({ context }) => context.count + 1 })
              }
            }
          },
          counting: {
            on: {
              INCREMENT: {
                actions: assign({ count: ({ context }) => context.count + 1 })
              },
              DONE: 'complete'
            }
          },
          complete: { type: 'final' }
        }
      });

      const paths = explorePaths(machine, { maxDepth: 10 });

      expect(paths.length).toBeGreaterThan(0);
      // Steps should have context recorded
      const pathWithContext = paths.find(p => 
        p.steps.some(s => s.context && typeof s.context.count === 'number')
      );
      expect(pathWithContext).toBeDefined();
    });
  });

  describe('checkInvariants()', () => {
    const simpleMachine = createMachine({
      id: 'budgeted',
      initial: 'idle',
      context: { 
        llmCallsUsed: 0, 
        llmCallsBudget: 3 
      },
      states: {
        idle: {
          on: {
            START: {
              target: 'working',
              actions: assign({ llmCallsUsed: ({ context }) => context.llmCallsUsed + 1 })
            }
          }
        },
        working: {
          on: {
            CONTINUE: {
              actions: assign({ llmCallsUsed: ({ context }) => context.llmCallsUsed + 1 })
            },
            DONE: 'complete'
          }
        },
        complete: { type: 'final' }
      }
    });

    it('should report no violations for passing invariants', () => {
      const paths = explorePaths(simpleMachine, { maxDepth: 5 });

      const passingInvariant = createInvariant({
        name: 'alwaysTrue',
        description: 'Always passes',
        check: () => ({ passed: true })
      });

      const result = checkInvariants(paths, [passingInvariant]);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should report violations for failing invariants', () => {
      const paths = explorePaths(simpleMachine, { maxDepth: 5 });

      const failingInvariant = createInvariant({
        name: 'alwaysFails',
        description: 'Always fails',
        check: () => ({ passed: false, message: 'This always fails' })
      });

      const result = checkInvariants(paths, [failingInvariant]);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].invariant).toBe('alwaysFails');
    });

    it('should check invariants at each step', () => {
      const paths = explorePaths(simpleMachine, { maxDepth: 5 });

      let checkCount = 0;
      const countingInvariant = createInvariant({
        name: 'counter',
        description: 'Counts checks',
        check: () => {
          checkCount++;
          return { passed: true };
        }
      });

      checkInvariants(paths, [countingInvariant]);

      // Should check at every step of every path
      const totalSteps = paths.reduce((sum, p) => sum + p.steps.length, 0);
      expect(checkCount).toBe(totalSteps);
    });

    it('should include path and state info in violations', () => {
      const paths = explorePaths(simpleMachine, { maxDepth: 5 });

      const failInWorkingInvariant = createInvariant({
        name: 'failInWorking',
        description: 'Fails in working state',
        check: (context, state) => ({
          passed: state !== 'working',
          message: 'Failed in working state'
        })
      });

      const result = checkInvariants(paths, [failInWorkingInvariant]);

      expect(result.violations.length).toBeGreaterThan(0);
      const violation = result.violations[0];
      expect(violation.state).toBe('working');
      expect(violation.path).toBeDefined();
      expect(typeof violation.step).toBe('number');
    });

    it('should handle invariants that return boolean', () => {
      const paths = explorePaths(simpleMachine, { maxDepth: 5 });

      const booleanInvariant = createInvariant({
        name: 'booleanCheck',
        description: 'Returns boolean',
        check: () => true
      });

      const result = checkInvariants(paths, [booleanInvariant]);

      expect(result.passed).toBe(true);
    });

    it('should handle invariant check errors gracefully', () => {
      const paths = explorePaths(simpleMachine, { maxDepth: 5 });

      const errorInvariant = createInvariant({
        name: 'throwsError',
        description: 'Throws error',
        check: () => {
          throw new Error('Test error');
        }
      });

      const result = checkInvariants(paths, [errorInvariant]);

      expect(result.passed).toBe(false);
      expect(result.violations[0].message).toContain('Test error');
    });
  });

  describe('runMBT()', () => {
    const testMachine = createMachine({
      id: 'testAgent',
      initial: 'idle',
      context: {
        llmCallsUsed: 0,
        llmCallsBudget: 5,
        errorReason: null
      },
      states: {
        idle: {
          on: {
            START: {
              target: 'working',
              actions: assign({ llmCallsUsed: ({ context }) => context.llmCallsUsed + 1 })
            }
          }
        },
        working: {
          on: {
            SUCCESS: 'completed',
            FAILURE: {
              target: 'escalated',
              actions: assign({ errorReason: 'Operation failed' })
            }
          }
        },
        completed: { type: 'final' },
        escalated: { type: 'final' }
      }
    });

    it('should run MBT end-to-end with machine and invariants', async () => {
      const invariant = createInvariant({
        name: 'budgetCheck',
        description: 'Check budget',
        check: (context) => ({
          passed: context.llmCallsUsed <= context.llmCallsBudget
        })
      });

      const result = await runMBT(testMachine, [invariant]);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('paths');
      expect(result.machine).toBe('testAgent');
    });

    it('should return stats about exploration', async () => {
      const result = await runMBT(testMachine, []);

      expect(result.stats).toHaveProperty('totalPaths');
      expect(result.stats).toHaveProperty('totalSteps');
      expect(result.stats).toHaveProperty('invariantsChecked');
      expect(result.stats.totalPaths).toBeGreaterThan(0);
    });

    it('should respect options', async () => {
      const result = await runMBT(testMachine, [], {
        maxDepth: 3,
        maxPaths: 10,
        verbose: false
      });

      expect(result.paths.length).toBeLessThanOrEqual(10);
      for (const path of result.paths) {
        expect(path.steps.length).toBeLessThanOrEqual(4); // initial + 3 transitions
      }
    });

    it('should pass with no violations', async () => {
      const alwaysPasses = createInvariant({
        name: 'passes',
        description: 'Always passes',
        check: () => ({ passed: true })
      });

      const result = await runMBT(testMachine, [alwaysPasses]);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail with violations', async () => {
      const alwaysFails = createInvariant({
        name: 'fails',
        description: 'Always fails',
        check: () => ({ passed: false, message: 'Failure' })
      });

      const result = await runMBT(testMachine, [alwaysFails]);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('formatPath()', () => {
    it('should format a path as readable string', () => {
      const path = {
        steps: [
          { event: { type: 'INIT' }, fromState: null, toState: 'idle' },
          { event: { type: 'START' }, fromState: 'idle', toState: 'running' },
          { event: { type: 'STOP' }, fromState: 'running', toState: 'stopped' }
        ]
      };

      const formatted = formatPath(path);

      expect(formatted).toContain('idle');
      expect(formatted).toContain('running');
      expect(formatted).toContain('stopped');
      expect(formatted).toContain('START');
      expect(formatted).toContain('STOP');
    });

    it('should handle empty path', () => {
      const path = { steps: [] };
      const formatted = formatPath(path);
      expect(formatted).toBe('');
    });
  });
});
