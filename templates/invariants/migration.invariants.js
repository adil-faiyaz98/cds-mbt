/**
 * Migration Invariants Template
 * 
 * Template invariants for data migration testing.
 * These ensure data consistency, rollback availability,
 * and no partial commits during migration.
 * 
 * @example
 * // Copy to your test/mbt/invariants/ directory and customize
 * const migrationInvariants = require('./migration.invariants');
 */

const { createInvariant } = require('cds-mbt');

/**
 * Data Consistent Invariant
 * 
 * Ensures source and target record counts match (unless rolling back).
 * Critical for data integrity during migration.
 */
const dataConsistent = createInvariant({
  name: 'dataConsistent',
  description: 'Source and target record counts must match (unless rolling back)',
  category: 'data-integrity',
  severity: 'error',
  check: (context, state) => {
    // Skip check during rollback
    const isRollingBack = state === 'rollingBack' || 
                          state === 'rollback' ||
                          context.isRollingBack;

    if (isRollingBack) {
      return { passed: true, skipped: true, message: 'Skipped during rollback' };
    }

    // Skip if not yet processing
    const hasStarted = (context.sourceCount ?? 0) > 0 || (context.processedCount ?? 0) > 0;
    if (!hasStarted) {
      return { passed: true };
    }

    // Only enforce in completed state for strict check
    const isCompleted = state === 'completed' || state === 'done';
    if (!isCompleted) {
      // During processing, target might be behind source - that's okay
      const targetNotExceedingSource = (context.targetCount ?? 0) <= (context.sourceCount ?? 0);
      return {
        passed: targetNotExceedingSource,
        message: targetNotExceedingSource 
          ? null 
          : `Target count (${context.targetCount}) exceeds source count (${context.sourceCount})`
      };
    }

    // In completed state, counts must match exactly
    const sourceCount = context.sourceCount ?? 0;
    const targetCount = context.targetCount ?? 0;
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
 * Rollback Available Invariant
 * 
 * Ensures rollback data is available until commit.
 * Critical for recovery from failed migrations.
 */
const rollbackAvailable = createInvariant({
  name: 'rollbackAvailable',
  description: 'Rollback must be possible until committed',
  category: 'data-integrity',
  severity: 'error',
  check: (context, state) => {
    // After commit, rollback data can be cleared
    const isCommitted = state === 'committed' || 
                        state === 'completed' || 
                        context.isCommitted;

    if (isCommitted) {
      return { passed: true };
    }

    // In failed state, rollback data might have been used
    const isFailed = state === 'failed' || state === 'error';
    if (isFailed) {
      return { passed: true };
    }

    // Only enforce if we've started processing
    const hasStarted = (context.processedCount ?? 0) > 0 || 
                       (context.currentBatch ?? 0) > 0;

    if (!hasStarted) {
      return { passed: true };
    }

    const hasRollbackData = context.rollbackData !== null && 
                            context.rollbackData !== undefined;

    return {
      passed: hasRollbackData,
      message: hasRollbackData 
        ? null 
        : 'No rollback data available before commit'
    };
  }
});

/**
 * No Partial Commit Invariant
 * 
 * Ensures migrations either fully commit or fully rollback.
 * Prevents data corruption from partial migrations.
 */
const noPartialCommit = createInvariant({
  name: 'noPartialCommit',
  description: 'Migration must fully commit or fully rollback - no partial state',
  category: 'data-integrity',
  severity: 'error',
  check: (context, state) => {
    // Only check in final states
    const isFinal = state === 'completed' || 
                    state === 'failed' || 
                    state === 'done';

    if (!isFinal) {
      return { passed: true };
    }

    const isCommitted = context.isCommitted === true;
    const sourceCount = context.sourceCount ?? 0;
    const targetCount = context.targetCount ?? 0;

    // If committed, all data should be migrated
    if (isCommitted) {
      const passed = sourceCount === targetCount;
      return {
        passed,
        message: passed 
          ? null 
          : `Partial commit detected: ${targetCount}/${sourceCount} records migrated`
      };
    }

    // If failed and not committed, target should be empty or rolled back
    if (state === 'failed') {
      // After rollback, target count should be 0 or match a clean state
      const isCleanState = targetCount === 0 || targetCount === sourceCount;
      return {
        passed: isCleanState,
        message: isCleanState 
          ? null 
          : `Partial migration in failed state: ${targetCount} orphaned records`
      };
    }

    return { passed: true };
  }
});

/**
 * Batch Size Respected Invariant
 * 
 * Ensures batches don't exceed the configured size.
 * Prevents memory issues and ensures predictable processing.
 */
const batchSizeRespected = createInvariant({
  name: 'batchSizeRespected',
  description: 'Batch processing must not exceed configured batch size',
  category: 'resource',
  severity: 'warning',
  check: (context) => {
    const batchSize = context.batchSize ?? Infinity;
    const processedCount = context.processedCount ?? 0;
    const currentBatch = context.currentBatch ?? 0;

    if (batchSize === Infinity || currentBatch === 0) {
      return { passed: true };
    }

    // Check if any batch exceeded the size
    // This is a heuristic - actual batch tracking would need more context
    const expectedMaxProcessed = currentBatch * batchSize;
    const passed = processedCount <= expectedMaxProcessed;

    return {
      passed,
      message: passed 
        ? null 
        : `Processed (${processedCount}) exceeds expected for ${currentBatch} batches of ${batchSize}`
    };
  }
});

/**
 * Migration Timeout Invariant
 * 
 * Ensures migration completes within expected time.
 */
const migrationTimeout = createInvariant({
  name: 'migrationTimeout',
  description: 'Migration must complete within timeout',
  category: 'resource',
  severity: 'warning',
  check: (context) => {
    const startTime = context.startTime;
    const timeout = context.timeout ?? context.maxDuration ?? Infinity;

    if (!startTime || timeout === Infinity) {
      return { passed: true, skipped: true };
    }

    const elapsed = Date.now() - startTime;
    const passed = elapsed <= timeout;

    return {
      passed,
      message: passed 
        ? null 
        : `Migration timeout: ${elapsed}ms exceeds ${timeout}ms`
    };
  }
});

/**
 * Failure Has Reason Invariant
 * 
 * Ensures failed migrations have documented reasons.
 */
const failureHasReason = createInvariant({
  name: 'failureHasReason',
  description: 'Failed migrations must have an error reason documented',
  category: 'correctness',
  severity: 'error',
  check: (context, state) => {
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
        : 'Migration failed without providing a reason'
    };
  }
});

// Export individual invariants
module.exports = {
  dataConsistent,
  rollbackAvailable,
  noPartialCommit,
  batchSizeRespected,
  migrationTimeout,
  failureHasReason,
  
  // Export as array for easy use with runMBT
  all: [
    dataConsistent,
    rollbackAvailable,
    noPartialCommit,
    failureHasReason
  ]
};
