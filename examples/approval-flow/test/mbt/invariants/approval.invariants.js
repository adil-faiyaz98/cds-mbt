/**
 * Approval Flow Invariants
 * 
 * Custom invariants for verifying multi-step approval workflow safety:
 * - approvalChainComplete: Approved requests must have all levels approved
 * - noSkippedApprovers: Each level must be approved in sequence
 * - escalationHasReason: Escalations must have documented reasons
 * - rejectionHasReason: Rejections must have documented reasons
 * - delegationBounded: Delegations must not exceed max limit
 */

const { createInvariant } = require('cds-mbt');

/**
 * Approval Chain Complete Invariant
 * 
 * When a request is approved, all required levels must have been completed.
 * This ensures no steps in the chain were bypassed.
 */
const approvalChainComplete = createInvariant({
  name: 'approvalChainComplete',
  description: 'Approved requests must have all required approval levels completed',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    // Only check in approved state
    if (state !== 'approved') {
      return { passed: true };
    }
    
    const totalLevels = context.totalLevels ?? 0;
    const approvals = context.approvalsByLevel ?? {};
    
    // Auto-approved requests (level 0) are okay
    if (approvals[0]) {
      return { passed: true };
    }
    
    // Escalation-approved requests (level 99) are okay
    if (approvals[99]) {
      return { passed: true };
    }
    
    // Check each required level has approval
    const missingLevels = [];
    for (let level = 1; level <= totalLevels; level++) {
      if (!approvals[level]) {
        missingLevels.push(level);
      }
    }
    
    const passed = missingLevels.length === 0;
    return {
      passed,
      message: passed
        ? null
        : `Approval chain incomplete: missing levels ${missingLevels.join(', ')}`
    };
  }
});

/**
 * No Skipped Approvers Invariant
 * 
 * Approvals must happen in order - can't approve level 3 before level 1.
 * Exception: escalation can bypass the chain.
 */
const noSkippedApprovers = createInvariant({
  name: 'noSkippedApprovers',
  description: 'Approval levels must be completed in sequence',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    // Skip check for non-approval states
    if (!['approved', 'pendingLevel2', 'pendingLevel3'].includes(state)) {
      return { passed: true };
    }
    
    const approvals = context.approvalsByLevel ?? {};
    const currentLevel = context.currentLevel ?? 1;
    
    // Check that all previous levels are approved
    for (let level = 1; level < currentLevel; level++) {
      if (!approvals[level]) {
        return {
          passed: false,
          message: `Level ${level} not approved but at level ${currentLevel}`
        };
      }
    }
    
    return { passed: true };
  }
});

/**
 * Escalation Has Reason Invariant
 * 
 * Any escalation must have a documented reason.
 * This is required for audit compliance.
 */
const escalationHasReason = createInvariant({
  name: 'escalationHasReason',
  description: 'Escalated requests must have a documented escalation reason',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    // Only check in escalated state
    if (state !== 'escalated') {
      return { passed: true };
    }
    
    const hasReason = context.escalationReason !== null &&
                      context.escalationReason !== undefined &&
                      context.escalationReason.trim() !== '';
    
    return {
      passed: hasReason,
      message: hasReason
        ? null
        : 'Request escalated without providing a reason'
    };
  }
});

/**
 * Rejection Has Reason Invariant
 * 
 * Any rejection must have a documented reason.
 * This is required for requester feedback and audit compliance.
 */
const rejectionHasReason = createInvariant({
  name: 'rejectionHasReason',
  description: 'Rejected requests must have a documented rejection reason',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    // Only check in rejected state
    if (state !== 'rejected') {
      return { passed: true };
    }
    
    const hasReason = context.rejectionReason !== null &&
                      context.rejectionReason !== undefined &&
                      context.rejectionReason.trim() !== '';
    
    return {
      passed: hasReason,
      message: hasReason
        ? null
        : 'Request rejected without providing a reason'
    };
  }
});

/**
 * Delegation Bounded Invariant
 * 
 * Delegations must not exceed the configured maximum.
 * Prevents infinite delegation loops.
 */
const delegationBounded = createInvariant({
  name: 'delegationBounded',
  description: 'Delegation count must not exceed maximum limit',
  category: 'resource',
  severity: 'error',
  
  check: (context) => {
    const delegationCount = context.delegationCount ?? 0;
    const maxDelegations = context.maxDelegations ?? 2;
    
    const passed = delegationCount <= maxDelegations;
    return {
      passed,
      message: passed
        ? null
        : `Delegation limit exceeded: ${delegationCount}/${maxDelegations}`
    };
  }
});

/**
 * Current Level Valid Invariant
 * 
 * The current approval level must be within valid range.
 */
const currentLevelValid = createInvariant({
  name: 'currentLevelValid',
  description: 'Current approval level must be within valid range',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    // Skip for terminal states
    if (['approved', 'rejected', 'cancelled', 'draft'].includes(state)) {
      return { passed: true };
    }
    
    const currentLevel = context.currentLevel ?? 0;
    const totalLevels = context.totalLevels ?? 1;
    
    const passed = currentLevel >= 1 && currentLevel <= totalLevels;
    return {
      passed,
      message: passed
        ? null
        : `Invalid current level: ${currentLevel} (total: ${totalLevels})`
    };
  }
});

/**
 * Approval Has Approver Invariant
 * 
 * Each recorded approval must have an identified approver.
 */
const approvalHasApprover = createInvariant({
  name: 'approvalHasApprover',
  description: 'Each approval record must identify the approver',
  category: 'correctness',
  severity: 'error',
  
  check: (context, state) => {
    if (state !== 'approved') {
      return { passed: true };
    }
    
    const approvals = context.approvalsByLevel ?? {};
    const missingApprovers = [];
    
    for (const [level, approval] of Object.entries(approvals)) {
      if (!approval.approver) {
        missingApprovers.push(level);
      }
    }
    
    const passed = missingApprovers.length === 0;
    return {
      passed,
      message: passed
        ? null
        : `Approvals missing approver at levels: ${missingApprovers.join(', ')}`
    };
  }
});

module.exports = {
  approvalChainComplete,
  noSkippedApprovers,
  escalationHasReason,
  rejectionHasReason,
  delegationBounded,
  currentLevelValid,
  approvalHasApprover,
  
  // All approval invariants as array
  all: [
    approvalChainComplete,
    noSkippedApprovers,
    escalationHasReason,
    rejectionHasReason,
    delegationBounded,
    currentLevelValid,
    approvalHasApprover
  ]
};
