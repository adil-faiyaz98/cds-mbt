/**
 * cds mbt init
 *
 * Scaffolds MBT test files in the project
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const TEMPLATES = {
  agent: {
    machine: 'agent-orchestrator.machine.js',
    invariants: 'agent.invariants.js',
    test: 'agent.mbt.test.js'
  },
  workflow: {
    machine: 'workflow.machine.js',
    invariants: 'workflow.invariants.js',
    test: 'workflow.mbt.test.js'
  },
  migration: {
    machine: 'migration.machine.js',
    invariants: 'migration.invariants.js',
    test: 'migration.mbt.test.js'
  }
};

async function init(options = {}) {
  const { force = false, template = 'agent' } = options;
  const cwd = process.cwd();

  console.log(chalk.blue('\n🔧 Initializing cds-mbt...\n'));

  const templateConfig = TEMPLATES[template] || TEMPLATES.agent;
  const baseDir = path.join(cwd, 'test', 'mbt');

  // Create directories
  const dirs = [
    baseDir,
    path.join(baseDir, 'machines'),
    path.join(baseDir, 'invariants')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(chalk.green(`✓ Created ${path.relative(cwd, dir)}/`));
    }
  }

  // Copy templates
  const templatesDir = path.join(__dirname, '..', '..', 'templates');

  const files = [
    {
      src: path.join(templatesDir, 'machines', templateConfig.machine),
      dest: path.join(baseDir, 'machines', `${template}.machine.js`)
    },
    {
      src: path.join(templatesDir, 'invariants', templateConfig.invariants),
      dest: path.join(baseDir, 'invariants', `${template}.invariants.js`)
    },
    {
      src: path.join(templatesDir, templateConfig.test),
      dest: path.join(baseDir, `${template}.mbt.test.js`)
    }
  ];

  for (const file of files) {
    if (fs.existsSync(file.dest) && !force) {
      console.log(chalk.yellow(`⚠ Skipped ${path.relative(cwd, file.dest)} (exists, use --force to overwrite)`));
      continue;
    }

    try {
      const content = fs.readFileSync(file.src, 'utf-8');
      fs.writeFileSync(file.dest, content);
      console.log(chalk.green(`✓ Created ${path.relative(cwd, file.dest)}`));
    } catch (err) {
      // Template doesn't exist, create inline
      const content = getInlineTemplate(path.basename(file.src), template);
      fs.writeFileSync(file.dest, content);
      console.log(chalk.green(`✓ Created ${path.relative(cwd, file.dest)}`));
    }
  }

  console.log(chalk.blue('\n📁 MBT scaffolding complete!\n'));
  console.log('Next steps:');
  console.log(chalk.dim(`  1. Edit ${path.relative(cwd, files[0].dest)} to match your agent's state logic`));
  console.log(chalk.dim(`  2. Customize invariants in ${path.relative(cwd, files[1].dest)}`));
  console.log(chalk.dim('  3. Run: ') + chalk.cyan('cds mbt run'));
  console.log();
}

function getInlineTemplate(filename, template) {
  if (filename.includes('.machine.')) {
    return getMachineTemplate(template);
  }
  if (filename.includes('.invariants.')) {
    return getInvariantsTemplate(template);
  }
  if (filename.includes('.test.')) {
    return getTestTemplate(template);
  }
  return '// Template\n';
}

function getMachineTemplate(template) {
  return `/**
 * ${template.charAt(0).toUpperCase() + template.slice(1)} State Machine
 *
 * Define your orchestration logic as an XState machine.
 * MBT will explore all paths through this machine.
 */

const { createMachine, assign } = require('xstate');

const ${template}Machine = createMachine({
  id: '${template}Orchestrator',

  context: {
    // Resource tracking
    llmCallsUsed: 0,
    llmCallsBudget: 10,
    retryCount: {},
    maxRetries: 2,

    // Tool tracking
    requiredTools: ['tool1', 'tool2'],
    toolResults: {},

    // Error handling
    errorReason: null
  },

  initial: 'idle',

  states: {
    idle: {
      on: {
        START: {
          target: 'planning',
          actions: assign({
            llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
          })
        }
      }
    },

    planning: {
      on: {
        PLAN_READY: {
          target: 'executing',
          guard: 'hasBudget'
        },
        NO_BUDGET: {
          target: 'escalated',
          actions: assign({
            errorReason: 'Budget exhausted during planning'
          })
        }
      }
    },

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

        TOOL_FAILURE: {
          guard: 'canRetry',
          actions: [
            assign({
              retryCount: ({ context, event }) => ({
                ...context.retryCount,
                [event.tool]: (context.retryCount[event.tool] || 0) + 1
              }),
              llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
            })
          ]
        },

        ALL_TOOLS_DONE: {
          target: 'synthesizing',
          guard: 'allToolsSucceeded'
        },

        ESCALATE: {
          target: 'escalated',
          actions: assign({
            errorReason: ({ event }) => event.reason || 'Max retries exceeded'
          })
        }
      }
    },

    synthesizing: {
      entry: assign({
        llmCallsUsed: ({ context }) => context.llmCallsUsed + 1
      }),
      on: {
        DONE: {
          target: 'completed',
          guard: 'hasBudget'
        },
        NO_BUDGET: {
          target: 'escalated',
          actions: assign({
            errorReason: 'Budget exhausted during synthesis'
          })
        }
      }
    },

    completed: { type: 'final' },
    escalated: { type: 'final' }
  }
}, {
  guards: {
    hasBudget: ({ context }) => context.llmCallsUsed < context.llmCallsBudget,

    canRetry: ({ context, event }) => {
      const tool = event?.tool || 'unknown';
      const currentRetries = context.retryCount[tool] || 0;
      return currentRetries < context.maxRetries &&
             context.llmCallsUsed < context.llmCallsBudget;
    },

    allToolsSucceeded: ({ context }) =>
      context.requiredTools.every(tool =>
        context.toolResults[tool] === 'success'
      )
  }
});

module.exports = ${template}Machine;
`;
}

function getInvariantsTemplate(template) {
  return `/**
 * Custom Invariants for ${template.charAt(0).toUpperCase() + template.slice(1)}
 *
 * Add project-specific invariants here.
 */

const { createInvariant } = require('cds-mbt');

/**
 * Example: Ensure processing order is maintained
 */
const processingOrderMaintained = createInvariant({
  name: 'processingOrderMaintained',
  description: 'Items must be processed in correct sequence',
  check: (context, state) => {
    // Implement your check logic
    return { passed: true };
  }
});

/**
 * Example: No data loss during transitions
 */
const noDataLoss = createInvariant({
  name: 'noDataLoss',
  description: 'Data must not be lost between states',
  check: (context, state) => {
    // Implement your check logic
    return { passed: true };
  }
});

module.exports = {
  processingOrderMaintained,
  noDataLoss,

  // Export as array for easy use
  all: [
    processingOrderMaintained,
    noDataLoss
  ]
};
`;
}

function getTestTemplate(template) {
  return `/**
 * MBT Tests for ${template.charAt(0).toUpperCase() + template.slice(1)}
 */

const { runMBT, invariants } = require('cds-mbt');
const ${template}Machine = require('./machines/${template}.machine');
const customInvariants = require('./invariants/${template}.invariants');

describe('${template.charAt(0).toUpperCase() + template.slice(1)} Orchestration MBT', () => {

  it('respects budget across all paths', async () => {
    const result = await runMBT(${template}Machine, [
      invariants.budgetRespected
    ]);

    console.log(\`Explored \${result.stats.totalPaths} paths\`);
    expect(result.violations).toHaveLength(0);
  });

  it('bounds retries across all paths', async () => {
    const result = await runMBT(${template}Machine, [
      invariants.retriesBounded
    ]);

    expect(result.violations).toHaveLength(0);
  });

  it('never completes with failed tools', async () => {
    const result = await runMBT(${template}Machine, [
      invariants.noInvalidCompletion
    ]);

    expect(result.violations).toHaveLength(0);
  });

  it('always has escalation reason', async () => {
    const result = await runMBT(${template}Machine, [
      invariants.escalationHasReason
    ]);

    expect(result.violations).toHaveLength(0);
  });

  it('passes all agent invariants', async () => {
    const result = await runMBT(${template}Machine, invariants.all);

    if (result.violations.length > 0) {
      console.log('Violations found:');
      result.violations.forEach(v => {
        console.log(\`  - \${v.invariant}: \${v.message}\`);
        console.log(\`    Path: \${v.path}\`);
      });
    }

    expect(result.passed).toBe(true);
  });

  it('passes custom invariants', async () => {
    const result = await runMBT(${template}Machine, customInvariants.all);

    expect(result.violations).toHaveLength(0);
  });
});
`;
}

module.exports = init;
