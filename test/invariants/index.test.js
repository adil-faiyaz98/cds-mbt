/**
 * Built-in Invariants Tests
 * 
 * Tests for each built-in invariant with passing and failing scenarios.
 */

const {
  budgetRespected,
  retriesBounded,
  noInvalidCompletion,
  escalationHasReason,
  noOrphanedState,
  timeoutRespected,
  dataConsistent,
  rollbackAvailable,
  agent,
  migration,
  all
} = require('../../lib/invariants');

describe('built-in invariants', () => {
  describe('budgetRespected', () => {
    it('should pass when usage is under budget', () => {
      const result = budgetRespected.check({
        llmCallsUsed: 5,
        llmCallsBudget: 10
      }, 'working');

      expect(result.passed).toBe(true);
    });

    it('should pass when usage equals budget', () => {
      const result = budgetRespected.check({
        llmCallsUsed: 10,
        llmCallsBudget: 10
      }, 'working');

      expect(result.passed).toBe(true);
    });

    it('should fail when usage exceeds budget', () => {
      const result = budgetRespected.check({
        llmCallsUsed: 15,
        llmCallsBudget: 10
      }, 'working');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('exceeds budget');
    });

    it('should handle alternative property names', () => {
      const result = budgetRespected.check({
        callsUsed: 5,
        callsBudget: 10
      }, 'working');

      expect(result.passed).toBe(true);
    });

    it('should skip when no budget configured', () => {
      const result = budgetRespected.check({
        llmCallsUsed: 100
      }, 'working');

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should have correct metadata', () => {
      expect(budgetRespected.name).toBe('budgetRespected');
      expect(budgetRespected.category).toBe('resource');
      expect(budgetRespected.severity).toBe('error');
    });
  });

  describe('retriesBounded', () => {
    it('should pass when retries are within limit', () => {
      const result = retriesBounded.check({
        retryCount: { toolA: 2, toolB: 1 },
        maxRetries: 3
      }, 'executing');

      expect(result.passed).toBe(true);
    });

    it('should fail when retries exceed limit', () => {
      const result = retriesBounded.check({
        retryCount: { toolA: 5, toolB: 2 },
        maxRetries: 3
      }, 'executing');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('toolA');
      expect(result.message).toContain('5/3');
    });

    it('should fail for multiple tools exceeding limit', () => {
      const result = retriesBounded.check({
        retryCount: { toolA: 5, toolB: 10 },
        maxRetries: 3
      }, 'executing');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('toolA');
      expect(result.message).toContain('toolB');
    });

    it('should pass with empty retry count', () => {
      const result = retriesBounded.check({
        retryCount: {},
        maxRetries: 3
      }, 'executing');

      expect(result.passed).toBe(true);
    });

    it('should use default maxRetries of 3', () => {
      const result = retriesBounded.check({
        retryCount: { tool: 4 }
      }, 'executing');

      expect(result.passed).toBe(false);
    });
  });

  describe('noInvalidCompletion', () => {
    it('should pass in non-completed states', () => {
      const result = noInvalidCompletion.check({
        requiredTools: ['tool1'],
        toolResults: {}
      }, 'executing');

      expect(result.passed).toBe(true);
    });

    it('should pass when all required tools succeeded', () => {
      const result = noInvalidCompletion.check({
        requiredTools: ['tool1', 'tool2'],
        toolResults: { tool1: 'success', tool2: 'success' }
      }, 'completed');

      expect(result.passed).toBe(true);
    });

    it('should fail when completed with missing tool results', () => {
      const result = noInvalidCompletion.check({
        requiredTools: ['tool1', 'tool2'],
        toolResults: { tool1: 'success' }
      }, 'completed');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('tool2');
    });

    it('should fail when completed with failed tools', () => {
      const result = noInvalidCompletion.check({
        requiredTools: ['tool1', 'tool2'],
        toolResults: { tool1: 'success', tool2: 'failure' }
      }, 'completed');

      expect(result.passed).toBe(false);
    });

    it('should handle boolean tool results', () => {
      const result = noInvalidCompletion.check({
        requiredTools: ['tool1'],
        toolResults: { tool1: true }
      }, 'completed');

      expect(result.passed).toBe(true);
    });

    it('should pass when no required tools', () => {
      const result = noInvalidCompletion.check({
        requiredTools: [],
        toolResults: {}
      }, 'completed');

      expect(result.passed).toBe(true);
    });

    it('should recognize various completed state names', () => {
      const context = {
        requiredTools: ['tool1'],
        toolResults: {}
      };

      expect(noInvalidCompletion.check(context, 'completed').passed).toBe(false);
      expect(noInvalidCompletion.check(context, 'done').passed).toBe(false);
      expect(noInvalidCompletion.check(context, 'success').passed).toBe(false);
    });

    it('should handle object state value', () => {
      const result = noInvalidCompletion.check({
        requiredTools: ['tool1'],
        toolResults: {}
      }, { completed: true });

      expect(result.passed).toBe(false);
    });
  });

  describe('escalationHasReason', () => {
    it('should pass in non-escalated states', () => {
      const result = escalationHasReason.check({}, 'executing');

      expect(result.passed).toBe(true);
    });

    it('should pass when escalated with errorReason', () => {
      const result = escalationHasReason.check({
        errorReason: 'Budget exhausted'
      }, 'escalated');

      expect(result.passed).toBe(true);
    });

    it('should pass when escalated with escalationReason', () => {
      const result = escalationHasReason.check({
        escalationReason: 'Manual escalation'
      }, 'escalated');

      expect(result.passed).toBe(true);
    });

    it('should pass when failed with failureReason', () => {
      const result = escalationHasReason.check({
        failureReason: 'Network timeout'
      }, 'failed');

      expect(result.passed).toBe(true);
    });

    it('should pass when error state has error property', () => {
      const result = escalationHasReason.check({
        error: new Error('Something went wrong')
      }, 'error');

      expect(result.passed).toBe(true);
    });

    it('should fail when escalated without reason', () => {
      const result = escalationHasReason.check({}, 'escalated');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('without providing a reason');
    });

    it('should fail when failed without reason', () => {
      const result = escalationHasReason.check({}, 'failed');

      expect(result.passed).toBe(false);
    });

    it('should handle object state value', () => {
      const result = escalationHasReason.check({
        errorReason: null
      }, { escalated: true });

      expect(result.passed).toBe(false);
    });
  });

  describe('noOrphanedState', () => {
    it('should pass for paths ending in final state', () => {
      const result = noOrphanedState.check({}, 'completed', {
        path: {
          steps: [
            { toState: 'idle' },
            { toState: 'working' },
            { toState: 'completed' }
          ]
        }
      });

      expect(result.passed).toBe(true);
    });

    it('should pass for paths with loops', () => {
      const result = noOrphanedState.check({}, 'working', {
        path: {
          steps: [{ toState: 'working' }],
          hasLoop: true
        }
      });

      expect(result.passed).toBe(true);
    });

    it('should warn about non-final states', () => {
      const result = noOrphanedState.check({}, 'processing', {
        path: {
          steps: [
            { toState: 'idle' },
            { toState: 'processing' }
          ],
          hasLoop: false
        }
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('non-final state');
    });

    it('should pass when no path metadata', () => {
      const result = noOrphanedState.check({}, 'idle');

      expect(result.passed).toBe(true);
    });
  });

  describe('timeoutRespected', () => {
    it('should pass when elapsed time is under timeout', () => {
      const result = timeoutRespected.check({
        elapsedTime: 5000,
        timeout: 10000
      }, 'working');

      expect(result.passed).toBe(true);
    });

    it('should fail when elapsed time exceeds timeout', () => {
      const result = timeoutRespected.check({
        elapsedTime: 15000,
        timeout: 10000
      }, 'working');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('exceeds timeout');
    });

    it('should skip when no timeout configured', () => {
      const result = timeoutRespected.check({
        elapsedTime: 100000
      }, 'working');

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should handle alternative property names', () => {
      const result = timeoutRespected.check({
        executionTime: 5000,
        maxTime: 10000
      }, 'working');

      expect(result.passed).toBe(true);
    });
  });

  describe('dataConsistent', () => {
    it('should pass when source and target counts match', () => {
      const result = dataConsistent.check({
        sourceCount: 1000,
        targetCount: 1000
      }, 'completed');

      expect(result.passed).toBe(true);
    });

    it('should fail when counts do not match', () => {
      const result = dataConsistent.check({
        sourceCount: 1000,
        targetCount: 950
      }, 'completed');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('1000');
      expect(result.message).toContain('950');
    });

    it('should pass during rollback even with mismatch', () => {
      const result = dataConsistent.check({
        sourceCount: 1000,
        targetCount: 500
      }, 'rollingBack');

      expect(result.passed).toBe(true);
    });

    it('should skip when counts are undefined', () => {
      const result = dataConsistent.check({}, 'completed');

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should handle alternative property names', () => {
      const result = dataConsistent.check({
        sourceRecords: 100,
        targetRecords: 100
      }, 'completed');

      expect(result.passed).toBe(true);
    });
  });

  describe('rollbackAvailable', () => {
    it('should pass when committed (no rollback needed)', () => {
      const result = rollbackAvailable.check({
        isCommitted: true,
        rollbackData: null
      }, 'committed');

      expect(result.passed).toBe(true);
    });

    it('should pass before processing started', () => {
      const result = rollbackAvailable.check({
        sourceCount: 0,
        processedCount: 0,
        rollbackData: null
      }, 'idle');

      expect(result.passed).toBe(true);
    });

    it('should pass when processing with rollback data', () => {
      const result = rollbackAvailable.check({
        sourceCount: 1000,
        processedCount: 500,
        rollbackData: { checkpoint: 1 }
      }, 'loading');

      expect(result.passed).toBe(true);
    });

    it('should fail when processing without rollback data', () => {
      const result = rollbackAvailable.check({
        sourceCount: 1000,
        processedCount: 500,
        rollbackData: null
      }, 'loading');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No rollback data');
    });
  });

  describe('invariant collections', () => {
    it('should export agent invariants collection', () => {
      expect(agent).toBeDefined();
      expect(agent.budgetRespected).toBe(budgetRespected);
      expect(agent.retriesBounded).toBe(retriesBounded);
      expect(agent.noInvalidCompletion).toBe(noInvalidCompletion);
      expect(agent.escalationHasReason).toBe(escalationHasReason);
    });

    it('should export migration invariants collection', () => {
      expect(migration).toBeDefined();
      expect(migration.dataConsistent).toBe(dataConsistent);
      expect(migration.rollbackAvailable).toBe(rollbackAvailable);
      expect(migration.noInvalidCompletion).toBe(noInvalidCompletion);
    });

    it('should export all core invariants as array', () => {
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(4);
      expect(all).toContain(budgetRespected);
      expect(all).toContain(retriesBounded);
      expect(all).toContain(noInvalidCompletion);
      expect(all).toContain(escalationHasReason);
    });
  });
});
