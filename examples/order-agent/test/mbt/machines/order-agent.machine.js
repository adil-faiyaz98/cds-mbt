/**
 * Order Agent State Machine
 * 
 * Models an e-commerce order processing agent using the ReAct pattern:
 * - Reason: Analyze situation and plan
 * - Act: Execute tool calls
 * - Observe: Process results
 * 
 * The machine tracks:
 * - LLM call budget
 * - Tool call results
 * - Retry counts
 * - Order processing state
 */

const { createMachine, assign } = require('xstate');

/**
 * Order processing agent state machine
 * 
 * States:
 * - idle: Waiting for order request
 * - reasoning: Planning next action (uses LLM budget)
 * - checkingInventory: Tool call to verify stock
 * - validatingCredit: Tool call to check customer credit
 * - processingPayment: Tool call to process payment
 * - reservingInventory: Tool call to reserve stock
 * - synthesizing: Final response generation
 * - completed: Order successfully processed
 * - escalated: Requires human intervention
 */
const orderAgentMachine = createMachine({
  id: 'orderAgent',
  
  context: {
    // LLM budget tracking
    llmCallsUsed: 0,
    llmCallsBudget: 10,
    
    // Tool tracking
    requiredTools: ['checkInventory', 'validateCredit', 'processPayment', 'reserveInventory'],
    toolResults: {},
    
    // Retry management
    retryCount: {},
    maxRetries: 2,
    
    // Order state
    orderId: null,
    orderStatus: null,
    totalAmount: 0,
    
    // Error tracking
    errorReason: null,
    
    // Agent state
    currentPhase: 'idle',
    response: null
  },

  initial: 'idle',

  states: {
    /**
     * Idle - waiting for order
     */
    idle: {
      on: {
        CREATE_ORDER: {
          target: 'reasoning',
          actions: ['setOrderRequest', 'incrementLLMCalls']
        }
      }
    },

    /**
     * Reasoning - agent plans next action
     */
    reasoning: {
      always: [
        { 
          target: 'escalated', 
          guard: 'budgetExhausted',
          actions: 'setBudgetExhaustedReason'
        },
        { 
          target: 'checkingInventory',
          guard: 'needsInventoryCheck'
        },
        { 
          target: 'validatingCredit',
          guard: 'needsCreditValidation'
        },
        { 
          target: 'processingPayment',
          guard: 'needsPaymentProcessing'
        },
        { 
          target: 'reservingInventory',
          guard: 'needsInventoryReservation'
        },
        { 
          target: 'synthesizing',
          guard: 'allToolsSucceeded'
        }
      ]
    },

    /**
     * Checking inventory availability
     */
    checkingInventory: {
      on: {
        INVENTORY_AVAILABLE: {
          target: 'reasoning',
          actions: ['markToolSuccess', 'incrementLLMCalls']
        },
        INVENTORY_UNAVAILABLE: {
          target: 'escalated',
          actions: 'setInventoryError'
        },
        TOOL_ERROR: [
          {
            guard: 'canRetryTool',
            actions: ['incrementRetry', 'incrementLLMCalls']
          },
          {
            target: 'escalated',
            actions: 'setToolError'
          }
        ]
      }
    },

    /**
     * Validating customer credit
     */
    validatingCredit: {
      on: {
        CREDIT_APPROVED: {
          target: 'reasoning',
          actions: ['markToolSuccess', 'incrementLLMCalls']
        },
        CREDIT_DENIED: {
          target: 'escalated',
          actions: 'setCreditError'
        },
        TOOL_ERROR: [
          {
            guard: 'canRetryTool',
            actions: ['incrementRetry', 'incrementLLMCalls']
          },
          {
            target: 'escalated',
            actions: 'setToolError'
          }
        ]
      }
    },

    /**
     * Processing payment
     */
    processingPayment: {
      on: {
        PAYMENT_SUCCESS: {
          target: 'reasoning',
          actions: ['markToolSuccess', 'incrementLLMCalls']
        },
        PAYMENT_FAILED: {
          target: 'escalated',
          actions: 'setPaymentError'
        },
        TOOL_ERROR: [
          {
            guard: 'canRetryTool',
            actions: ['incrementRetry', 'incrementLLMCalls']
          },
          {
            target: 'escalated',
            actions: 'setToolError'
          }
        ]
      }
    },

    /**
     * Reserving inventory for fulfillment
     */
    reservingInventory: {
      on: {
        RESERVATION_SUCCESS: {
          target: 'reasoning',
          actions: ['markToolSuccess', 'incrementLLMCalls']
        },
        RESERVATION_FAILED: {
          target: 'escalated',
          actions: 'setReservationError'
        },
        TOOL_ERROR: [
          {
            guard: 'canRetryTool',
            actions: ['incrementRetry', 'incrementLLMCalls']
          },
          {
            target: 'escalated',
            actions: 'setToolError'
          }
        ]
      }
    },

    /**
     * Synthesizing final response
     */
    synthesizing: {
      entry: 'incrementLLMCalls',
      always: [
        { 
          target: 'escalated',
          guard: 'budgetExhausted',
          actions: 'setBudgetExhaustedReason'
        },
        { target: 'completed' }
      ]
    },

    /**
     * Completed successfully
     */
    completed: {
      type: 'final',
      entry: 'setSuccessResponse'
    },

    /**
     * Escalated - needs human intervention
     */
    escalated: {
      type: 'final'
    }
  }
}, {
  guards: {
    /**
     * Check if LLM budget is exhausted
     */
    budgetExhausted: ({ context }) => 
      context.llmCallsUsed >= context.llmCallsBudget,

    /**
     * Check if inventory check is needed
     */
    needsInventoryCheck: ({ context }) => 
      context.toolResults['checkInventory'] !== 'success' &&
      context.llmCallsUsed < context.llmCallsBudget,

    /**
     * Check if credit validation is needed
     */
    needsCreditValidation: ({ context }) => 
      context.toolResults['checkInventory'] === 'success' &&
      context.toolResults['validateCredit'] !== 'success' &&
      context.llmCallsUsed < context.llmCallsBudget,

    /**
     * Check if payment processing is needed
     */
    needsPaymentProcessing: ({ context }) => 
      context.toolResults['checkInventory'] === 'success' &&
      context.toolResults['validateCredit'] === 'success' &&
      context.toolResults['processPayment'] !== 'success' &&
      context.llmCallsUsed < context.llmCallsBudget,

    /**
     * Check if inventory reservation is needed
     */
    needsInventoryReservation: ({ context }) => 
      context.toolResults['checkInventory'] === 'success' &&
      context.toolResults['validateCredit'] === 'success' &&
      context.toolResults['processPayment'] === 'success' &&
      context.toolResults['reserveInventory'] !== 'success' &&
      context.llmCallsUsed < context.llmCallsBudget,

    /**
     * Check if all required tools succeeded
     */
    allToolsSucceeded: ({ context }) => 
      context.requiredTools.every(tool => context.toolResults[tool] === 'success'),

    /**
     * Check if tool can be retried
     */
    canRetryTool: ({ context, event }) => {
      const tool = event?.tool || 'default';
      const retries = context.retryCount[tool] || 0;
      return retries < context.maxRetries && context.llmCallsUsed < context.llmCallsBudget;
    }
  },

  actions: {
    /**
     * Set order request data
     */
    setOrderRequest: assign({
      orderId: ({ event }) => event.orderId || `order-${Date.now()}`,
      totalAmount: ({ event }) => event.totalAmount || 0,
      currentPhase: 'processing'
    }),

    /**
     * Increment LLM call counter
     */
    incrementLLMCalls: assign({
      llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
    }),

    /**
     * Mark tool as successful
     */
    markToolSuccess: assign({
      toolResults: ({ context, event }) => ({
        ...context.toolResults,
        [event.tool]: 'success'
      })
    }),

    /**
     * Increment retry counter for a tool
     */
    incrementRetry: assign({
      retryCount: ({ context, event }) => ({
        ...context.retryCount,
        [event.tool]: (context.retryCount[event.tool] || 0) + 1
      })
    }),

    /**
     * Error setters
     */
    setBudgetExhaustedReason: assign({
      errorReason: ({ context }) => 
        `LLM budget exhausted: used ${context.llmCallsUsed}/${context.llmCallsBudget} calls`
    }),

    setInventoryError: assign({
      errorReason: ({ event }) => event.reason || 'Insufficient inventory'
    }),

    setCreditError: assign({
      errorReason: ({ event }) => event.reason || 'Credit check failed'
    }),

    setPaymentError: assign({
      errorReason: ({ event }) => event.reason || 'Payment processing failed'
    }),

    setReservationError: assign({
      errorReason: ({ event }) => event.reason || 'Inventory reservation failed'
    }),

    setToolError: assign({
      errorReason: ({ context, event }) => 
        `Tool ${event.tool} failed after ${context.maxRetries} retries: ${event.reason || 'Unknown error'}`
    }),

    /**
     * Set successful completion response
     */
    setSuccessResponse: assign({
      response: ({ context }) => ({
        success: true,
        orderId: context.orderId,
        message: 'Order processed successfully'
      }),
      orderStatus: 'completed'
    })
  }
});

module.exports = {
  orderAgentMachine
};
