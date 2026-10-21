/**
 * ReAct Templates for Joule Agents
 *
 * Pre-built machine templates for common agent patterns:
 * - ReAct loop (observe -> think -> act)
 * - A2A protocol (agent-to-agent communication)
 * - HITL (human-in-the-loop approval)
 * - Subagent coordination
 */

const { createMachine, assign } = require('xstate');

/**
 * Create a standard ReAct loop machine
 *
 * Implements the observe -> think -> act -> observe cycle
 * commonly used in LLM agents
 *
 * @param {Object} config - Configuration options
 * @param {string} config.id - Machine identifier
 * @param {number} [config.maxIterations=10] - Maximum loop iterations
 * @param {number} [config.budget=20] - LLM call budget
 * @param {string[]} [config.tools=[]] - Available tools
 * @returns {Object} XState machine definition
 */
function createReActMachine(config = {}) {
  const {
    id = 'react',
    maxIterations = 10,
    budget = 20,
    tools = [],
    additionalStates = {},
    additionalGuards = {},
    additionalActions = {}
  } = config;

  return createMachine({
    id,

    context: {
      iteration: 0,
      maxIterations,
      llmCallsUsed: 0,
      llmCallsBudget: budget,
      observations: [],
      thoughts: [],
      actions: [],
      toolResults: {},
      availableTools: tools,
      finalAnswer: null,
      errorReason: null
    },

    initial: 'idle',

    states: {
      idle: {
        on: {
          START: {
            target: 'observing',
            actions: 'initializeLoop'
          }
        }
      },

      observing: {
        entry: 'incrementIteration',
        on: {
          OBSERVATION: {
            target: 'thinking',
            actions: 'recordObservation'
          },
          NO_MORE_DATA: {
            target: 'synthesizing'
          }
        },
        always: [
          { target: 'escalated', guard: 'maxIterationsReached', actions: 'setMaxIterationsError' }
        ]
      },

      thinking: {
        entry: 'incrementLLMCalls',
        on: {
          THOUGHT: {
            target: 'acting',
            actions: 'recordThought'
          },
          FINAL_ANSWER: {
            target: 'synthesizing',
            actions: 'recordFinalAnswer'
          }
        },
        always: [
          { target: 'escalated', guard: 'budgetExhausted', actions: 'setBudgetError' }
        ]
      },

      acting: {
        on: {
          ACTION_SUCCESS: {
            target: 'observing',
            actions: 'recordActionSuccess'
          },
          ACTION_FAILURE: {
            target: 'observing',
            actions: 'recordActionFailure'
          },
          TOOL_RESULT: {
            target: 'observing',
            actions: 'recordToolResult'
          }
        }
      },

      synthesizing: {
        entry: 'incrementLLMCalls',
        on: {
          SYNTHESIZE_SUCCESS: 'completed',
          SYNTHESIZE_FAILURE: {
            target: 'escalated',
            actions: 'setSynthesizeError'
          }
        },
        always: [
          { target: 'escalated', guard: 'budgetExhausted', actions: 'setBudgetError' }
        ]
      },

      completed: { type: 'final' },
      escalated: { type: 'final' },

      ...additionalStates
    }
  }, {
    guards: {
      maxIterationsReached: ({ context }) => context.iteration >= context.maxIterations,
      budgetExhausted: ({ context }) => context.llmCallsUsed >= context.llmCallsBudget,
      hasTools: ({ context }) => context.availableTools.length > 0,
      ...additionalGuards
    },
    actions: {
      initializeLoop: assign({
        iteration: 0,
        observations: [],
        thoughts: [],
        actions: []
      }),
      incrementIteration: assign({
        iteration: ({ context }) => context.iteration + 1
      }),
      incrementLLMCalls: assign({
        llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
      }),
      recordObservation: assign({
        observations: ({ context, event }) => [...context.observations, event.data]
      }),
      recordThought: assign({
        thoughts: ({ context, event }) => [...context.thoughts, event.data]
      }),
      recordActionSuccess: assign({
        actions: ({ context, event }) => [...context.actions, { ...event, status: 'success' }]
      }),
      recordActionFailure: assign({
        actions: ({ context, event }) => [...context.actions, { ...event, status: 'failure' }]
      }),
      recordToolResult: assign({
        toolResults: ({ context, event }) => ({
          ...context.toolResults,
          [event.tool]: event.result
        })
      }),
      recordFinalAnswer: assign({
        finalAnswer: ({ event }) => event.answer
      }),
      setMaxIterationsError: assign({
        errorReason: 'Maximum iterations reached without final answer'
      }),
      setBudgetError: assign({
        errorReason: 'LLM call budget exhausted'
      }),
      setSynthesizeError: assign({
        errorReason: ({ event }) => event.reason || 'Failed to synthesize final answer'
      }),
      ...additionalActions
    }
  });
}

/**
 * Create an Agent-to-Agent (A2A) protocol machine
 *
 * Implements the standard A2A communication protocol:
 * initialize -> negotiate -> execute -> finalize
 *
 * @param {Object} config - Configuration options
 * @param {string} config.id - Machine identifier
 * @param {string} [config.protocol='request-response'] - Protocol type
 * @param {number} [config.timeout=30000] - Operation timeout in ms
 * @param {number} [config.maxNegotiations=3] - Max negotiation rounds
 * @returns {Object} XState machine definition
 */
function createA2AMachine(config = {}) {
  const {
    id = 'a2a',
    protocol = 'request-response',
    timeout = 30000,
    maxNegotiations = 3,
    additionalStates = {},
    additionalGuards = {},
    additionalActions = {}
  } = config;

  return createMachine({
    id,

    context: {
      protocol,
      timeout,
      negotiationRound: 0,
      maxNegotiations,
      localAgent: null,
      remoteAgent: null,
      request: null,
      response: null,
      agreement: null,
      executionResult: null,
      errorReason: null,
      startTime: null
    },

    initial: 'idle',

    states: {
      idle: {
        on: {
          CONNECT: {
            target: 'initializing',
            actions: 'setAgents'
          }
        }
      },

      initializing: {
        entry: 'recordStartTime',
        on: {
          INIT_SUCCESS: {
            target: 'negotiating',
            actions: 'setRequest'
          },
          INIT_FAILURE: {
            target: 'failed',
            actions: 'setInitError'
          }
        }
      },

      negotiating: {
        entry: 'incrementNegotiationRound',
        on: {
          PROPOSE: {
            actions: 'updateProposal'
          },
          ACCEPT: {
            target: 'executing',
            actions: 'setAgreement'
          },
          REJECT: [
            { target: 'negotiating', guard: 'canNegotiateMore' },
            { target: 'failed', actions: 'setNegotiationFailed' }
          ],
          COUNTER: {
            actions: 'updateCounterProposal'
          }
        },
        always: [
          { target: 'failed', guard: 'negotiationLimitReached', actions: 'setNegotiationLimitError' }
        ]
      },

      executing: {
        on: {
          EXECUTE_SUCCESS: {
            target: 'finalizing',
            actions: 'setExecutionResult'
          },
          EXECUTE_FAILURE: {
            target: 'failed',
            actions: 'setExecutionError'
          },
          EXECUTE_PARTIAL: {
            actions: 'updatePartialResult'
          }
        }
      },

      finalizing: {
        on: {
          FINALIZE_SUCCESS: {
            target: 'completed',
            actions: 'setResponse'
          },
          FINALIZE_FAILURE: {
            target: 'failed',
            actions: 'setFinalizeError'
          }
        }
      },

      completed: { type: 'final' },
      failed: { type: 'final' },

      ...additionalStates
    }
  }, {
    guards: {
      canNegotiateMore: ({ context }) => context.negotiationRound < context.maxNegotiations,
      negotiationLimitReached: ({ context }) => context.negotiationRound >= context.maxNegotiations,
      hasAgreement: ({ context }) => context.agreement !== null,
      isTimedOut: ({ context }) => {
        if (!context.startTime) return false;
        return Date.now() - context.startTime > context.timeout;
      },
      ...additionalGuards
    },
    actions: {
      setAgents: assign({
        localAgent: ({ event }) => event.local,
        remoteAgent: ({ event }) => event.remote
      }),
      recordStartTime: assign({
        startTime: () => Date.now()
      }),
      setRequest: assign({
        request: ({ event }) => event.request
      }),
      incrementNegotiationRound: assign({
        negotiationRound: ({ context }) => context.negotiationRound + 1
      }),
      updateProposal: assign({
        request: ({ event }) => event.proposal
      }),
      updateCounterProposal: assign({
        request: ({ event }) => event.counter
      }),
      setAgreement: assign({
        agreement: ({ event }) => event.agreement
      }),
      setExecutionResult: assign({
        executionResult: ({ event }) => event.result
      }),
      updatePartialResult: assign({
        executionResult: ({ context, event }) => ({
          ...context.executionResult,
          partial: event.partial
        })
      }),
      setResponse: assign({
        response: ({ event }) => event.response
      }),
      setInitError: assign({
        errorReason: ({ event }) => event.reason || 'Initialization failed'
      }),
      setNegotiationFailed: assign({
        errorReason: 'Negotiation rejected'
      }),
      setNegotiationLimitError: assign({
        errorReason: 'Maximum negotiation rounds exceeded'
      }),
      setExecutionError: assign({
        errorReason: ({ event }) => event.reason || 'Execution failed'
      }),
      setFinalizeError: assign({
        errorReason: ({ event }) => event.reason || 'Finalization failed'
      }),
      ...additionalActions
    }
  });
}

/**
 * Create a Human-in-the-Loop (HITL) approval machine
 *
 * Implements approval workflows:
 * request -> pending_approval -> approved/rejected
 *
 * @param {Object} config - Configuration options
 * @param {string} config.id - Machine identifier
 * @param {string[]} [config.approvers=[]] - Required approvers
 * @param {number} [config.requiredApprovals=1] - Number of approvals needed
 * @param {number} [config.timeout=86400000] - Approval timeout (24h default)
 * @param {boolean} [config.allowEscalation=true] - Allow escalation on timeout
 * @returns {Object} XState machine definition
 */
function createHITLMachine(config = {}) {
  const {
    id = 'hitl',
    approvers = [],
    requiredApprovals = 1,
    timeout = 86400000, // 24 hours
    allowEscalation = true,
    additionalStates = {},
    additionalGuards = {},
    additionalActions = {}
  } = config;

  return createMachine({
    id,

    context: {
      approvers,
      requiredApprovals,
      timeout,
      allowEscalation,
      request: null,
      requestTime: null,
      approvalList: [],
      rejectionList: [],
      comments: [],
      escalationReason: null,
      errorReason: null
    },

    initial: 'idle',

    states: {
      idle: {
        on: {
          REQUEST: {
            target: 'pending_approval',
            actions: 'submitRequest'
          }
        }
      },

      pending_approval: {
        on: {
          APPROVE: [
            { target: 'approved', guard: 'hasEnoughApprovals', actions: 'recordApproval' },
            { actions: 'recordApproval' }
          ],
          REJECT: {
            target: 'rejected',
            actions: 'recordRejection'
          },
          COMMENT: {
            actions: 'recordComment'
          },
          ESCALATE: {
            target: 'escalated',
            guard: 'escalationAllowed',
            actions: 'setEscalationReason'
          },
          TIMEOUT: [
            { target: 'escalated', guard: 'escalationAllowed', actions: 'setTimeoutEscalation' },
            { target: 'rejected', actions: 'setTimeoutRejection' }
          ],
          CANCEL: {
            target: 'cancelled',
            actions: 'setCancellationReason'
          }
        }
      },

      approved: { type: 'final' },
      rejected: { type: 'final' },
      escalated: { type: 'final' },
      cancelled: { type: 'final' },

      ...additionalStates
    }
  }, {
    guards: {
      hasEnoughApprovals: ({ context }) => {
        const newApprovalCount = context.approvalList.length + 1;
        return newApprovalCount >= context.requiredApprovals;
      },
      escalationAllowed: ({ context }) => context.allowEscalation,
      isTimedOut: ({ context }) => {
        if (!context.requestTime) return false;
        return Date.now() - context.requestTime > context.timeout;
      },
      hasApprovers: ({ context }) => context.approvers.length > 0,
      ...additionalGuards
    },
    actions: {
      submitRequest: assign({
        request: ({ event }) => event.request,
        requestTime: () => Date.now(),
        approvalList: [],
        rejectionList: [],
        comments: []
      }),
      recordApproval: assign({
        approvalList: ({ context, event }) => [
          ...context.approvalList,
          {
            approver: event.approver,
            timestamp: Date.now(),
            comment: event.comment
          }
        ]
      }),
      recordRejection: assign({
        rejectionList: ({ context, event }) => [
          ...context.rejectionList,
          {
            rejector: event.rejector,
            timestamp: Date.now(),
            reason: event.reason
          }
        ]
      }),
      recordComment: assign({
        comments: ({ context, event }) => [
          ...context.comments,
          {
            author: event.author,
            text: event.text,
            timestamp: Date.now()
          }
        ]
      }),
      setEscalationReason: assign({
        escalationReason: ({ event }) => event.reason || 'Manual escalation'
      }),
      setTimeoutEscalation: assign({
        escalationReason: 'Approval timeout exceeded'
      }),
      setTimeoutRejection: assign({
        errorReason: 'Approval timeout - auto-rejected'
      }),
      setCancellationReason: assign({
        errorReason: ({ event }) => event.reason || 'Request cancelled'
      }),
      ...additionalActions
    }
  });
}

/**
 * Create a Subagent coordination machine
 *
 * Implements subagent orchestration:
 * spawn -> monitor -> collect -> synthesize
 *
 * @param {Object} config - Configuration options
 * @param {string} config.id - Machine identifier
 * @param {number} [config.maxSubagents=5] - Maximum concurrent subagents
 * @param {number} [config.timeout=60000] - Per-subagent timeout
 * @param {string} [config.strategy='parallel'] - Execution strategy: parallel, sequential, race
 * @returns {Object} XState machine definition
 */
function createSubagentMachine(config = {}) {
  const {
    id = 'subagent',
    maxSubagents = 5,
    timeout = 60000,
    strategy = 'parallel',
    additionalStates = {},
    additionalGuards = {},
    additionalActions = {}
  } = config;

  return createMachine({
    id,

    context: {
      maxSubagents,
      timeout,
      strategy,
      subagents: [],
      activeSubagents: [],
      completedSubagents: [],
      failedSubagents: [],
      results: {},
      synthesizedResult: null,
      errorReason: null
    },

    initial: 'idle',

    states: {
      idle: {
        on: {
          INITIALIZE: {
            target: 'spawning',
            actions: 'setSubagentTasks'
          }
        }
      },

      spawning: {
        on: {
          SPAWN_SUCCESS: {
            actions: 'addActiveSubagent'
          },
          SPAWN_FAILURE: {
            actions: 'recordSpawnFailure'
          },
          ALL_SPAWNED: {
            target: 'monitoring'
          }
        },
        always: [
          { target: 'failed', guard: 'allSpawnsFailed', actions: 'setAllSpawnsFailedError' }
        ]
      },

      monitoring: {
        on: {
          SUBAGENT_PROGRESS: {
            actions: 'updateSubagentProgress'
          },
          SUBAGENT_COMPLETE: {
            actions: 'recordSubagentComplete'
          },
          SUBAGENT_FAILURE: {
            actions: 'recordSubagentFailure'
          },
          ALL_COMPLETE: [
            { target: 'collecting', guard: 'hasSuccessfulSubagents' },
            { target: 'failed', actions: 'setAllSubagentsFailedError' }
          ],
          RACE_WINNER: {
            target: 'collecting',
            guard: 'isRaceStrategy',
            actions: 'setRaceWinner'
          }
        },
        always: [
          { target: 'collecting', guard: 'shouldCollectNow' }
        ]
      },

      collecting: {
        entry: 'aggregateResults',
        on: {
          COLLECT_SUCCESS: 'synthesizing',
          COLLECT_FAILURE: {
            target: 'failed',
            actions: 'setCollectError'
          }
        }
      },

      synthesizing: {
        on: {
          SYNTHESIZE_SUCCESS: {
            target: 'completed',
            actions: 'setSynthesizedResult'
          },
          SYNTHESIZE_FAILURE: {
            target: 'failed',
            actions: 'setSynthesizeError'
          }
        }
      },

      completed: { type: 'final' },
      failed: { type: 'final' },

      ...additionalStates
    }
  }, {
    guards: {
      hasSuccessfulSubagents: ({ context }) => context.completedSubagents.length > 0,
      allSpawnsFailed: ({ context }) =>
        context.failedSubagents.length > 0 &&
        context.activeSubagents.length === 0 &&
        context.subagents.length === context.failedSubagents.length,
      isRaceStrategy: ({ context }) => context.strategy === 'race',
      shouldCollectNow: ({ context }) => {
        if (context.strategy === 'race') {
          return context.completedSubagents.length > 0;
        }
        const total = context.completedSubagents.length + context.failedSubagents.length;
        return total === context.subagents.length;
      },
      canSpawnMore: ({ context }) => context.activeSubagents.length < context.maxSubagents,
      ...additionalGuards
    },
    actions: {
      setSubagentTasks: assign({
        subagents: ({ event }) => event.tasks || [],
        activeSubagents: [],
        completedSubagents: [],
        failedSubagents: [],
        results: {}
      }),
      addActiveSubagent: assign({
        activeSubagents: ({ context, event }) => [...context.activeSubagents, event.subagent]
      }),
      recordSpawnFailure: assign({
        failedSubagents: ({ context, event }) => [
          ...context.failedSubagents,
          { id: event.subagent, error: event.error, phase: 'spawn' }
        ]
      }),
      updateSubagentProgress: assign({
        results: ({ context, event }) => ({
          ...context.results,
          [event.subagent]: { ...context.results[event.subagent], progress: event.progress }
        })
      }),
      recordSubagentComplete: assign({
        activeSubagents: ({ context, event }) =>
          context.activeSubagents.filter(s => s !== event.subagent),
        completedSubagents: ({ context, event }) => [...context.completedSubagents, event.subagent],
        results: ({ context, event }) => ({
          ...context.results,
          [event.subagent]: { result: event.result, status: 'completed' }
        })
      }),
      recordSubagentFailure: assign({
        activeSubagents: ({ context, event }) =>
          context.activeSubagents.filter(s => s !== event.subagent),
        failedSubagents: ({ context, event }) => [
          ...context.failedSubagents,
          { id: event.subagent, error: event.error, phase: 'execution' }
        ]
      }),
      setRaceWinner: assign({
        synthesizedResult: ({ event }) => event.result
      }),
      aggregateResults: assign({
        // Collect results - actual aggregation happens here
      }),
      setSynthesizedResult: assign({
        synthesizedResult: ({ event }) => event.result
      }),
      setAllSpawnsFailedError: assign({
        errorReason: 'All subagent spawns failed'
      }),
      setAllSubagentsFailedError: assign({
        errorReason: 'All subagents failed during execution'
      }),
      setCollectError: assign({
        errorReason: ({ event }) => event.reason || 'Failed to collect results'
      }),
      setSynthesizeError: assign({
        errorReason: ({ event }) => event.reason || 'Failed to synthesize results'
      }),
      ...additionalActions
    }
  });
}

module.exports = {
  createReActMachine,
  createA2AMachine,
  createHITLMachine,
  createSubagentMachine
};
