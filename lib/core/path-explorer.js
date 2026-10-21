/**
 * Path Explorer - Core MBT Engine
 *
 * Systematically explores all paths through a state machine
 * and verifies invariants at each step.
 */

const { createActor } = require('xstate');

/**
 * Explore all simple paths through a state machine
 * @param {Object} machine - XState machine definition
 * @param {Object} options - Exploration options
 * @returns {Array} Array of path objects
 */
function explorePaths(machine, options = {}) {
  const {
    maxDepth = 50,
    maxPaths = 1000,
    stopOnLoop = true
  } = options;

  const paths = [];
  const visited = new Set();

  function explore(currentPath, actor, depth) {
    if (depth > maxDepth || paths.length >= maxPaths) {
      return;
    }

    const snapshot = actor.getSnapshot();
    const stateKey = JSON.stringify({
      value: snapshot.value,
      context: snapshot.context
    });

    // Detect loops
    if (stopOnLoop && visited.has(stateKey)) {
      currentPath.hasLoop = true;
      paths.push({ ...currentPath, steps: [...currentPath.steps] });
      return;
    }

    visited.add(stateKey);

    // Check if final state
    if (snapshot.done) {
      paths.push({ ...currentPath, steps: [...currentPath.steps] });
      visited.delete(stateKey);
      return;
    }

    // Get possible events
    const nextEvents = getNextEvents(snapshot);

    if (nextEvents.length === 0) {
      // No more events, path ends here
      paths.push({ ...currentPath, steps: [...currentPath.steps] });
      visited.delete(stateKey);
      return;
    }

    // Explore each possible event
    for (const event of nextEvents) {
      const newActor = createActor(machine, {
        snapshot
      });
      newActor.start();

      try {
        newActor.send(event);
        const newSnapshot = newActor.getSnapshot();

        const step = {
          event,
          fromState: snapshot.value,
          toState: newSnapshot.value,
          context: { ...newSnapshot.context }
        };

        currentPath.steps.push(step);
        explore(currentPath, newActor, depth + 1);
        currentPath.steps.pop();
      } catch (err) {
        // Event not allowed in current state, skip
      } finally {
        newActor.stop();
      }
    }

    visited.delete(stateKey);
  }

  // Start exploration
  const initialActor = createActor(machine);
  initialActor.start();

  const initialPath = {
    machine: machine.id || 'unnamed',
    steps: [{
      event: { type: 'INIT' },
      fromState: null,
      toState: initialActor.getSnapshot().value,
      context: { ...initialActor.getSnapshot().context }
    }],
    hasLoop: false
  };

  explore(initialPath, initialActor, 0);
  initialActor.stop();

  return paths;
}

/**
 * Get possible next events for a state
 */
function getNextEvents(snapshot) {
  const events = [];
  const stateValue = snapshot.value;
  const machine = snapshot.machine;

  // Get events from state config
  if (machine && machine.states) {
    const stateConfig = getStateConfig(machine.states, stateValue);
    if (stateConfig && stateConfig.on) {
      for (const eventType of Object.keys(stateConfig.on)) {
        events.push({ type: eventType });
      }
    }
  }

  // Fallback: try common event types
  if (events.length === 0) {
    const commonEvents = [
      'START', 'STOP', 'RETRY', 'SUCCESS', 'FAILURE', 'TIMEOUT',
      'TOOL_SUCCESS', 'TOOL_FAILURE', 'TOOL_TIMEOUT',
      'PLAN_READY', 'SYNTHESIZE', 'COMPLETE', 'ESCALATE', 'DONE'
    ];
    for (const type of commonEvents) {
      events.push({ type });
    }
  }

  return events;
}

/**
 * Get state configuration from nested state value
 */
function getStateConfig(states, stateValue) {
  if (typeof stateValue === 'string') {
    return states[stateValue];
  }
  // Handle nested states
  if (typeof stateValue === 'object') {
    const [key] = Object.keys(stateValue);
    const state = states[key];
    if (state && state.states) {
      return getStateConfig(state.states, stateValue[key]);
    }
    return state;
  }
  return null;
}

/**
 * Check invariants across all paths
 * @param {Array} paths - Array of paths from explorePaths
 * @param {Array} invariants - Array of invariant functions
 * @returns {Object} Result with violations and stats
 */
function checkInvariants(paths, invariants) {
  const violations = [];
  const stats = {
    totalPaths: paths.length,
    totalSteps: 0,
    invariantsChecked: invariants.length,
    pathsWithViolations: 0
  };

  for (const path of paths) {
    let pathHasViolation = false;

    for (let stepIndex = 0; stepIndex < path.steps.length; stepIndex++) {
      const step = path.steps[stepIndex];
      stats.totalSteps++;

      for (const invariant of invariants) {
        const result = checkInvariantAtStep(invariant, step, path, stepIndex);

        if (!result.passed) {
          pathHasViolation = true;
          violations.push({
            invariant: invariant.name || 'unnamed',
            message: result.message || 'Invariant violated',
            path: formatPath(path),
            step: stepIndex,
            state: step.toState,
            context: step.context,
            description: invariant.description
          });
        }
      }
    }

    if (pathHasViolation) {
      stats.pathsWithViolations++;
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    stats
  };
}

/**
 * Check a single invariant at a step
 */
function checkInvariantAtStep(invariant, step, path, stepIndex) {
  try {
    const checkFn = typeof invariant === 'function' ? invariant : invariant.check;
    const result = checkFn(step.context, step.toState, { step, path, stepIndex });

    if (typeof result === 'boolean') {
      return { passed: result };
    }
    return result;
  } catch (err) {
    return {
      passed: false,
      message: `Invariant check threw error: ${err.message}`
    };
  }
}

/**
 * Format a path for display
 */
function formatPath(path) {
  return path.steps
    .map((s) => {
      const event = s.event.type !== 'INIT' ? `[${s.event.type}]` : '';
      return event ? `${event} → ${s.toState}` : s.toState;
    })
    .join(' → ');
}

/**
 * Main MBT runner
 * @param {Object} machine - XState machine definition
 * @param {Array} invariants - Array of invariants to check
 * @param {Object} options - Options
 * @returns {Object} Result
 */
async function runMBT(machine, invariants, options = {}) {
  const {
    _verbose = false,
    maxDepth = 50,
    maxPaths = 1000,
    _failFast = false
  } = options;

  // Explore all paths
  const paths = explorePaths(machine, { maxDepth, maxPaths });

  // Check invariants
  const result = checkInvariants(paths, invariants);

  // Add metadata
  result.machine = machine.id || 'unnamed';
  result.paths = paths;
  result.options = options;

  return result;
}

module.exports = {
  runMBT,
  explorePaths,
  checkInvariants,
  formatPath
};
