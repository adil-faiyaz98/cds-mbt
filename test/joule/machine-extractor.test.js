/**
 * Machine Extractor Tests
 * 
 * Tests for extracting XState machines from CDS service definitions.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  extractMachine,
  extractFromDefinition,
  parseAnnotations,
  buildStates
} = require('../../lib/joule/machine-extractor');

describe('machine-extractor', () => {
  describe('parseAnnotations()', () => {
    it('should detect @agent annotation', () => {
      const content = `
        @agent
        service AgentService {
          action analyze(input: String): String;
        }
      `;

      const annotations = parseAnnotations(content);

      expect(annotations.agent).toBe(true);
    });

    it('should detect @agent annotation with options', () => {
      const content = `
        @agent({ hitl: true })
        service AgentService {
          action analyze(input: String): String;
        }
      `;

      const annotations = parseAnnotations(content);

      expect(annotations.agent).toBe(true);
      expect(annotations.hitl).toContain('approval');
    });

    it('should extract action names', () => {
      const content = `
        @agent
        service AgentService {
          action analyze(input: String): String;
          action summarize(text: String): String;
          action respond(query: String): String;
        }
      `;

      const annotations = parseAnnotations(content);

      expect(annotations.actions).toContain('analyze');
      expect(annotations.actions).toContain('summarize');
      expect(annotations.actions).toContain('respond');
    });

    it('should detect @agent.hitl annotations on actions', () => {
      const content = `
        @agent
        service AgentService {
          @agent.hitl
          action sensitiveAction(data: String): String;
          
          action normalAction(input: String): String;
        }
      `;

      const annotations = parseAnnotations(content);

      expect(annotations.hitl).toContain('sensitiveAction');
      expect(annotations.hitl).not.toContain('normalAction');
    });

    it('should extract tool references', () => {
      const content = `
        @agent
        service AgentService {
          @tool('searchTool')
          action search(query: String): String;
          
          @tool('calculatorTool')
          action calculate(expression: String): Number;
        }
      `;

      const annotations = parseAnnotations(content);

      expect(annotations.tools).toContain('searchTool');
      expect(annotations.tools).toContain('calculatorTool');
    });

    it('should return false for non-agent services', () => {
      const content = `
        service RegularService {
          entity Users { key ID: UUID; name: String; }
        }
      `;

      const annotations = parseAnnotations(content);

      expect(annotations.agent).toBe(false);
    });
  });

  describe('buildStates()', () => {
    it('should build basic state structure', () => {
      const annotations = {
        agent: true,
        hitl: [],
        actions: ['doSomething'],
        tools: []
      };

      const states = buildStates(annotations);

      expect(states.idle).toBeDefined();
      expect(states.planning).toBeDefined();
      expect(states.executing).toBeDefined();
      expect(states.completed).toBeDefined();
      expect(states.escalated).toBeDefined();
    });

    it('should add action transitions to executing state', () => {
      const annotations = {
        agent: true,
        hitl: [],
        actions: ['analyze', 'respond'],
        tools: []
      };

      const states = buildStates(annotations);

      expect(states.executing.on.EXECUTE_ANALYZE).toBeDefined();
      expect(states.executing.on.EXECUTE_RESPOND).toBeDefined();
    });

    it('should add HITL approval states for hitl actions', () => {
      const annotations = {
        agent: true,
        hitl: ['sensitiveAction'],
        actions: ['sensitiveAction', 'normalAction'],
        tools: []
      };

      const states = buildStates(annotations);

      // HITL action should transition to approval state
      expect(states.executing.on.EXECUTE_SENSITIVEACTION.target).toBe('pending_approval_sensitiveAction');
      
      // Normal action should stay in executing
      expect(states.executing.on.EXECUTE_NORMALACTION.target).toBe('executing');

      // Approval state should exist
      expect(states.pending_approval_sensitiveAction).toBeDefined();
      expect(states.pending_approval_sensitiveAction.on.APPROVE).toBeDefined();
      expect(states.pending_approval_sensitiveAction.on.REJECT).toBeDefined();
    });

    it('should include completion and escalation transitions', () => {
      const annotations = {
        agent: true,
        hitl: [],
        actions: [],
        tools: []
      };

      const states = buildStates(annotations);

      expect(states.executing.on.COMPLETE).toBe('completed');
      expect(states.executing.on.ESCALATE).toBe('escalated');
    });

    it('should mark final states correctly', () => {
      const annotations = {
        agent: true,
        hitl: [],
        actions: [],
        tools: []
      };

      const states = buildStates(annotations);

      expect(states.completed.type).toBe('final');
      expect(states.escalated.type).toBe('final');
    });
  });

  describe('extractFromDefinition()', () => {
    it('should create machine from service definition object', () => {
      const definition = {
        name: 'TestAgent',
        actions: ['analyze', 'respond'],
        hitlActions: ['sensitiveOp'],
        tools: ['searchTool'],
        budget: 15,
        maxRetries: 5
      };

      const machine = extractFromDefinition(definition);

      expect(machine).toBeDefined();
      expect(machine.id).toBe('agent_TestAgent');
    });

    it('should set correct context from definition', () => {
      const definition = {
        name: 'BudgetedAgent',
        actions: [],
        budget: 20,
        maxRetries: 3
      };

      const machine = extractFromDefinition(definition);
      const snapshot = machine.getInitialSnapshot();

      expect(snapshot.context.llmCallsBudget).toBe(20);
      expect(snapshot.context.maxRetries).toBe(3);
    });

    it('should use default values when not specified', () => {
      const definition = {
        name: 'DefaultAgent',
        actions: []
      };

      const machine = extractFromDefinition(definition);
      const snapshot = machine.getInitialSnapshot();

      expect(snapshot.context.llmCallsBudget).toBe(10);
      expect(snapshot.context.maxRetries).toBe(3);
    });

    it('should create machine with guards', () => {
      const definition = {
        name: 'GuardedAgent',
        actions: ['action1']
      };

      const machine = extractFromDefinition(definition);

      // Machine should have guards defined
      expect(machine.implementations.guards.hasBudget).toBeDefined();
      expect(machine.implementations.guards.canRetry).toBeDefined();
    });

    it('should handle string action names', () => {
      const definition = {
        name: 'StringActions',
        actions: ['action1', 'action2']
      };

      const machine = extractFromDefinition(definition);
      const config = machine.config;

      expect(config.states.executing.on.EXECUTE_ACTION1).toBeDefined();
      expect(config.states.executing.on.EXECUTE_ACTION2).toBeDefined();
    });

    it('should handle action objects with name property', () => {
      const definition = {
        name: 'ObjectActions',
        actions: [
          { name: 'analyze', description: 'Analyze data' },
          { name: 'report', description: 'Generate report' }
        ]
      };

      const machine = extractFromDefinition(definition);
      const config = machine.config;

      expect(config.states.executing.on.EXECUTE_ANALYZE).toBeDefined();
      expect(config.states.executing.on.EXECUTE_REPORT).toBeDefined();
    });
  });

  describe('extractMachine()', () => {
    let tempDir;
    let tempFile;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cds-mbt-test-'));
    });

    afterAll(() => {
      // Cleanup temp files
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should extract machine from CDS file with @agent', () => {
      const cdsContent = `
        @agent
        service AnalyzerService {
          action analyze(input: String): String;
        }
      `;

      tempFile = path.join(tempDir, 'analyzer.cds');
      fs.writeFileSync(tempFile, cdsContent);

      const machine = extractMachine(tempFile);

      expect(machine).toBeDefined();
      expect(machine.id).toBe('agent_analyzer');
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        extractMachine('/non/existent/file.cds');
      }).toThrow('Failed to read CDS file');
    });

    it('should throw error for CDS file without @agent', () => {
      const cdsContent = `
        service RegularService {
          entity Data { key ID: UUID; }
        }
      `;

      tempFile = path.join(tempDir, 'regular.cds');
      fs.writeFileSync(tempFile, cdsContent);

      expect(() => {
        extractMachine(tempFile);
      }).toThrow('does not contain @agent annotation');
    });

    it('should extract with HITL actions', () => {
      const cdsContent = `
        @agent({ hitl: true })
        service ApprovalService {
          @agent.hitl
          action sensitiveOp(data: String): String;
        }
      `;

      tempFile = path.join(tempDir, 'approval.cds');
      fs.writeFileSync(tempFile, cdsContent);

      const machine = extractMachine(tempFile);
      const config = machine.config;

      // Should have approval state
      expect(config.states.pending_approval_sensitiveOp).toBeDefined();
    });

    it('should set default context values', () => {
      const cdsContent = `
        @agent
        service SimpleService {
          action doIt(): String;
        }
      `;

      tempFile = path.join(tempDir, 'simple.cds');
      fs.writeFileSync(tempFile, cdsContent);

      const machine = extractMachine(tempFile);
      const snapshot = machine.getInitialSnapshot();

      expect(snapshot.context.llmCallsUsed).toBe(0);
      expect(snapshot.context.llmCallsBudget).toBe(10);
      expect(snapshot.context.toolResults).toEqual({});
    });
  });
});
