/**
 * Order Agent Invariants
 * 
 * Custom invariants for verifying order processing agent safety:
 * - budgetRespected: Never exceed LLM call budget
 * - paymentBeforeFulfillment: Payment must succeed before inventory reservation
 * - inventoryChecked: Inventory must be validated before payment
 * - retriesBounded: Tool retries must not exceed limit
 * - escalationHasReason: Escalated state must document why
 */

const { createInvariant } = require('cds-mbt');

/**
 * Budget Respected Invariant
 * 
 * Critical for cost control - agent must never exceed its LLM budget.
 * This prevents runaway costs from infinite loops or reasoning cycles.
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
        : `LLM budget exceeded: used ${used} calls, budget was ${budget}`
    };
  }
});

/**
 * Payment Before Fulfillment Invariant
 * 
 * Business rule: Never reserve inventory unless payment is confirmed.
 * This prevents inventory being locked for unpaid orders.
 */
const paymentBeforeFulfillment = createInvariant({
  name: 'paymentBeforeFulfillment',
  description: 'Payment must be processed before inventory is reserved',
  category: 'business-rule',
  severity: 'error',
  
  check: (context, state) => {
    const toolResults = context.toolResults ?? {};
    
    // If inventory is being reserved, payment must have succeeded
    if (toolResults['reserveInventory'] === 'success' || state === 'reservingInventory') {
      const paymentProcessed = toolResults['processPayment'] === 'success';
      
      return {
        passed: paymentProcessed,
        message: paymentProcessed
          ? null
          : 'Attempting to reserve inventory without confirmed payment'
      };
    }
    
    return { passed: true };
  }
});

/**
 * Inventory Checked Invariant
 * 
 * Business rule: Never process payment without checking inventory first.
 * This prevents charging customers for items that aren't in stock.
 */
const inventoryChecked = createInvariant({
  name: 'inventoryChecked',
  description: 'Inventory must be verified before processing payment',
  category: 'business-rule',
  severity: 'error',
  
  check: (context, state) => {
    const toolResults = context.toolResults ?? {};
    
    // If payment is being processed, inventory must have been checked
    if (toolResults['processPayment'] === 'success' || 
        state === 'processingPayment' ||
        state === 'validatingCredit') {
      const inventoryVerified = toolResults['checkInventory'] === 'success';
      
      return {
        passed: inventoryVerified,
        message: inventoryVerified
          ? null
          : 'Attempting to process payment without verifying inventory'
      };
    }
    
    return { passed: true };
  }
});

/**
 * Retries Bounded Invariant
 * 
 * Prevents infinite retry loops for failing tools.
 * Each tool should be retried at most maxRetries times.
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
 * Escalation Has Reason Invariant
 * 
 * When the agent escalates to human intervention, it must document why.
 * This ensures support teams have actionable information.
 */
const escalationHasReason = createInvariant({
  name: 'escalationHasReason',
  description: 'Escalated state must have an error reason documented',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    if (state !== 'escalated') {
      return { passed: true };
    }
    
    const hasReason = context.errorReason !== null && 
                      context.errorReason !== undefined &&
                      context.errorReason !== '';
    
    return {
      passed: hasReason,
      message: hasReason
        ? null
        : 'Agent escalated without providing a reason'
    };
  }
});

/**
 * No Invalid Completion Invariant
 * 
 * Agent cannot report completion unless all required tools succeeded.
 */
const noInvalidCompletion = createInvariant({
  name: 'noInvalidCompletion',
  description: 'Completed state requires all required tools to have succeeded',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    if (state !== 'completed') {
      return { passed: true };
    }
    
    const requiredTools = context.requiredTools ?? [];
    const toolResults = context.toolResults ?? {};
    
    if (requiredTools.length === 0) {
      return { passed: true };
    }
    
    const failed = requiredTools.filter(tool => toolResults[tool] !== 'success');
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
 * Credit Before Payment Invariant
 * 
 * Credit must be validated before attempting payment.
 */
const creditBeforePayment = createInvariant({
  name: 'creditBeforePayment',
  description: 'Customer credit must be validated before processing payment',
  category: 'business-rule',
  severity: 'error',
  
  check: (context, state) => {
    const toolResults = context.toolResults ?? {};
    
    if (toolResults['processPayment'] === 'success' || state === 'processingPayment') {
      const creditValidated = toolResults['validateCredit'] === 'success';
      
      return {
        passed: creditValidated,
        message: creditValidated
          ? null
          : 'Attempting to process payment without credit validation'
      };
    }
    
    return { passed: true };
  }
});

module.exports = {
  budgetRespected,
  paymentBeforeFulfillment,
  inventoryChecked,
  retriesBounded,
  escalationHasReason,
  noInvalidCompletion,
  creditBeforePayment,
  
  // All order agent invariants as array
  all: [
    budgetRespected,
    paymentBeforeFulfillment,
    inventoryChecked,
    retriesBounded,
    escalationHasReason,
    noInvalidCompletion,
    creditBeforePayment
  ]
};
