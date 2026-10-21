/**
 * Machine Extractor for Joule Agents
 *
 * Extracts XState machine definitions from CDS services
 * annotated with @agent
 */

const { createMachine, assign } = require('xstate');
const fs = require('fs');
const path = require('path');

/**
 * Parse @agent annotations from CDS file content
 * @param {string} content - CDS file content
 * @returns {Object} Parsed annotations
 */
function parseAnnotations(content) {
  const annotations = {
    agent: false,
    hitl: [],
    actions: [],
    tools: []
  };

  // Check for @agent annotation
  const agentMatch = content.match(/@agent\s*(?:\(\s*\{([^}]*)\}\s*\))?/);
  if (agentMatch) {
    annotations.agent = true;
    if (agentMatch[1]) {
      // Parse annotation options
      try {
        const opts = agentMatch[1];
        if (opts.includes('hitl')) {
          annotations.hitl.push('approval');
        }
      } catch (e) {
        // Continue with defaults
      }
    }
  }

  // Extract actions from service definition
  const actionMatches = content.matchAll(/action\s+(\w+)\s*\(/g);
  for (const match of actionMatches) {
    annotations.actions.push(match[1]);
  }

  // Check for @agent.hitl annotations on specific actions
  const hitlMatches = content.matchAll(/@agent\.hitl\s*(?:\(\s*\{([^}]*)\}\s*\))?\s*(?:action\s+)?(\w+)/g);
  for (const match of hitlMatches) {
    const actionName = match[2];
    if (!annotations.hitl.includes(actionName)) {
      annotations.hitl.push(actionName);
    }
  }

  // Extract tool references
  const toolMatches = content.matchAll(/@tool\s*\(\s*['"](\w+)['"]\s*\)/g);
  for (const match of toolMatches) {
    annotations.tools.push(match[1]);
  }

  return annotations;
}

/**
 * Build state map from parsed annotations
 * @param {Object} annotations - Parsed annotations
 * @returns {Object} XState states configuration
 */
function buildStates(annotations) {
  const states = {
    idle: {
      on: {
        START: 'planning'
      }
    },
    planning: {
      on: {
        PLAN_READY: 'executing'
      }
    },
    executing: {
      on: {}
    },
    completed: { type: 'final' },
    escalated: { type: 'final' }
  };

  // Add action states as transitions from executing
  for (const action of annotations.actions) {
    states.executing.on[`EXECUTE_${action.toUpperCase()}`] = {
      target: annotations.hitl.includes(action)
        ? `pending_approval_${action}`
        : 'executing'
    };
  }

  // Add completion transitions
  states.executing.on.COMPLETE = 'completed';
  states.executing.on.ESCALATE = 'escalated';

  // Add HITL approval states
  for (const hitlAction of annotations.hitl) {
    const stateName = `pending_approval_${hitlAction}`;
    states[stateName] = {
      on: {
        APPROVE: 'executing',
        REJECT: 'escalated'
      }
    };
  }

  return states;
}

/**
 * Extract XState machine definition from a CDS file
 * @param {string} cdsFilePath - Path to CDS file
 * @returns {Object} XState machine definition
 */
function extractMachine(cdsFilePath) {
  let content;

  try {
    content = fs.readFileSync(cdsFilePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read CDS file: ${error.message}`);
  }

  const annotations = parseAnnotations(content);

  if (!annotations.agent) {
    throw new Error(`CDS file does not contain @agent annotation: ${cdsFilePath}`);
  }

  const serviceName = path.basename(cdsFilePath, '.cds');
  const states = buildStates(annotations);

  return createMachine({
    id: `agent_${serviceName}`,

    context: {
      llmCallsUsed: 0,
      llmCallsBudget: 10,
      currentAction: null,
      toolResults: {},
      pendingApprovals: [],
      errorReason: null
    },

    initial: 'idle',
    states
  }, {
    guards: {
      hasBudget: ({ context }) => context.llmCallsUsed < context.llmCallsBudget,
      hasPendingApproval: ({ context }) => context.pendingApprovals.length > 0
    },
    actions: {
      incrementLLMCalls: assign({
        llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
      }),
      setCurrentAction: assign({
        currentAction: ({ event }) => event.action
      }),
      addPendingApproval: assign({
        pendingApprovals: ({ context, event }) => [...context.pendingApprovals, event.action]
      }),
      removePendingApproval: assign({
        pendingApprovals: ({ context, event }) =>
          context.pendingApprovals.filter(a => a !== event.action)
      }),
      setErrorReason: assign({
        errorReason: ({ event }) => event.reason
      })
    }
  });
}

/**
 * Extract XState machine from a service definition object
 * @param {Object} serviceDefinition - Service definition with actions and annotations
 * @returns {Object} XState machine definition
 */
function extractFromDefinition(serviceDefinition) {
  const {
    name = 'agent',
    actions = [],
    hitlActions = [],
    tools = [],
    budget = 10,
    maxRetries = 3
  } = serviceDefinition;

  const annotations = {
    agent: true,
    hitl: hitlActions,
    actions: actions.map(a => typeof a === 'string' ? a : a.name),
    tools
  };

  const states = buildStates(annotations);

  return createMachine({
    id: `agent_${name}`,

    context: {
      llmCallsUsed: 0,
      llmCallsBudget: budget,
      maxRetries,
      retryCount: {},
      currentAction: null,
      toolResults: {},
      pendingApprovals: [],
      errorReason: null
    },

    initial: 'idle',
    states
  }, {
    guards: {
      hasBudget: ({ context }) => context.llmCallsUsed < context.llmCallsBudget,
      canRetry: ({ context, event }) => {
        const action = event?.action || 'default';
        return (context.retryCount[action] || 0) < context.maxRetries;
      }
    },
    actions: {
      incrementLLMCalls: assign({
        llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
      }),
      incrementRetry: assign({
        retryCount: ({ context, event }) => ({
          ...context.retryCount,
          [event.action]: (context.retryCount[event.action] || 0) + 1
        })
      }),
      setCurrentAction: assign({
        currentAction: ({ event }) => event.action
      }),
      markToolSuccess: assign({
        toolResults: ({ context, event }) => ({
          ...context.toolResults,
          [event.tool]: 'success'
        })
      }),
      setErrorReason: assign({
        errorReason: ({ event }) => event.reason
      })
    }
  });
}

module.exports = {
  extractMachine,
  extractFromDefinition,
  parseAnnotations,
  buildStates
};
