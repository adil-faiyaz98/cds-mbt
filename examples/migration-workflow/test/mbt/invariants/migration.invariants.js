/**
 * Migration Workflow Invariants
 * 
 * Custom invariants for verifying data migration safety:
 * - dataConsistent: Source and target counts must match (except during rollback)
 * - rollbackAvailable: Rollback must be possible until committed
 * - noPartialCommit: Either all data is committed or none
 * - errorDocumented: Failed states must have error reason
 */

const { createInvariant } = require('cds-mbt');

/**
 * Data Consistent Invariant
 * 
 * Ensures that the number of records in source matches target
 * when migration is in a stable state (not during active processing).
 * 
 * During rollback, counts are expected to diverge temporarily.
 */
const dataConsistent = createInvariant({
  name: 'dataConsistent',
  description: 'Source and target record counts must match in stable states',
  category: 'data-integrity',
  severity: 'error',
  
  check: (context, state) => {
    // Skip check during transitional states
    const transitionalStates = ['extracting', 'transforming', 'loading', 'rollingBack'];
    if (transitionalStates.includes(state)) {
      return { passed: true, skipped: true };
    }
    
    // In completed state, counts should match
    if (state === 'completed' && context.processedCount > 0) {
      const sourceCount = context.sourceCount ?? 0;
      const targetCount = context.targetCount ?? 0;
      
      const passed = sourceCount === targetCount;
      return {
        passed,
        message: passed
          ? null
          : `Data inconsistency after completion: source (${sourceCount}) != target (${targetCount})`
      };
    }
    
    // In failed state after rollback, target should be empty
    if (state === 'failed' && context.rollbackData === null) {
      const targetCount = context.targetCount ?? 0;
      return {
        passed: targetCount === 0,
        message: targetCount === 0
          ? null
          : `Target data remains after rollback: ${targetCount} records`
      };
    }
    
    return { passed: true };
  }
});

/**
 * Rollback Available Invariant
 * 
 * Ensures that rollback is possible for any uncommitted migration
 * that has processed data. This is critical for data safety.
 */
const rollbackAvailable = createInvariant({
  name: 'rollbackAvailable',
  description: 'Rollback must be possible until migration is committed',
  category: 'data-integrity',
  severity: 'error',
  
  check: (context, state) => {
    // Skip if committed or failed (final states)
    if (state === 'completed' && context.isCommitted) {
      return { passed: true };
    }
    
    if (state === 'failed') {
      return { passed: true };
    }
    
    if (state === 'idle') {
      return { passed: true };
    }
    
    // If we have processed data, rollback data must exist
    if (context.processedCount > 0 && !context.isCommitted) {
      const hasRollbackData = context.rollbackData !== null;
      
      // Exception: committing state is allowed to not have rollback
      // because commit is about to finalize
      if (state === 'committing') {
        return { passed: true };
      }
      
      return {
        passed: hasRollbackData,
        message: hasRollbackData
          ? null
          : `No rollback data available with ${context.processedCount} processed records`
      };
    }
    
    return { passed: true };
  }
});

/**
 * No Partial Commit Invariant
 * 
 * Ensures that commit is atomic - either all migrated records
 * are in committed state, or none are.
 */
const noPartialCommit = createInvariant({
  name: 'noPartialCommit',
  description: 'Commit must be atomic - all or nothing',
  category: 'data-integrity',
  severity: 'error',
  
  check: (context, state) => {
    // Only check in completed state
    if (state !== 'completed') {
      return { passed: true };
    }
    
    // If committed, all processed records should be in target
    if (context.isCommitted) {
      const processedCount = context.processedCount ?? 0;
      const targetCount = context.targetCount ?? 0;
      
      const passed = processedCount === targetCount;
      return {
        passed,
        message: passed
          ? null
          : `Partial commit detected: processed (${processedCount}) != target (${targetCount})`
      };
    }
    
    // If not committed but completed (no data scenario), should be ok
    if (context.processedCount === 0) {
      return { passed: true };
    }
    
    return { passed: true };
  }
});

/**
 * Error Documented Invariant
 * 
 * Ensures that any failure state has a documented error reason.
 * This is essential for debugging and audit trails.
 */
const errorDocumented = createInvariant({
  name: 'errorDocumented',
  description: 'Failed states must have documented error reason',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    // Only check failed state
    if (state !== 'failed') {
      return { passed: true };
    }
    
    const hasReason = context.errorReason !== null && 
                      context.errorReason !== undefined &&
                      context.errorReason !== '';
    
    return {
      passed: hasReason,
      message: hasReason
        ? null
        : 'Migration failed without documented error reason'
    };
  }
});

/**
 * Counts Non-Negative Invariant
 * 
 * Basic sanity check that all count fields are non-negative.
 */
const countsNonNegative = createInvariant({
  name: 'countsNonNegative',
  description: 'All count fields must be non-negative',
  category: 'correctness',
  severity: 'error',
  
  check: (context) => {
    const counts = [
      { name: 'sourceCount', value: context.sourceCount ?? 0 },
      { name: 'targetCount', value: context.targetCount ?? 0 },
      { name: 'processedCount', value: context.processedCount ?? 0 }
    ];
    
    const negative = counts.filter(c => c.value < 0);
    const passed = negative.length === 0;
    
    return {
      passed,
      message: passed
        ? null
        : `Negative counts: ${negative.map(c => `${c.name}=${c.value}`).join(', ')}`
    };
  }
});

module.exports = {
  dataConsistent,
  rollbackAvailable,
  noPartialCommit,
  errorDocumented,
  countsNonNegative,
  
  // All migration invariants as array
  all: [
    dataConsistent,
    rollbackAvailable,
    noPartialCommit,
    errorDocumented,
    countsNonNegative
  ]
};
