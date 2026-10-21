/**
 * Agent Invariants Template
 * 
 * Template invariants for AI agent orchestration testing.
 * These ensure agents respect budgets, bounds, and proper completion semantics.
 * 
 * @example
 * // Copy to your test/mbt/invariants/ directory and customize
 * const agentInvariants = require('./agent.invariants');
 */

const { createInvariant } = require('cds-mbt');

/**
 * Budget Respected Invariant
 * 
 * Ensures the agent never exceeds its LLM call budget.
 * Critical for cost control and preventing runaway agents.
 */
const budgetRespected = createInvariant({
  name: 'budgetRespected',
  description: 'LLM calls must never exceed the configured budget',
  category: 'resource',
  severity: 'error',
  check: (context) => {
    const used = context.llmCallsUsed ?? 0;
    const budget = context.llmCallsBudget ?? Infinity;

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
 * Retries Bounded Invariant
 * 
 * Ensures each tool is not retried more than maxRetries times.
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
 * No Invalid Completion Invariant
 * 
 * Ensures the agent never reports "completed" unless all required tools succeeded.
 * Prevents false positive completion reports.
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
                        state === 'success';

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
 * Escalation Has Reason Invariant
 * 
 * Ensures escalated states always have a documented reason.
 * Critical for support team to understand and resolve issues.
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
                        state === 'error';

    if (!isEscalated) {
      return { passed: true };
    }

    const hasReason = context.errorReason || 
                      context.escalationReason || 
                      context.failureReason;

    return {
      passed: !!hasReason,
      message: hasReason 
        ? null 
        : 'Escalated without providing a reason'
    };
  }
});

// Export individual invariants
module.exports = {
  budgetRespected,
  retriesBounded,
  noInvalidCompletion,
  escalationHasReason,
  
  // Export as array for easy use with runMBT
  all: [
    budgetRespected,
    retriesBounded,
    noInvalidCompletion,
    escalationHasReason
  ]
};
