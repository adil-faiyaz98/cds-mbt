/**
 * Agent Orchestrator State Machine Template
 * 
 * A template machine for AI agent orchestration with:
 * - LLM budget tracking
 * - Tool execution with retry logic
 * - Escalation handling
 * 
 * Customize this template for your specific agent patterns.
 * 
 * @example
 * // Copy to your test/mbt/machines/ directory and modify
 * const agentMachine = require('./agent-orchestrator.machine');
 */

const { createMachine, assign } = require('xstate');

/**
 * Agent Orchestrator Machine
 * 
 * States:
 * - idle: Waiting for task
 * - planning: LLM call to plan task execution
 * - executing: Running tools
 * - synthesizing: LLM call to synthesize results
 * - completed: Task finished successfully
 * - escalated: Task requires human intervention
 */
const agentOrchestratorMachine = createMachine({
  id: 'agentOrchestrator',
  
  context: {
    // LLM budget tracking
    llmCallsUsed: 0,
    llmCallsBudget: 10,
    
    // Retry tracking
    retryCount: {},
    maxRetries: 2,
    
    // Tool tracking
    requiredTools: ['tool1', 'tool2'],
    toolResults: {},
    
    // Error handling
    errorReason: null,
    
    // Response data
    response: null
  },

  initial: 'idle',

  states: {
    /**
     * Idle state - waiting for a task
     */
    idle: {
      on: { 
        START: {
          target: 'planning',
          actions: assign({
            llmCallsUsed: ({ context }) => context.llmCallsUsed + 1,
            // Reset state for new task
            toolResults: {},
            retryCount: {},
            errorReason: null,
            response: null
          })
        }
      }
    },
    
    /**
     * Planning state - LLM determines execution strategy
     */
    planning: {
      on: {
        PLAN_READY: {
          target: 'executing',
          guard: 'hasBudget'
        },
        PLAN_FAILURE: [
          {
            target: 'planning',
            guard: 'canRetryPlanning',
            actions: assign({
              llmCallsUsed: ({ context }) => context.llmCallsUsed + 1,
              retryCount: ({ context }) => ({
                ...context.retryCount,
                planning: (context.retryCount.planning || 0) + 1
              })
            })
          },
          {
            target: 'escalated',
            actions: assign({
              errorReason: 'Planning failed after max retries'
            })
          }
        ],
        NO_BUDGET: {
          target: 'escalated',
          actions: assign({
            errorReason: 'Budget exhausted during planning'
          })
        }
      }
    },
    
    /**
     * Executing state - running tools
     */
    executing: {
      on: {
        TOOL_SUCCESS: {
          actions: assign({
            toolResults: ({ context, event }) => ({
              ...context.toolResults,
              [event.tool]: 'success'
            })
          })
        },
        
        TOOL_FAILURE: [
          {
            guard: 'canRetryTool',
            actions: assign({
              retryCount: ({ context, event }) => ({
                ...context.retryCount,
                [event.tool]: (context.retryCount[event.tool] || 0) + 1
              }),
              llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
            })
          },
          {
            target: 'escalated',
            actions: assign({
              errorReason: ({ event }) => `Tool ${event.tool} failed after max retries`
            })
          }
        ],
        
        TOOL_TIMEOUT: [
          {
            guard: 'canRetryTool',
            actions: assign({
              retryCount: ({ context, event }) => ({
                ...context.retryCount,
                [event.tool]: (context.retryCount[event.tool] || 0) + 1
              }),
              llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
            })
          },
          {
            target: 'escalated',
            actions: assign({
              errorReason: ({ event }) => `Tool ${event.tool} timed out after max retries`
            })
          }
        ],
        
        ALL_TOOLS_DONE: {
          target: 'synthesizing',
          guard: 'allToolsSucceeded',
          actions: assign({
            llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
          })
        },
        
        ESCALATE: {
          target: 'escalated',
          actions: assign({
            errorReason: ({ event }) => event.reason || 'Manual escalation requested'
          })
        }
      }
    },
    
    /**
     * Synthesizing state - LLM combines results
     */
    synthesizing: {
      on: {
        SYNTHESIS_COMPLETE: {
          target: 'completed',
          guard: 'hasBudget',
          actions: assign({
            response: ({ event }) => event.response
          })
        },
        SYNTHESIS_FAILURE: [
          {
            target: 'synthesizing',
            guard: 'canRetrySynthesis',
            actions: assign({
              llmCallsUsed: ({ context }) => context.llmCallsUsed + 1,
              retryCount: ({ context }) => ({
                ...context.retryCount,
                synthesis: (context.retryCount.synthesis || 0) + 1
              })
            })
          },
          {
            target: 'escalated',
            actions: assign({
              errorReason: 'Synthesis failed after max retries'
            })
          }
        ],
        NO_BUDGET: {
          target: 'escalated',
          actions: assign({
            errorReason: 'Budget exhausted during synthesis'
          })
        }
      }
    },
    
    /**
     * Completed state - task finished successfully
     */
    completed: { 
      type: 'final',
      entry: ({ context }) => {
        // Final state entry - response is available in context.response
      }
    },
    
    /**
     * Escalated state - requires human intervention
     */
    escalated: { 
      type: 'final',
      entry: ({ context }) => {
        // Final state entry - error reason is available in context.errorReason
      }
    }
  }
}, {
  guards: {
    /**
     * Check if LLM budget is available
     */
    hasBudget: ({ context }) => context.llmCallsUsed < context.llmCallsBudget,
    
    /**
     * Check if planning can be retried
     */
    canRetryPlanning: ({ context }) => {
      const planningRetries = context.retryCount.planning || 0;
      return planningRetries < context.maxRetries && 
             context.llmCallsUsed < context.llmCallsBudget;
    },
    
    /**
     * Check if a tool can be retried
     */
    canRetryTool: ({ context, event }) => {
      const tool = event?.tool || 'unknown';
      const currentRetries = context.retryCount[tool] || 0;
      return currentRetries < context.maxRetries && 
             context.llmCallsUsed < context.llmCallsBudget;
    },
    
    /**
     * Check if synthesis can be retried
     */
    canRetrySynthesis: ({ context }) => {
      const synthesisRetries = context.retryCount.synthesis || 0;
      return synthesisRetries < context.maxRetries && 
             context.llmCallsUsed < context.llmCallsBudget;
    },
    
    /**
     * Check if all required tools succeeded
     */
    allToolsSucceeded: ({ context }) => 
      context.requiredTools.length === 0 ||
      context.requiredTools.every(tool => 
        context.toolResults[tool] === 'success'
      )
  }
});

module.exports = agentOrchestratorMachine;
