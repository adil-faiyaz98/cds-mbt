/**
 * Workflow Invariants Template
 * 
 * Template invariants for workflow testing.
 * These ensure workflows maintain step order, don't skip required steps,
 * and properly enforce approval gates.
 * 
 * @example
 * // Copy to your test/mbt/invariants/ directory and customize
 * const workflowInvariants = require('./workflow.invariants');
 */

const { createInvariant } = require('cds-mbt');

/**
 * Step Order Maintained Invariant
 * 
 * Ensures workflow steps are executed in the correct order.
 * Prevents out-of-order execution that could cause data corruption.
 */
const stepOrderMaintained = createInvariant({
  name: 'stepOrderMaintained',
  description: 'Workflow steps must be executed in the defined order',
  category: 'correctness',
  severity: 'error',
  check: (context) => {
    const completedSteps = context.completedSteps ?? [];
    const definedSteps = context.steps ?? [];

    if (completedSteps.length === 0 || definedSteps.length === 0) {
      return { passed: true };
    }

    // Extract step names (remove :skipped suffix if present)
    const completedStepNames = completedSteps.map(s => s.split(':')[0]);

    // Check that completed steps appear in correct order
    let lastIndex = -1;
    const outOfOrder = [];

    for (const step of completedStepNames) {
      const currentIndex = definedSteps.indexOf(step);
      if (currentIndex === -1) {
        continue; // Unknown step, skip
      }
      if (currentIndex < lastIndex) {
        outOfOrder.push(step);
      }
      lastIndex = Math.max(lastIndex, currentIndex);
    }

    const passed = outOfOrder.length === 0;
    return {
      passed,
      message: passed 
        ? null 
        : `Steps executed out of order: ${outOfOrder.join(', ')}`
    };
  }
});

/**
 * No Skipped Required Steps Invariant
 * 
 * Ensures required steps are not skipped in the workflow.
 * Prevents incomplete workflow execution.
 */
const noSkippedRequiredSteps = createInvariant({
  name: 'noSkippedRequiredSteps',
  description: 'Required steps must not be skipped',
  category: 'correctness',
  severity: 'error',
  check: (context, state) => {
    // Only check in final states
    const isFinal = state === 'completed' || 
                    state === 'done' || 
                    state === 'success';

    if (!isFinal) {
      return { passed: true };
    }

    const completedSteps = context.completedSteps ?? [];
    const requiredSteps = context.requiredSteps ?? [];

    if (requiredSteps.length === 0) {
      return { passed: true };
    }

    // Find required steps that were skipped
    const skippedRequired = requiredSteps.filter(step => {
      const wasSkipped = completedSteps.includes(`${step}:skipped`);
      const wasCompleted = completedSteps.includes(step);
      return wasSkipped && !wasCompleted;
    });

    // Find required steps that were never executed
    const missingRequired = requiredSteps.filter(step => {
      const wasSkipped = completedSteps.includes(`${step}:skipped`);
      const wasCompleted = completedSteps.includes(step);
      return !wasSkipped && !wasCompleted;
    });

    const violations = [...skippedRequired, ...missingRequired];
    const passed = violations.length === 0;

    return {
      passed,
      message: passed 
        ? null 
        : `Required steps skipped or missing: ${violations.join(', ')}`
    };
  }
});

/**
 * Approval Required Invariant
 * 
 * Ensures workflows that require approval don't complete without it.
 * Prevents unauthorized workflow completion.
 */
const approvalRequired = createInvariant({
  name: 'approvalRequired',
  description: 'Workflows requiring approval must not complete without approval',
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

    const requireApproval = context.requireApproval ?? false;

    if (!requireApproval) {
      return { passed: true };
    }

    // Check if approval was granted
    const hasApproval = context.approvalReason || 
                        context.approvedBy || 
                        context.approved === true;

    return {
      passed: hasApproval,
      message: hasApproval 
        ? null 
        : 'Workflow completed without required approval'
    };
  }
});

/**
 * No Duplicate Step Execution Invariant
 * 
 * Ensures steps are not executed multiple times (unless retry).
 * Prevents redundant work and potential data duplication.
 */
const noDuplicateSteps = createInvariant({
  name: 'noDuplicateSteps',
  description: 'Steps should not be executed multiple times',
  category: 'correctness',
  severity: 'warning',
  check: (context) => {
    const completedSteps = context.completedSteps ?? [];

    // Count occurrences of each step (excluding :skipped suffix)
    const stepCounts = {};
    for (const step of completedSteps) {
      const stepName = step.split(':')[0];
      stepCounts[stepName] = (stepCounts[stepName] || 0) + 1;
    }

    const duplicates = Object.entries(stepCounts)
      .filter(([, count]) => count > 1)
      .map(([step, count]) => `${step} (${count}x)`);

    const passed = duplicates.length === 0;
    return {
      passed,
      message: passed 
        ? null 
        : `Steps executed multiple times: ${duplicates.join(', ')}`
    };
  }
});

/**
 * Failure Has Reason Invariant
 * 
 * Ensures failed workflows have a documented reason.
 */
const failureHasReason = createInvariant({
  name: 'failureHasReason',
  description: 'Failed workflows must have an error reason documented',
  category: 'correctness',
  severity: 'error',
  check: (context, state) => {
    // Only check in failed state
    const isFailed = state === 'failed' || state === 'error';

    if (!isFailed) {
      return { passed: true };
    }

    const hasReason = context.errorReason || 
                      context.failureReason || 
                      context.error;

    return {
      passed: !!hasReason,
      message: hasReason 
        ? null 
        : 'Workflow failed without providing a reason'
    };
  }
});

// Export individual invariants
module.exports = {
  stepOrderMaintained,
  noSkippedRequiredSteps,
  approvalRequired,
  noDuplicateSteps,
  failureHasReason,
  
  // Export as array for easy use with runMBT
  all: [
    stepOrderMaintained,
    noSkippedRequiredSteps,
    approvalRequired,
    failureHasReason
  ]
};
