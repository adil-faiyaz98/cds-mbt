/**
 * Machine Templates
 *
 * Pre-built machine factories for common patterns
 */

const { createMachine, assign } = require('xstate');

/**
 * Create an agent orchestration machine
 * @param {Object} config - Configuration
 * @returns {Object} XState machine
 */
function createAgentMachine(config = {}) {
  const {
    id = 'agentOrchestrator',
    llmBudget = 10,
    maxRetries = 2,
    requiredTools = [],
    additionalStates = {},
    additionalGuards = {},
    additionalActions = {}
  } = config;

  return createMachine({
    id,

    context: {
      llmCallsUsed: 0,
      llmCallsBudget: llmBudget,
      retryCount: {},
      maxRetries,
      requiredTools,
      toolResults: {},
      errorReason: null,
      response: null
    },

    initial: 'idle',

    states: {
      idle: {
        on: {
          START: {
            target: 'planning',
            actions: 'incrementLLMCalls'
          }
        }
      },

      planning: {
        always: [
          { target: 'executing', guard: 'hasBudget' },
          { target: 'escalated', actions: 'setNoBudgetReason' }
        ]
      },

      executing: {
        on: {
          TOOL_SUCCESS: { actions: 'markToolSuccess' },
          TOOL_FAILURE: [
            { guard: 'canRetry', actions: ['incrementRetry', 'incrementLLMCalls'] },
            { target: 'escalated', actions: 'setRetryExhaustedReason' }
          ],
          TOOL_TIMEOUT: [
            { guard: 'canRetry', actions: ['incrementRetry', 'incrementLLMCalls'] },
            { target: 'escalated', actions: 'setTimeoutReason' }
          ],
          SYNTHESIZE: {
            target: 'synthesizing',
            guard: 'allToolsSucceeded'
          },
          ESCALATE: {
            target: 'escalated',
            actions: 'setEscalationReason'
          }
        }
      },

      synthesizing: {
        entry: 'incrementLLMCalls',
        always: [
          { target: 'completed', guard: 'hasBudget' },
          { target: 'escalated', actions: 'setNoBudgetReason' }
        ]
      },

      completed: { type: 'final' },
      escalated: { type: 'final' },

      ...additionalStates
    }
  }, {
    guards: {
      hasBudget: ({ context }) => context.llmCallsUsed < context.llmCallsBudget,

      canRetry: ({ context, event }) => {
        const tool = event?.tool || 'default';
        const currentRetries = context.retryCount[tool] || 0;
        return currentRetries < context.maxRetries &&
               context.llmCallsUsed < context.llmCallsBudget;
      },

      allToolsSucceeded: ({ context }) =>
        context.requiredTools.length === 0 ||
        context.requiredTools.every(tool =>
          context.toolResults[tool] === 'success'
        ),

      ...additionalGuards
    },

    actions: {
      incrementLLMCalls: assign({
        llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
      }),

      markToolSuccess: assign({
        toolResults: ({ context, event }) => ({
          ...context.toolResults,
          [event.tool]: 'success'
        })
      }),

      incrementRetry: assign({
        retryCount: ({ context, event }) => ({
          ...context.retryCount,
          [event.tool]: (context.retryCount[event.tool] || 0) + 1
        })
      }),

      setNoBudgetReason: assign({
        errorReason: 'Budget exhausted'
      }),

      setRetryExhaustedReason: assign({
        errorReason: ({ event }) => `Max retries exceeded for ${event.tool}`
      }),

      setTimeoutReason: assign({
        errorReason: ({ event }) => `Timeout for ${event.tool}`
      }),

      setEscalationReason: assign({
        errorReason: ({ event }) => event.reason || 'Manual escalation'
      }),

      ...additionalActions
    }
  });
}

/**
 * Create a workflow machine
 * @param {Object} config - Configuration
 * @returns {Object} XState machine
 */
function createWorkflowMachine(config = {}) {
  const {
    id = 'workflow',
    steps = ['step1', 'step2', 'step3'],
    maxRetries = 2,
    requireApproval = false
  } = config;

  const states = {
    idle: {
      on: { START: steps[0] || 'completed' }
    }
  };

  // Generate step states
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nextStep = steps[i + 1];

    states[step] = {
      on: {
        SUCCESS: {
          target: nextStep || (requireApproval ? 'pendingApproval' : 'completed')
        },
        FAILURE: [
          { guard: 'canRetry', actions: 'incrementRetry' },
          { target: 'failed', actions: 'setFailureReason' }
        ],
        SKIP: {
          target: nextStep || 'completed'
        }
      }
    };
  }

  if (requireApproval) {
    states.pendingApproval = {
      on: {
        APPROVE: 'completed',
        REJECT: {
          target: 'failed',
          actions: 'setRejectionReason'
        }
      }
    };
  }

  states.completed = { type: 'final' };
  states.failed = { type: 'final' };

  return createMachine({
    id,

    context: {
      currentStep: null,
      retryCount: {},
      maxRetries,
      errorReason: null,
      completedSteps: []
    },

    initial: 'idle',
    states
  }, {
    guards: {
      canRetry: ({ context }) => {
        const step = context.currentStep;
        return (context.retryCount[step] || 0) < context.maxRetries;
      }
    },
    actions: {
      incrementRetry: assign({
        retryCount: ({ context }) => ({
          ...context.retryCount,
          [context.currentStep]: (context.retryCount[context.currentStep] || 0) + 1
        })
      }),
      setFailureReason: assign({
        errorReason: ({ event }) => event.reason || 'Step failed'
      }),
      setRejectionReason: assign({
        errorReason: 'Approval rejected'
      })
    }
  });
}

/**
 * Create a migration machine
 * @param {Object} config - Configuration
 * @returns {Object} XState machine
 */
function createMigrationMachine(config = {}) {
  const {
    id = 'migration',
    batchSize = 1000,
    requireVerification = true
  } = config;

  return createMachine({
    id,

    context: {
      sourceCount: 0,
      targetCount: 0,
      processedCount: 0,
      batchSize,
      rollbackData: null,
      errorReason: null,
      isCommitted: false
    },

    initial: 'idle',

    states: {
      idle: {
        on: {
          START: 'extracting'
        }
      },

      extracting: {
        on: {
          BATCH_READY: {
            target: 'transforming',
            actions: 'storeRollbackData'
          },
          EXTRACT_COMPLETE: {
            target: requireVerification ? 'verifying' : 'committing'
          },
          EXTRACT_FAILURE: {
            target: 'failed',
            actions: 'setExtractError'
          }
        }
      },

      transforming: {
        on: {
          TRANSFORM_SUCCESS: 'loading',
          TRANSFORM_FAILURE: {
            target: 'rollingBack',
            actions: 'setTransformError'
          }
        }
      },

      loading: {
        on: {
          LOAD_SUCCESS: {
            target: 'extracting',
            actions: 'incrementProcessed'
          },
          LOAD_FAILURE: {
            target: 'rollingBack',
            actions: 'setLoadError'
          }
        }
      },

      verifying: {
        on: {
          VERIFY_SUCCESS: 'committing',
          VERIFY_FAILURE: {
            target: 'rollingBack',
            actions: 'setVerifyError'
          }
        }
      },

      committing: {
        entry: 'markCommitted',
        on: {
          COMMIT_SUCCESS: 'completed',
          COMMIT_FAILURE: {
            target: 'rollingBack',
            actions: 'setCommitError'
          }
        }
      },

      rollingBack: {
        on: {
          ROLLBACK_SUCCESS: 'failed',
          ROLLBACK_FAILURE: 'failed'
        }
      },

      completed: { type: 'final' },
      failed: { type: 'final' }
    }
  }, {
    actions: {
      storeRollbackData: assign({
        rollbackData: ({ context }) => ({
          timestamp: Date.now(),
          processedCount: context.processedCount
        })
      }),
      incrementProcessed: assign({
        processedCount: ({ context }) => context.processedCount + context.batchSize,
        targetCount: ({ context }) => context.targetCount + context.batchSize
      }),
      markCommitted: assign({
        isCommitted: true,
        rollbackData: null
      }),
      setExtractError: assign({
        errorReason: ({ event }) => event.reason || 'Extract failed'
      }),
      setTransformError: assign({
        errorReason: ({ event }) => event.reason || 'Transform failed'
      }),
      setLoadError: assign({
        errorReason: ({ event }) => event.reason || 'Load failed'
      }),
      setVerifyError: assign({
        errorReason: ({ event }) => event.reason || 'Verification failed'
      }),
      setCommitError: assign({
        errorReason: ({ event }) => event.reason || 'Commit failed'
      })
    }
  });
}

module.exports = {
  createAgentMachine,
  createWorkflowMachine,
  createMigrationMachine
};
