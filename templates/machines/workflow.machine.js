/**
 * Workflow State Machine Template
 * 
 * A template machine for multi-step workflows with:
 * - Dynamic step generation
 * - Approval gates
 * - Retry logic per step
 * 
 * Customize this template for your specific workflow patterns.
 * 
 * @example
 * // Copy to your test/mbt/machines/ directory and modify
 * const workflowMachine = require('./workflow.machine');
 */

const { createMachine, assign } = require('xstate');

/**
 * Workflow Machine
 * 
 * States:
 * - idle: Waiting to start
 * - step1, step2, step3: Dynamic workflow steps
 * - pendingApproval: Waiting for approval (if required)
 * - completed: Workflow finished successfully
 * - failed: Workflow failed
 */
const workflowMachine = createMachine({
  id: 'workflow',
  
  context: {
    // Current step tracking
    currentStep: null,
    completedSteps: [],
    
    // Step configuration
    steps: ['step1', 'step2', 'step3'],
    requiredSteps: ['step1', 'step2'],
    
    // Retry tracking
    retryCount: {},
    maxRetries: 2,
    
    // Approval configuration
    requireApproval: true,
    approvalReason: null,
    
    // Error handling
    errorReason: null,
    
    // Workflow data
    data: {}
  },

  initial: 'idle',

  states: {
    /**
     * Idle state - waiting to start workflow
     */
    idle: {
      on: { 
        START: {
          target: 'step1',
          actions: assign({
            currentStep: 'step1',
            completedSteps: [],
            retryCount: {},
            errorReason: null,
            data: {}
          })
        }
      }
    },
    
    /**
     * Step 1 - First workflow step
     */
    step1: {
      entry: assign({
        currentStep: 'step1'
      }),
      on: {
        SUCCESS: {
          target: 'step2',
          actions: assign({
            completedSteps: ({ context }) => [...context.completedSteps, 'step1'],
            data: ({ context, event }) => ({
              ...context.data,
              step1Result: event.result
            })
          })
        },
        FAILURE: [
          {
            guard: 'canRetryStep',
            actions: assign({
              retryCount: ({ context }) => ({
                ...context.retryCount,
                step1: (context.retryCount.step1 || 0) + 1
              })
            })
          },
          {
            target: 'failed',
            actions: assign({
              errorReason: ({ event }) => event.reason || 'Step 1 failed after max retries'
            })
          }
        ],
        SKIP: {
          target: 'step2',
          guard: 'canSkipStep',
          actions: assign({
            completedSteps: ({ context }) => [...context.completedSteps, 'step1:skipped']
          })
        }
      }
    },
    
    /**
     * Step 2 - Second workflow step
     */
    step2: {
      entry: assign({
        currentStep: 'step2'
      }),
      on: {
        SUCCESS: {
          target: 'step3',
          actions: assign({
            completedSteps: ({ context }) => [...context.completedSteps, 'step2'],
            data: ({ context, event }) => ({
              ...context.data,
              step2Result: event.result
            })
          })
        },
        FAILURE: [
          {
            guard: 'canRetryStep',
            actions: assign({
              retryCount: ({ context }) => ({
                ...context.retryCount,
                step2: (context.retryCount.step2 || 0) + 1
              })
            })
          },
          {
            target: 'failed',
            actions: assign({
              errorReason: ({ event }) => event.reason || 'Step 2 failed after max retries'
            })
          }
        ],
        SKIP: {
          target: 'step3',
          guard: 'canSkipStep',
          actions: assign({
            completedSteps: ({ context }) => [...context.completedSteps, 'step2:skipped']
          })
        }
      }
    },
    
    /**
     * Step 3 - Third workflow step
     */
    step3: {
      entry: assign({
        currentStep: 'step3'
      }),
      on: {
        SUCCESS: [
          {
            target: 'pendingApproval',
            guard: 'needsApproval',
            actions: assign({
              completedSteps: ({ context }) => [...context.completedSteps, 'step3'],
              data: ({ context, event }) => ({
                ...context.data,
                step3Result: event.result
              })
            })
          },
          {
            target: 'completed',
            actions: assign({
              completedSteps: ({ context }) => [...context.completedSteps, 'step3'],
              data: ({ context, event }) => ({
                ...context.data,
                step3Result: event.result
              })
            })
          }
        ],
        FAILURE: [
          {
            guard: 'canRetryStep',
            actions: assign({
              retryCount: ({ context }) => ({
                ...context.retryCount,
                step3: (context.retryCount.step3 || 0) + 1
              })
            })
          },
          {
            target: 'failed',
            actions: assign({
              errorReason: ({ event }) => event.reason || 'Step 3 failed after max retries'
            })
          }
        ],
        SKIP: [
          {
            target: 'pendingApproval',
            guard: ({ context }) => context.requireApproval,
            actions: assign({
              completedSteps: ({ context }) => [...context.completedSteps, 'step3:skipped']
            })
          },
          {
            target: 'completed',
            actions: assign({
              completedSteps: ({ context }) => [...context.completedSteps, 'step3:skipped']
            })
          }
        ]
      }
    },
    
    /**
     * Pending Approval state - waiting for human approval
     */
    pendingApproval: {
      on: {
        APPROVE: {
          target: 'completed',
          actions: assign({
            approvalReason: ({ event }) => event.reason || 'Approved'
          })
        },
        REJECT: {
          target: 'failed',
          actions: assign({
            errorReason: ({ event }) => event.reason || 'Approval rejected'
          })
        }
      }
    },
    
    /**
     * Completed state - workflow finished successfully
     */
    completed: { 
      type: 'final'
    },
    
    /**
     * Failed state - workflow failed
     */
    failed: { 
      type: 'final'
    }
  }
}, {
  guards: {
    /**
     * Check if current step can be retried
     */
    canRetryStep: ({ context }) => {
      const step = context.currentStep;
      return (context.retryCount[step] || 0) < context.maxRetries;
    },
    
    /**
     * Check if step can be skipped (not required)
     */
    canSkipStep: ({ context }) => {
      const step = context.currentStep;
      return !context.requiredSteps.includes(step);
    },
    
    /**
     * Check if approval is needed
     */
    needsApproval: ({ context }) => context.requireApproval,
    
    /**
     * Check if all required steps completed
     */
    allRequiredStepsCompleted: ({ context }) => {
      return context.requiredSteps.every(step => 
        context.completedSteps.includes(step)
      );
    }
  }
});

module.exports = workflowMachine;
