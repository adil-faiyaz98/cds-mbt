/**
 * Runtime Adapter for Joule Agents
 *
 * Connects to running agents for live validation
 * Uses event emitter pattern for state change notifications
 */

const EventEmitter = require('events');

/**
 * @typedef {Object} StateChangeEvent
 * @property {string} previousState - State before transition
 * @property {string} currentState - Current state after transition
 * @property {Object} context - Current machine context
 * @property {Object} event - Event that caused the transition
 * @property {number} timestamp - When the transition occurred
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether all invariants passed
 * @property {Array} passed - List of passing invariant names
 * @property {Array} failed - List of failed invariants with details
 * @property {Array} skipped - List of skipped invariants
 */

/**
 * Runtime Adapter for connecting to running agents
 *
 * Provides live validation and state monitoring capabilities
 * for agents during execution.
 *
 * @extends EventEmitter
 *
 * @example
 * const adapter = new RuntimeAdapter();
 * adapter.attach(myAgent);
 * adapter.onStateChange((event) => {
 *   console.log('State changed:', event.currentState);
 * });
 * const result = adapter.validateCurrent([budgetRespected]);
 */
class RuntimeAdapter extends EventEmitter {
  /**
   * Create a new RuntimeAdapter
   * @param {Object} [options] - Configuration options
   * @param {boolean} [options.autoValidate=false] - Auto-validate on state changes
   * @param {Array} [options.invariants=[]] - Default invariants for auto-validation
   * @param {boolean} [options.recordHistory=true] - Keep state transition history
   * @param {number} [options.maxHistorySize=1000] - Max history entries to keep
   */
  constructor(options = {}) {
    super();

    const {
      autoValidate = false,
      invariants = [],
      recordHistory = true,
      maxHistorySize = 1000
    } = options;

    /** @private */
    this._agent = null;
    /** @private */
    this._subscription = null;
    /** @private */
    this._autoValidate = autoValidate;
    /** @private */
    this._invariants = invariants;
    /** @private */
    this._recordHistory = recordHistory;
    /** @private */
    this._maxHistorySize = maxHistorySize;
    /** @private */
    this._history = [];
    /** @private */
    this._currentState = null;
    /** @private */
    this._currentContext = null;
    /** @private */
    this._stateChangeCallbacks = [];
    /** @private */
    this._validationCallbacks = [];
    /** @private */
    this._attached = false;
  }

  /**
   * Check if adapter is attached to an agent
   * @returns {boolean} True if attached
   */
  get isAttached() {
    return this._attached;
  }

  /**
   * Get current state
   * @returns {string|null} Current state or null if not attached
   */
  get currentState() {
    return this._currentState;
  }

  /**
   * Get current context
   * @returns {Object|null} Current context or null if not attached
   */
  get currentContext() {
    return this._currentContext;
  }

  /**
   * Get state transition history
   * @returns {Array} Array of state transitions
   */
  get history() {
    return [...this._history];
  }

  /**
   * Attach to a running agent instance
   *
   * The agent should emit state change events or have a subscribe method.
   * Supports XState actors, EventEmitter-based agents, and callback-style agents.
   *
   * @param {Object} agentInstance - The agent to attach to
   * @throws {Error} If already attached or agent is invalid
   */
  attach(agentInstance) {
    if (this._attached) {
      throw new Error('Already attached to an agent. Call detach() first.');
    }

    if (!agentInstance) {
      throw new Error('Agent instance is required');
    }

    this._agent = agentInstance;
    this._attached = true;
    this._history = [];

    // Try different attachment strategies
    if (typeof agentInstance.subscribe === 'function') {
      // XState actor pattern
      this._subscription = agentInstance.subscribe((snapshot) => {
        this._handleStateChange(snapshot);
      });
    } else if (typeof agentInstance.on === 'function') {
      // EventEmitter pattern
      this._stateHandler = event => this._handleStateChange(event);
      agentInstance.on('stateChange', this._stateHandler);
      agentInstance.on('transition', this._stateHandler);
    } else if (typeof agentInstance.onStateChange === 'function') {
      // Callback pattern
      this._subscription = agentInstance.onStateChange((state, context, event) => {
        this._handleStateChange({ value: state, context, event });
      });
    }

    // Get initial state if available
    if (agentInstance.getSnapshot) {
      const snapshot = agentInstance.getSnapshot();
      this._currentState = this._extractStateName(snapshot.value);
      this._currentContext = snapshot.context;
    } else if (agentInstance.state) {
      this._currentState = this._extractStateName(agentInstance.state);
      this._currentContext = agentInstance.context || {};
    }

    this.emit('attached', { agent: agentInstance });
  }

  /**
   * Detach from the current agent
   *
   * Removes all subscriptions and clears the agent reference.
   * Does not affect the agent's execution.
   */
  detach() {
    if (!this._attached) {
      return;
    }

    // Clean up subscriptions
    if (this._subscription) {
      if (typeof this._subscription === 'function') {
        this._subscription();
      } else if (typeof this._subscription.unsubscribe === 'function') {
        this._subscription.unsubscribe();
      }
      this._subscription = null;
    }

    // Clean up EventEmitter listeners
    if (this._agent && this._stateHandler) {
      if (typeof this._agent.off === 'function') {
        this._agent.off('stateChange', this._stateHandler);
        this._agent.off('transition', this._stateHandler);
      } else if (typeof this._agent.removeListener === 'function') {
        this._agent.removeListener('stateChange', this._stateHandler);
        this._agent.removeListener('transition', this._stateHandler);
      }
      this._stateHandler = null;
    }

    const agent = this._agent;
    this._agent = null;
    this._attached = false;
    this._currentState = null;
    this._currentContext = null;

    this.emit('detached', { agent });
  }

  /**
   * Register a callback for state changes
   *
   * @param {Function} callback - Called with StateChangeEvent on each transition
   * @returns {Function} Unsubscribe function
   *
   * @example
   * const unsubscribe = adapter.onStateChange((event) => {
   *   console.log(`${event.previousState} -> ${event.currentState}`);
   * });
   * // Later: unsubscribe();
   */
  onStateChange(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    this._stateChangeCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this._stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this._stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Validate current state against invariants
   *
   * @param {Array} [invariants] - Invariants to check (defaults to constructor invariants)
   * @returns {ValidationResult} Validation results
   *
   * @example
   * const result = adapter.validateCurrent([budgetRespected, retriesBounded]);
   * if (!result.valid) {
   *   console.error('Violations:', result.failed);
   * }
   */
  validateCurrent(invariants) {
    const checksToRun = invariants || this._invariants;

    if (!checksToRun || checksToRun.length === 0) {
      return {
        valid: true,
        passed: [],
        failed: [],
        skipped: [],
        message: 'No invariants to validate'
      };
    }

    if (!this._attached) {
      return {
        valid: false,
        passed: [],
        failed: [{ name: '_adapter', message: 'Not attached to any agent' }],
        skipped: []
      };
    }

    const passed = [];
    const failed = [];
    const skipped = [];

    for (const invariant of checksToRun) {
      try {
        const result = invariant.check(
          this._currentContext || {},
          this._currentState,
          { history: this._history }
        );

        const checkPassed = typeof result === 'boolean' ? result : result.passed;
        const isSkipped = result && result.skipped;

        if (isSkipped) {
          skipped.push({
            name: invariant.name,
            message: result.message || 'Skipped'
          });
        } else if (checkPassed) {
          passed.push(invariant.name);
        } else {
          failed.push({
            name: invariant.name,
            message: result.message || `${invariant.name} violated`,
            severity: invariant.severity || 'error',
            category: invariant.category || 'custom'
          });
        }
      } catch (error) {
        failed.push({
          name: invariant.name,
          message: `Check threw error: ${error.message}`,
          severity: 'error',
          category: 'runtime'
        });
      }
    }

    const validationResult = {
      valid: failed.length === 0,
      passed,
      failed,
      skipped,
      state: this._currentState,
      timestamp: Date.now()
    };

    // Notify validation callbacks
    for (const callback of this._validationCallbacks) {
      try {
        callback(validationResult);
      } catch (e) {
        // Ignore callback errors
      }
    }

    this.emit('validation', validationResult);

    return validationResult;
  }

  /**
   * Register a callback for validation results
   *
   * @param {Function} callback - Called with ValidationResult after each validation
   * @returns {Function} Unsubscribe function
   */
  onValidation(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    this._validationCallbacks.push(callback);

    return () => {
      const index = this._validationCallbacks.indexOf(callback);
      if (index > -1) {
        this._validationCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Enable or disable auto-validation on state changes
   *
   * @param {boolean} enabled - Whether to auto-validate
   * @param {Array} [invariants] - Invariants to use for auto-validation
   */
  setAutoValidate(enabled, invariants) {
    this._autoValidate = enabled;
    if (invariants) {
      this._invariants = invariants;
    }
  }

  /**
   * Clear state history
   */
  clearHistory() {
    this._history = [];
  }

  /**
   * Handle state changes from the attached agent
   * @private
   */
  _handleStateChange(snapshot) {
    const previousState = this._currentState;
    const _previousContext = this._currentContext;

    // Extract state and context from snapshot
    if (snapshot.value !== undefined) {
      this._currentState = this._extractStateName(snapshot.value);
      this._currentContext = snapshot.context || this._currentContext;
    } else if (snapshot.state !== undefined) {
      this._currentState = this._extractStateName(snapshot.state);
      this._currentContext = snapshot.context || this._currentContext;
    } else if (typeof snapshot === 'string') {
      this._currentState = snapshot;
    }

    const event = {
      previousState,
      currentState: this._currentState,
      context: this._currentContext,
      event: snapshot.event || snapshot._event || null,
      timestamp: Date.now()
    };

    // Record in history
    if (this._recordHistory) {
      this._history.push(event);

      // Trim history if needed
      if (this._history.length > this._maxHistorySize) {
        this._history = this._history.slice(-this._maxHistorySize);
      }
    }

    // Notify callbacks
    for (const callback of this._stateChangeCallbacks) {
      try {
        callback(event);
      } catch (e) {
        // Ignore callback errors
      }
    }

    this.emit('stateChange', event);

    // Auto-validate if enabled
    if (this._autoValidate && this._invariants.length > 0) {
      this.validateCurrent();
    }
  }

  /**
   * Extract state name from XState state value
   * @private
   */
  _extractStateName(stateValue) {
    if (typeof stateValue === 'string') {
      return stateValue;
    }
    if (typeof stateValue === 'object' && stateValue !== null) {
      // Handle nested states - return the deepest active state
      const keys = Object.keys(stateValue);
      if (keys.length === 1) {
        return `${keys[0]}.${this._extractStateName(stateValue[keys[0]])}`;
      }
      return keys.join(',');
    }
    return String(stateValue);
  }
}

module.exports = {
  RuntimeAdapter
};
