/**
 * cds mbt extract
 *
 * Extracts state machine definitions from CAP agent services.
 * Uses the joule/machine-extractor to parse @agent service annotations.
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { extractMachine, extractFromDefinition } = require('../joule/machine-extractor');

/**
 * Extract machine from a CAP agent service
 * @param {Object} options - Command options
 * @param {string} options.service - Service name or path
 * @param {string} options.output - Output file path
 * @param {string} options.format - Output format ('js' or 'json')
 * @param {boolean} options.verbose - Show detailed output
 * @returns {Promise<number>} Exit code
 */
async function extract(options = {}) {
  const {
    service,
    output,
    format = 'js',
    verbose = false
  } = options;

  console.log(chalk.blue('\n🔍 cds-mbt extract'));
  console.log(chalk.dim('━'.repeat(50)));

  const cwd = process.cwd();

  // Determine service source
  let servicePath = service;
  if (!servicePath) {
    // Default: look for common agent service locations
    const defaultPaths = [
      path.join(cwd, 'srv', 'agent-service.cds'),
      path.join(cwd, 'srv', 'agent-service.js'),
      path.join(cwd, 'srv', 'agent.cds'),
      path.join(cwd, 'srv', 'ai-service.cds')
    ];

    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        servicePath = p;
        break;
      }
    }
  }

  if (!servicePath || !fs.existsSync(servicePath)) {
    console.log(chalk.yellow('\n⚠ No service file specified or found'));
    console.log(chalk.dim('  Use --service option to specify the service file path'));
    console.log(chalk.dim('  Example: cds mbt extract --service srv/agent-service.cds\n'));
    return 1;
  }

  console.log(chalk.white(`Service: ${chalk.bold(path.relative(cwd, servicePath))}`));

  try {
    // Read and parse service file
    const serviceContent = fs.readFileSync(servicePath, 'utf-8');

    let machine;
    if (servicePath.endsWith('.cds')) {
      // Extract from CDS definition
      if (verbose) {
        console.log(chalk.dim('\n  Parsing CDS definition...'));
      }
      machine = extractFromDefinition(serviceContent, { filename: servicePath });
    } else {
      // Extract from JavaScript service
      if (verbose) {
        console.log(chalk.dim('\n  Analyzing JavaScript service...'));
      }
      machine = extractMachine(servicePath, { verbose });
    }

    if (!machine) {
      console.log(chalk.yellow('\n⚠ No state machine found in service'));
      console.log(chalk.dim('  Ensure the service has @agent annotations or XState machine export\n'));
      return 1;
    }

    // Determine output path
    const outputPath = output || path.join(
      cwd,
      'test',
      'mbt',
      'machines',
      `${path.basename(servicePath, path.extname(servicePath))}.machine.${format === 'json' ? 'json' : 'js'}`
    );

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    let content;
    if (format === 'json') {
      content = JSON.stringify(machine, null, 2);
    } else {
      content = generateMachineFile(machine, path.basename(servicePath, path.extname(servicePath)));
    }

    fs.writeFileSync(outputPath, content, 'utf-8');

    console.log(chalk.green(`\n✓ Machine extracted to ${path.relative(cwd, outputPath)}`));

    if (verbose && machine.states) {
      console.log(chalk.dim(`\n  States: ${Object.keys(machine.states).join(', ')}`));
      console.log(chalk.dim(`  Initial: ${machine.initial}`));
    }

    console.log(chalk.blue('\n📁 Next steps:'));
    console.log(chalk.dim('  1. Review the extracted machine'));
    console.log(chalk.dim('  2. Add invariants: cds mbt init'));
    console.log(chalk.dim('  3. Run MBT tests: cds mbt run\n'));

    return 0;

  } catch (err) {
    console.log(chalk.red(`\n✗ Extraction failed: ${err.message}`));
    if (verbose) {
      console.log(chalk.dim(err.stack));
    }
    return 1;
  }
}

/**
 * Generate a JavaScript machine file from extracted configuration
 * @param {Object} machine - Machine configuration
 * @param {string} name - Machine name
 * @returns {string} JavaScript file content
 */
function generateMachineFile(machine, name) {
  const machineName = name.replace(/[^a-zA-Z0-9]/g, '_');
  const machineId = machine.id || machineName;

  return `/**
 * ${machineId} State Machine
 *
 * Auto-extracted from service definition.
 * Review and customize as needed.
 */

const { createMachine, assign } = require('xstate');

const ${machineName}Machine = createMachine(${JSON.stringify(machine, null, 2)});

module.exports = ${machineName}Machine;
`;
}

module.exports = extract;
