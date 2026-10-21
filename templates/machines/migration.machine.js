/**
 * Migration State Machine Template
 * 
 * A template machine for data migration workflows with:
 * - ETL (Extract, Transform, Load) pattern
 * - Batch processing
 * - Verification and rollback support
 * 
 * Customize this template for your specific migration patterns.
 * 
 * @example
 * // Copy to your test/mbt/machines/ directory and modify
 * const migrationMachine = require('./migration.machine');
 */

const { createMachine, assign } = require('xstate');

/**
 * Migration Machine
 * 
 * States:
 * - idle: Waiting to start
 * - extracting: Reading source data
 * - transforming: Converting data format
 * - loading: Writing to target
 * - verifying: Checking data integrity
 * - committing: Finalizing the migration
 * - rollingBack: Reverting changes on failure
 * - completed: Migration finished successfully
 * - failed: Migration failed
 */
const migrationMachine = createMachine({
  id: 'migration',
  
  context: {
    // Record counts
    sourceCount: 0,
    targetCount: 0,
    processedCount: 0,
    
    // Batch configuration
    batchSize: 1000,
    currentBatch: 0,
    totalBatches: 0,
    
    // Rollback data
    rollbackData: null,
    
    // State flags
    isCommitted: false,
    requireVerification: true,
    
    // Error handling
    errorReason: null,
    
    // Migration metadata
    startTime: null,
    endTime: null
  },

  initial: 'idle',

  states: {
    /**
     * Idle state - waiting to start migration
     */
    idle: {
      on: { 
        START: {
          target: 'extracting',
          actions: assign({
            sourceCount: 0,
            targetCount: 0,
            processedCount: 0,
            currentBatch: 0,
            rollbackData: null,
            isCommitted: false,
            errorReason: null,
            startTime: () => Date.now()
          })
        }
      }
    },
    
    /**
     * Extracting state - reading source data
     */
    extracting: {
      on: {
        BATCH_READY: {
          target: 'transforming',
          actions: assign({
            currentBatch: ({ context }) => context.currentBatch + 1,
            sourceCount: ({ context, event }) => context.sourceCount + (event.count || context.batchSize),
            rollbackData: ({ context, event }) => ({
              timestamp: Date.now(),
              batchNumber: context.currentBatch + 1,
              records: event.records || [],
              previousState: context.rollbackData
            })
          })
        },
        EXTRACT_COMPLETE: [
          {
            target: 'verifying',
            guard: 'requiresVerification'
          },
          {
            target: 'committing'
          }
        ],
        EXTRACT_FAILURE: {
          target: 'failed',
          actions: assign({
            errorReason: ({ event }) => event.reason || 'Extract failed'
          })
        }
      }
    },
    
    /**
     * Transforming state - converting data format
     */
    transforming: {
      on: {
        TRANSFORM_SUCCESS: {
          target: 'loading',
          actions: assign({
            // Track transformation metadata if needed
          })
        },
        TRANSFORM_FAILURE: {
          target: 'rollingBack',
          actions: assign({
            errorReason: ({ event }) => event.reason || 'Transform failed'
          })
        }
      }
    },
    
    /**
     * Loading state - writing to target
     */
    loading: {
      on: {
        LOAD_SUCCESS: {
          target: 'extracting',
          actions: assign({
            processedCount: ({ context }) => context.processedCount + context.batchSize,
            targetCount: ({ context }) => context.targetCount + context.batchSize
          })
        },
        LOAD_FAILURE: {
          target: 'rollingBack',
          actions: assign({
            errorReason: ({ event }) => event.reason || 'Load failed'
          })
        }
      }
    },
    
    /**
     * Verifying state - checking data integrity
     */
    verifying: {
      on: {
        VERIFY_SUCCESS: {
          target: 'committing'
        },
        VERIFY_FAILURE: {
          target: 'rollingBack',
          actions: assign({
            errorReason: ({ event }) => event.reason || 'Verification failed - data inconsistency detected'
          })
        }
      }
    },
    
    /**
     * Committing state - finalizing the migration
     */
    committing: {
      entry: assign({
        isCommitted: true,
        rollbackData: null // Clear rollback data after commit
      }),
      on: {
        COMMIT_SUCCESS: {
          target: 'completed',
          actions: assign({
            endTime: () => Date.now()
          })
        },
        COMMIT_FAILURE: {
          target: 'rollingBack',
          actions: assign({
            isCommitted: false, // Revert commit flag
            errorReason: ({ event }) => event.reason || 'Commit failed'
          })
        }
      }
    },
    
    /**
     * Rolling Back state - reverting changes on failure
     */
    rollingBack: {
      on: {
        ROLLBACK_SUCCESS: {
          target: 'failed',
          actions: assign({
            targetCount: 0,
            processedCount: 0,
            rollbackData: null,
            endTime: () => Date.now()
          })
        },
        ROLLBACK_FAILURE: {
          target: 'failed',
          actions: assign({
            errorReason: ({ context, event }) => 
              `${context.errorReason}; Rollback also failed: ${event.reason || 'Unknown rollback error'}`,
            endTime: () => Date.now()
          })
        }
      }
    },
    
    /**
     * Completed state - migration finished successfully
     */
    completed: { 
      type: 'final'
    },
    
    /**
     * Failed state - migration failed
     */
    failed: { 
      type: 'final'
    }
  }
}, {
  guards: {
    /**
     * Check if verification is required
     */
    requiresVerification: ({ context }) => context.requireVerification,
    
    /**
     * Check if there are more batches to process
     */
    hasMoreBatches: ({ context }) => 
      context.totalBatches === 0 || context.currentBatch < context.totalBatches,
    
    /**
     * Check if rollback is possible
     */
    canRollback: ({ context }) => 
      !context.isCommitted && context.rollbackData !== null,
    
    /**
     * Check if data counts match
     */
    countsMatch: ({ context }) => 
      context.sourceCount === context.targetCount
  }
});

module.exports = migrationMachine;
