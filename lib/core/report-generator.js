/**
 * Report Generator
 *
 * Generates HTML reports from MBT results
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate an HTML report from MBT results
 * @param {Object} result - Result from runMBT
 * @param {Object} options - Report options
 */
async function generateReport(result, options = {}) {
  const {
    output = './test/reports/mbt-report.html',
    title = 'MBT Report',
    includePathVisualization = true
  } = options;

  const html = buildHtml(result, { title, includePathVisualization });

  // Ensure directory exists
  const dir = path.dirname(output);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(output, html);

  return { path: output };
}

/**
 * Build HTML content
 */
function buildHtml(result, options) {
  const { title, includePathVisualization } = options;
  const { passed, violations, stats, machine, paths } = result;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${machine}</title>
  <style>
    :root {
      --success: #10b981;
      --error: #ef4444;
      --warning: #f59e0b;
      --bg: #0f172a;
      --bg-secondary: #1e293b;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --border: #334155;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }

    .container { max-width: 1200px; margin: 0 auto; }

    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    h2 {
      font-size: 1.25rem;
      margin: 2rem 0 1rem;
      color: var(--text-muted);
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .status.passed { background: rgba(16, 185, 129, 0.2); color: var(--success); }
    .status.failed { background: rgba(239, 68, 68, 0.2); color: var(--error); }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }

    .stat {
      background: var(--bg-secondary);
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--success);
    }

    .stat-value.error { color: var(--error); }

    .stat-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    }

    .violations {
      background: var(--bg-secondary);
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      overflow: hidden;
    }

    .violation {
      padding: 1rem;
      border-bottom: 1px solid var(--border);
    }

    .violation:last-child { border-bottom: none; }

    .violation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .violation-name {
      font-weight: 600;
      color: var(--error);
    }

    .violation-step {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .violation-message {
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .violation-path {
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
      background: var(--bg);
      padding: 0.5rem;
      border-radius: 0.25rem;
      overflow-x: auto;
    }

    .paths {
      background: var(--bg-secondary);
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      max-height: 400px;
      overflow-y: auto;
    }

    .path {
      padding: 0.5rem 1rem;
      font-family: monospace;
      font-size: 0.75rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .path:last-child { border-bottom: none; }

    .path-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
    }

    .path-indicator.error { background: var(--error); }

    .timestamp {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 2rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>
      MBT Report: ${machine}
      <span class="status ${passed ? 'passed' : 'failed'}">
        ${passed ? '✓ PASSED' : '✗ FAILED'}
      </span>
    </h1>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${stats.totalPaths}</div>
        <div class="stat-label">Paths Explored</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.totalSteps}</div>
        <div class="stat-label">Total Steps</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.invariantsChecked}</div>
        <div class="stat-label">Invariants Checked</div>
      </div>
      <div class="stat">
        <div class="stat-value ${violations.length > 0 ? 'error' : ''}">${violations.length}</div>
        <div class="stat-label">Violations Found</div>
      </div>
    </div>

    ${violations.length > 0 ? `
    <h2>Violations</h2>
    <div class="violations">
      ${violations.map(v => `
        <div class="violation">
          <div class="violation-header">
            <span class="violation-name">${v.invariant}</span>
            <span class="violation-step">Step ${v.step}</span>
          </div>
          <div class="violation-message">${v.message}</div>
          <div class="violation-path">${v.path}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${includePathVisualization && paths ? `
    <h2>All Paths (${paths.length})</h2>
    <div class="paths">
      ${paths.slice(0, 100).map((p) => {
    const hasViolation = violations.some(v => v.path === formatPathSimple(p));
    return `
        <div class="path">
          <span class="path-indicator ${hasViolation ? 'error' : ''}"></span>
          <span>${formatPathSimple(p)}</span>
        </div>
        `;
  }).join('')}
      ${paths.length > 100 ? `<div class="path">... and ${paths.length - 100} more paths</div>` : ''}
    </div>
    ` : ''}

    <div class="timestamp">
      Generated: ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;
}

function formatPathSimple(path) {
  return path.steps
    .map(s => s.toState)
    .filter(Boolean)
    .join(' → ');
}

module.exports = {
  generateReport
};
