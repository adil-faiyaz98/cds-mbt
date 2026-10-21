/**
 * Approval Flow State Machine
 * 
 * Models a multi-step approval workflow with human-in-the-loop (HITL) patterns:
 * - Multiple approval levels based on amount/type
 * - Delegation capability
 * - Escalation for urgent cases
 * - Complete audit trail
 * 
 * This machine is designed to verify that:
 * - Approval chains are followed completely
 * - No approvers are skipped
 * - Escalations always have documented reasons
 * - Rejections always have reasons
 */

const { createMachine, assign } = require('xstate');

/**
 * Approval workflow state machine
 * 
 * States:
 * - draft: Initial state, request being prepared
 * - submitted: Request submitted, determining approval chain
 * - pendingLevel1: Waiting for first level approval (e.g., manager)
 * - pendingLevel2: Waiting for second level approval (e.g., director)
 * - pendingLevel3: Waiting for third level approval (e.g., VP)
 * - escalated: Escalated to higher authority
 * - approved: Fully approved
 * - rejected: Rejected at any level
 * - cancelled: Recalled by requester
 */
const approvalMachine = createMachine({
  id: 'approvalFlow',
  
  context: {
    // Request info
    requestId: null,
    requestType: 'expense',
    amount: 0,
    urgency: 'normal',
    
    // Approval chain tracking
    currentLevel: 0,
    totalLevels: 3,
    approvalsByLevel: {},
    
    // Approver tracking
    currentApprover: null,
    approverHistory: [],
    
    // Escalation tracking
    escalationReason: null,
    escalatedTo: null,
    
    // Delegation tracking
    delegationCount: 0,
    maxDelegations: 2,
    
    // Rejection tracking
    rejectionReason: null,
    rejectedBy: null,
    
    // Error tracking
    errorReason: null
  },

  initial: 'draft',

  states: {
    /**
     * Draft - request being prepared
     */
    draft: {
      on: {
        SUBMIT: {
          target: 'submitted',
          actions: 'initializeRequest'
        }
      }
    },

    /**
     * Submitted - determining approval chain
     */
    submitted: {
      always: [
        { 
          target: 'approved',
          guard: 'canAutoApprove',
          actions: 'markAutoApproved'
        },
        { 
          target: 'pendingLevel1',
          guard: 'needsApproval',
          actions: 'setFirstApprover'
        }
      ]
    },

    /**
     * Pending Level 1 - waiting for first approval (e.g., manager)
     */
    pendingLevel1: {
      on: {
        APPROVE: [
          {
            target: 'pendingLevel2',
            guard: 'needsMoreLevels',
            actions: ['recordApproval', 'advanceLevel']
          },
          {
            target: 'approved',
            guard: 'isFinalLevel',
            actions: ['recordApproval', 'markFullyApproved']
          }
        ],
        REJECT: {
          target: 'rejected',
          guard: 'hasRejectionReason',
          actions: 'recordRejection'
        },
        DELEGATE: {
          target: 'pendingLevel1',
          guard: 'canDelegate',
          actions: 'recordDelegation'
        },
        ESCALATE: {
          target: 'escalated',
          guard: 'hasEscalationReason',
          actions: 'recordEscalation'
        },
        RECALL: {
          target: 'cancelled',
          guard: 'canRecall'
        }
      }
    },

    /**
     * Pending Level 2 - waiting for second approval (e.g., director)
     */
    pendingLevel2: {
      on: {
        APPROVE: [
          {
            target: 'pendingLevel3',
            guard: 'needsMoreLevels',
            actions: ['recordApproval', 'advanceLevel']
          },
          {
            target: 'approved',
            guard: 'isFinalLevel',
            actions: ['recordApproval', 'markFullyApproved']
          }
        ],
        REJECT: {
          target: 'rejected',
          guard: 'hasRejectionReason',
          actions: 'recordRejection'
        },
        DELEGATE: {
          target: 'pendingLevel2',
          guard: 'canDelegate',
          actions: 'recordDelegation'
        },
        ESCALATE: {
          target: 'escalated',
          guard: 'hasEscalationReason',
          actions: 'recordEscalation'
        }
      }
    },

    /**
     * Pending Level 3 - waiting for final approval (e.g., VP/CFO)
     */
    pendingLevel3: {
      on: {
        APPROVE: {
          target: 'approved',
          actions: ['recordApproval', 'markFullyApproved']
        },
        REJECT: {
          target: 'rejected',
          guard: 'hasRejectionReason',
          actions: 'recordRejection'
        },
        DELEGATE: {
          target: 'pendingLevel3',
          guard: 'canDelegate',
          actions: 'recordDelegation'
        },
        ESCALATE: {
          target: 'escalated',
          guard: 'hasEscalationReason',
          actions: 'recordEscalation'
        }
      }
    },

    /**
     * Escalated - bypassed normal chain for urgent review
     */
    escalated: {
      on: {
        APPROVE: {
          target: 'approved',
          actions: ['recordApproval', 'markEscalationApproved']
        },
        REJECT: {
          target: 'rejected',
          guard: 'hasRejectionReason',
          actions: 'recordRejection'
        }
      }
    },

    /**
     * Approved - fully approved
     */
    approved: {
      type: 'final'
    },

    /**
     * Rejected - rejected at some level
     */
    rejected: {
      type: 'final'
    },

    /**
     * Cancelled - recalled by requester
     */
    cancelled: {
      type: 'final'
    }
  }
}, {
  guards: {
    /**
     * Check if request can be auto-approved (small amounts)
     */
    canAutoApprove: ({ context }) => 
      context.amount <= 100 || context.totalLevels === 0,

    /**
     * Check if request needs approval chain
     */
    needsApproval: ({ context }) => 
      context.amount > 100 && context.totalLevels > 0,

    /**
     * Check if more approval levels are needed
     */
    needsMoreLevels: ({ context }) => 
      context.currentLevel < context.totalLevels,

    /**
     * Check if this is the final approval level
     */
    isFinalLevel: ({ context }) => 
      context.currentLevel >= context.totalLevels,

    /**
     * Check if rejection has a reason
     */
    hasRejectionReason: ({ event }) => 
      event?.reason && event.reason.trim() !== '',

    /**
     * Check if escalation has a reason
     */
    hasEscalationReason: ({ event }) => 
      event?.reason && event.reason.trim() !== '',

    /**
     * Check if delegation is allowed
     */
    canDelegate: ({ context }) => 
      context.delegationCount < context.maxDelegations,

    /**
     * Check if request can be recalled
     */
    canRecall: ({ context }) => 
      context.currentLevel <= 1 && 
      Object.keys(context.approvalsByLevel).length === 0
  },

  actions: {
    /**
     * Initialize request when submitted
     */
    initializeRequest: assign({
      currentLevel: 1,
      approvalsByLevel: {}
    }),

    /**
     * Set first level approver
     */
    setFirstApprover: assign({
      currentApprover: ({ event }) => event?.approver || 'Manager'
    }),

    /**
     * Record an approval
     */
    recordApproval: assign({
      approvalsByLevel: ({ context, event }) => ({
        ...context.approvalsByLevel,
        [context.currentLevel]: {
          approver: event?.approver || context.currentApprover,
          comments: event?.comments,
          timestamp: Date.now()
        }
      }),
      approverHistory: ({ context, event }) => [
        ...context.approverHistory,
        { level: context.currentLevel, action: 'approved', approver: event?.approver || context.currentApprover }
      ]
    }),

    /**
     * Advance to next level
     */
    advanceLevel: assign({
      currentLevel: ({ context }) => context.currentLevel + 1,
      currentApprover: ({ context, event }) => event?.nextApprover || `Level${context.currentLevel + 1}Approver`
    }),

    /**
     * Mark as auto-approved
     */
    markAutoApproved: assign({
      approvalsByLevel: { 0: { approver: 'System', reason: 'Auto-approved' } }
    }),

    /**
     * Mark as fully approved
     */
    markFullyApproved: assign({
      currentApprover: null
    }),

    /**
     * Mark escalation as approved
     */
    markEscalationApproved: assign({
      approvalsByLevel: ({ context, event }) => ({
        ...context.approvalsByLevel,
        99: { // Escalation level
          approver: event?.approver || context.escalatedTo,
          reason: 'Escalation approved'
        }
      })
    }),

    /**
     * Record rejection
     */
    recordRejection: assign({
      rejectionReason: ({ event }) => event?.reason,
      rejectedBy: ({ context, event }) => event?.approver || context.currentApprover
    }),

    /**
     * Record delegation
     */
    recordDelegation: assign({
      delegationCount: ({ context }) => context.delegationCount + 1,
      currentApprover: ({ event }) => event?.toApprover,
      approverHistory: ({ context, event }) => [
        ...context.approverHistory,
        { level: context.currentLevel, action: 'delegated', from: context.currentApprover, to: event?.toApprover }
      ]
    }),

    /**
     * Record escalation
     */
    recordEscalation: assign({
      escalationReason: ({ event }) => event?.reason,
      escalatedTo: ({ event }) => event?.toApprover || 'Executive',
      currentApprover: ({ event }) => event?.toApprover || 'Executive'
    })
  }
});

module.exports = {
  approvalMachine
};
