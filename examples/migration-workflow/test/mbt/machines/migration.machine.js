/**
 * Migration Workflow State Machine
 * 
 * Models the ETL (Extract-Transform-Load) migration workflow with:
 * - Sequential processing phases
 * - Rollback capability at any point before commit
 * - Verification step before finalization
 * - Proper error handling and recovery paths
 * 
 * This machine is used with cds-mbt to verify that the migration
 * workflow cannot leave data in an inconsistent state.
 */

const { createMachine, assign } = require('xstate');

/**
 * Migration workflow state machine
 * 
 * States:
 * - idle: Initial state, waiting for migration to start
 * - extracting: Reading data from source system
 * - transforming: Converting data to target format
 * - loading: Writing data to target system
 * - verifying: Checking data consistency
 * - committing: Making changes permanent
 * - rollingBack: Reverting changes
 * - completed: Successfully finished
 * - failed: Migration failed (with documented reason)
 */
const migrationMachine = createMachine({
  id: 'migration',
  
  context: {
    // Source data tracking
    sourceCount: 0,
    sourceRecords: [],
    
    // Target data tracking
    targetCount: 0,
    targetIds: [],
    
    // Processing state
    processedCount: 0,
    batchSize: 100,
    
    // Rollback support
    rollbackData: null,
    canRollback: false,
    
    // Commit state
    isCommitted: false,
    
    // Error tracking
    errorReason: null
  },

  initial: 'idle',

  states: {
    /**
     * Idle state - waiting for migration to start
     */
    idle: {
      on: {
        START: {
          target: 'extracting',
          actions: 'initializeMigration'
        }
      }
    },

    /**
     * Extracting - reading source data
     */
    extracting: {
      on: {
        BATCH_READY: {
          target: 'transforming',
          actions: 'storeSourceBatch'
        },
        EXTRACT_COMPLETE: {
          target: 'verifying',
          guard: 'hasProcessedData'
        },
        NO_DATA: {
          target: 'completed',
          actions: 'setNoDataMessage'
        },
        EXTRACT_FAILURE: {
          target: 'failed',
          actions: 'setExtractError'
        }
      }
    },

    /**
     * Transforming - converting data format
     */
    transforming: {
      entry: 'initRollbackData',
      on: {
        TRANSFORM_SUCCESS: 'loading',
        TRANSFORM_FAILURE: {
          target: 'rollingBack',
          actions: 'setTransformError'
        }
      }
    },

    /**
     * Loading - inserting into target system
     */
    loading: {
      on: {
        LOAD_SUCCESS: {
          target: 'extracting',
          actions: 'recordLoadedBatch'
        },
        LOAD_FAILURE: {
          target: 'rollingBack',
          actions: 'setLoadError'
        }
      }
    },

    /**
     * Verifying - checking data consistency
     */
    verifying: {
      on: {
        VERIFY_SUCCESS: 'committing',
        VERIFY_FAILURE: {
          target: 'rollingBack',
          actions: 'setVerifyError'
        },
        REQUEST_ROLLBACK: {
          target: 'rollingBack',
          actions: 'setUserRequestedRollback'
        }
      }
    },

    /**
     * Committing - finalizing the migration
     */
    committing: {
      entry: 'prepareCommit',
      on: {
        COMMIT_SUCCESS: {
          target: 'completed',
          actions: 'finalizeCommit'
        },
        COMMIT_FAILURE: {
          target: 'rollingBack',
          actions: 'setCommitError'
        }
      }
    },

    /**
     * Rolling back - reverting changes
     */
    rollingBack: {
      entry: 'markRollingBack',
      on: {
        ROLLBACK_SUCCESS: {
          target: 'failed',
          actions: 'clearRollbackData'
        },
        ROLLBACK_FAILURE: {
          target: 'failed',
          actions: 'setRollbackError'
        }
      }
    },

    /**
     * Completed - migration finished successfully
     */
    completed: {
      type: 'final'
    },

    /**
     * Failed - migration failed with documented reason
     */
    failed: {
      type: 'final'
    }
  }
}, {
  guards: {
    /**
     * Check if any data has been processed
     */
    hasProcessedData: ({ context }) => context.processedCount > 0,
    
    /**
     * Check if rollback is still possible
     */
    canRollback: ({ context }) => !context.isCommitted && context.rollbackData !== null
  },

  actions: {
    /**
     * Initialize migration context
     */
    initializeMigration: assign({
      sourceCount: 0,
      targetCount: 0,
      processedCount: 0,
      rollbackData: null,
      canRollback: false,
      isCommitted: false,
      errorReason: null
    }),

    /**
     * Store source batch data
     */
    storeSourceBatch: assign({
      sourceCount: ({ context, event }) => context.sourceCount + (event.count || 0),
      sourceRecords: ({ context, event }) => [...context.sourceRecords, ...(event.records || [])]
    }),

    /**
     * Initialize rollback data before transformation
     */
    initRollbackData: assign({
      rollbackData: ({ context }) => ({
        timestamp: Date.now(),
        sourceCount: context.sourceCount,
        sourceRecords: [...context.sourceRecords]
      }),
      canRollback: true
    }),

    /**
     * Record successfully loaded batch
     */
    recordLoadedBatch: assign({
      targetCount: ({ context, event }) => context.targetCount + (event.count || context.batchSize),
      targetIds: ({ context, event }) => [...context.targetIds, ...(event.ids || [])],
      processedCount: ({ context, event }) => context.processedCount + (event.count || context.batchSize),
      rollbackData: ({ context, event }) => ({
        ...context.rollbackData,
        targetIds: [...(context.rollbackData?.targetIds || []), ...(event.ids || [])]
      })
    }),

    /**
     * Prepare for commit
     */
    prepareCommit: assign({
      canRollback: false
    }),

    /**
     * Finalize the commit
     */
    finalizeCommit: assign({
      isCommitted: true,
      rollbackData: null,
      canRollback: false
    }),

    /**
     * Mark rollback in progress
     */
    markRollingBack: assign({
      canRollback: false
    }),

    /**
     * Clear rollback data after successful rollback
     */
    clearRollbackData: assign({
      rollbackData: null,
      targetCount: 0,
      targetIds: []
    }),

    /**
     * Set message for no data scenario
     */
    setNoDataMessage: assign({
      errorReason: 'No source data to migrate'
    }),

    /**
     * Error setters
     */
    setExtractError: assign({
      errorReason: ({ event }) => event.reason || 'Extract phase failed'
    }),

    setTransformError: assign({
      errorReason: ({ event }) => event.reason || 'Transform phase failed'
    }),

    setLoadError: assign({
      errorReason: ({ event }) => event.reason || 'Load phase failed'
    }),

    setVerifyError: assign({
      errorReason: ({ event }) => event.reason || 'Verification failed - data inconsistent'
    }),

    setCommitError: assign({
      errorReason: ({ event }) => event.reason || 'Commit failed'
    }),

    setRollbackError: assign({
      errorReason: ({ context, event }) => 
        `Rollback failed: ${event.reason || 'Unknown error'}. Original error: ${context.errorReason}`
    }),

    setUserRequestedRollback: assign({
      errorReason: 'Rollback requested by user'
    })
  }
});

module.exports = {
  migrationMachine
};
