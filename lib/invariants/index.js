/**
 * Built-in Invariants
 *
 * Common invariants for CAP agent orchestration
 */

const { createInvariant } = require('../core/invariant-builder');

/**
 * Budget Respected
 *
 * The agent can NEVER exceed its LLM call budget.
 * Prevents runaway costs from infinite loops.
 */
const budgetRespected = createInvariant({
  name: 'budgetRespected',
  description: 'LLM calls must never exceed the configured budget',
  category: 'resource',
  severity: 'error',
  check: (context) => {
    const used = context.llmCallsUsed ?? context.callsUsed ?? 0;
    const budget = context.llmCallsBudget ?? context.callsBudget ?? context.maxCalls ?? Infinity;

    if (budget === Infinity) {
      return { passed: true, skipped: true, message: 'No budget configured' };
    }

    const passed = used <= budget;
    return {
      passed,
      message: passed
        ? null
        : `LLM calls (${used}) exceeds budget (${budget})`
    };
  }
});

/**
 * Retries Bounded
 *
 * Each tool can NEVER be retried more than maxRetries times.
 * Prevents infinite retry loops.
 */
const retriesBounded = createInvariant({
  name: 'retriesBounded',
  description: 'Each tool must not be retried more than maxRetries times',
  category: 'resource',
  severity: 'error',
  check: (context) => {
    const retryCount = context.retryCount ?? {};
    const maxRetries = context.maxRetries ?? 3;

    const violations = [];
    for (const [tool, count] of Object.entries(retryCount)) {
      if (count > maxRetries) {
        violations.push(`${tool}: ${count}/${maxRetries}`);
      }
    }

    const passed = violations.length === 0;
    return {
      passed,
      message: passed
        ? null
        : `Retry limit exceeded for: ${violations.join(', ')}`
    };
  }
});

/**
 * No Invalid Completion
 *
 * The agent can NEVER report "completed" unless all required tools succeeded.
 * Prevents false success reports.
 */
const noInvalidCompletion = createInvariant({
  name: 'noInvalidCompletion',
  description: 'Completed state requires all required tools to have succeeded',
  category: 'correctness',
  severity: 'error',
  check: (context, state) => {
    // Only check in completed state
    const isCompleted = state === 'completed' ||
                        state === 'done' ||
                        state === 'success' ||
                        (typeof state === 'object' && state.completed);

    if (!isCompleted) {
      return { passed: true };
    }

    const requiredTools = context.requiredTools ?? [];
    const toolResults = context.toolResults ?? {};

    if (requiredTools.length === 0) {
      return { passed: true };
    }

    const failed = requiredTools.filter(tool =>
      toolResults[tool] !== 'success' && toolResults[tool] !== true
    );

    const passed = failed.length === 0;
    return {
      passed,
      message: passed
        ? null
        : `Completed with failed/missing tools: ${failed.join(', ')}`
    };
  }
});

/**
 * Escalation Has Reason
 *
 * If the agent escalates, there MUST be a documented reason.
 * Ensures support team has actionable information.
 */
const escalationHasReason = createInvariant({
  name: 'escalationHasReason',
  description: 'Escalated state must have an error reason documented',
  category: 'correctness',
  severity: 'error',
  check: (context, state) => {
    // Only check in escalated state
    const isEscalated = state === 'escalated' ||
                        state === 'failed' ||
                        state === 'error' ||
                        (typeof state === 'object' && state.escalated);

    if (!isEscalated) {
      return { passed: true };
    }

    const hasReason = context.errorReason ||
                      context.escalationReason ||
                      context.failureReason ||
                      context.error;

    return {
      passed: !!hasReason,
      message: hasReason
        ? null
        : 'Escalated without providing a reason'
    };
  }
});

/**
 * No Orphaned State
 *
 * The machine should never be stuck in a non-final state without valid transitions.
 */
const noOrphanedState = createInvariant({
  name: 'noOrphanedState',
  description: 'Machine must not be stuck in non-final state',
  category: 'liveness',
  severity: 'warning',
  check: (context, state, meta) => {
    // This is checked during path exploration
    // A path ending in a non-final state indicates potential issue
    const { path } = meta || {};
    if (!path) return { passed: true };

    const lastStep = path.steps[path.steps.length - 1];
    const finalStates = ['completed', 'done', 'success', 'failed', 'escalated', 'cancelled'];

    const isFinal = finalStates.includes(lastStep?.toState) ||
                    (typeof lastStep?.toState === 'object');

    return {
      passed: isFinal || path.hasLoop,
      message: isFinal ? null : `Path ends in non-final state: ${lastStep?.toState}`
    };
  }
});

/**
 * Timeout Respected
 *
 * Total execution time tracked in context must not exceed timeout.
 */
const timeoutRespected = createInvariant({
  name: 'timeoutRespected',
  description: 'Execution must not exceed timeout',
  category: 'resource',
  severity: 'warning',
  check: (context) => {
    const elapsed = context.elapsedTime ?? context.executionTime ?? 0;
    const timeout = context.timeout ?? context.maxTime ?? Infinity;

    if (timeout === Infinity) {
      return { passed: true, skipped: true };
    }

    const passed = elapsed <= timeout;
    return {
      passed,
      message: passed
        ? null
        : `Execution time (${elapsed}ms) exceeds timeout (${timeout}ms)`
    };
  }
});

/**
 * Data Consistent (for migration workflows)
 *
 * Source and target counts must match unless in rollback state.
 */
const dataConsistent = createInvariant({
  name: 'dataConsistent',
  description: 'Source and target record counts must match (unless rolling back)',
  category: 'data-integrity',
  severity: 'error',
  check: (context, state) => {
    const isRollingBack = state === 'rollingBack' ||
                          state === 'rollback' ||
                          context.isRollingBack;

    if (isRollingBack) {
      return { passed: true };
    }

    const sourceCount = context.sourceCount ?? context.sourceRecords;
    const targetCount = context.targetCount ?? context.targetRecords;

    if (sourceCount === undefined || targetCount === undefined) {
      return { passed: true, skipped: true };
    }

    const passed = sourceCount === targetCount;
    return {
      passed,
      message: passed
        ? null
        : `Data inconsistency: source (${sourceCount}) != target (${targetCount})`
    };
  }
});

/**
 * Rollback Available
 *
 * Rollback data must be available until commit.
 */
const rollbackAvailable = createInvariant({
  name: 'rollbackAvailable',
  description: 'Rollback must be possible until committed',
  category: 'data-integrity',
  severity: 'error',
  check: (context, state) => {
    const isCommitted = state === 'committed' || context.isCommitted;

    if (isCommitted) {
      return { passed: true };
    }

    const hasRollbackData = context.rollbackData !== null &&
                            context.rollbackData !== undefined;

    // Only enforce if we've started processing
    const hasStarted = context.sourceCount > 0 || context.processedCount > 0;

    if (!hasStarted) {
      return { passed: true };
    }

    return {
      passed: hasRollbackData,
      message: hasRollbackData
        ? null
        : 'No rollback data available before commit'
    };
  }
});

// Export all invariants
module.exports = {
  // Core agent invariants
  budgetRespected,
  retriesBounded,
  noInvalidCompletion,
  escalationHasReason,
  noOrphanedState,
  timeoutRespected,

  // Migration-specific invariants
  dataConsistent,
  rollbackAvailable,

  // Grouped exports
  agent: {
    budgetRespected,
    retriesBounded,
    noInvalidCompletion,
    escalationHasReason
  },

  migration: {
    dataConsistent,
    rollbackAvailable,
    noInvalidCompletion
  },

  // All invariants as array
  all: [
    budgetRespected,
    retriesBounded,
    noInvalidCompletion,
    escalationHasReason
  ]
};
