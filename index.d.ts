// Type definitions for cds-mbt
// Project: https://github.com/adil-faiyaz98/cds-mbt
// Definitions by: Adil Faiyaz

import { StateMachine, AnyStateMachine } from 'xstate';

export const version: string;

// ============================================================================
// Core Types
// ============================================================================

export interface MBTOptions {
  /** Enable verbose logging */
  verbose?: boolean;
  /** Maximum path depth to explore (default: 50) */
  maxDepth?: number;
  /** Maximum number of paths to explore (default: 1000) */
  maxPaths?: number;
  /** Stop on first violation (default: false) */
  failFast?: boolean;
}

export interface ExploreOptions {
  /** Maximum path depth (default: 50) */
  maxDepth?: number;
  /** Maximum paths to find (default: 1000) */
  maxPaths?: number;
  /** Stop path when loop detected (default: true) */
  stopOnLoop?: boolean;
}

export interface Step {
  event: { type: string; [key: string]: any };
  fromState: string | null;
  toState: string;
  context: Record<string, any>;
}

export interface Path {
  machine: string;
  steps: Step[];
  hasLoop: boolean;
}

export interface Violation {
  invariant: string;
  message: string;
  path: string;
  step: number;
  state: string;
  context: Record<string, any>;
  description: string;
}

export interface MBTStats {
  totalPaths: number;
  totalSteps: number;
  invariantsChecked: number;
  pathsWithViolations: number;
}

export interface MBTResult {
  passed: boolean;
  violations: Violation[];
  stats: MBTStats;
  machine: string;
  paths: Path[];
  options: MBTOptions;
}

export interface InvariantResult {
  passed: boolean;
  violations: Violation[];
  stats: MBTStats;
}

// ============================================================================
// Invariant Types
// ============================================================================

export interface CheckMeta {
  step: Step;
  path: Path;
  stepIndex: number;
}

export interface CheckResult {
  passed: boolean;
  message?: string;
  skipped?: boolean;
}

export type CheckFunction = (
  context: Record<string, any>,
  state: string,
  meta?: CheckMeta
) => CheckResult;

export interface InvariantConfig {
  name: string;
  description?: string;
  check: CheckFunction;
  severity?: 'error' | 'warning';
  category?: string;
}

export interface Invariant extends InvariantConfig {
  name: string;
  description: string;
  check: CheckFunction;
  severity: 'error' | 'warning';
  category: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Main entry point for running Model-Based Testing.
 */
export function runMBT(
  machine: AnyStateMachine | Record<string, any>,
  invariants: Invariant[],
  options?: MBTOptions
): Promise<MBTResult>;

/**
 * Explore all reachable paths through a state machine.
 */
export function explorePaths(
  machine: AnyStateMachine | Record<string, any>,
  options?: ExploreOptions
): Path[];

/**
 * Check invariants across a set of paths.
 */
export function checkInvariants(
  paths: Path[],
  invariants: Invariant[]
): InvariantResult;

// ============================================================================
// Invariant Helpers
// ============================================================================

/**
 * Create a named invariant with metadata.
 */
export function createInvariant(config: InvariantConfig): Invariant;

/**
 * Validate an invariant definition.
 */
export function validateInvariant(invariant: Invariant): ValidationResult;

// ============================================================================
// Built-in Invariants
// ============================================================================

export namespace invariants {
  /** LLM calls must not exceed budget */
  const budgetRespected: Invariant;
  /** Retries per tool must not exceed max */
  const retriesBounded: Invariant;
  /** Cannot complete without required tool success */
  const noInvalidCompletion: Invariant;
  /** Escalated state must have error reason */
  const escalationHasReason: Invariant;
}

// ============================================================================
// Machine Templates
// ============================================================================

export namespace machines {
  function createAgentMachine(config?: Record<string, any>): AnyStateMachine;
  function createWorkflowMachine(config?: Record<string, any>): AnyStateMachine;
  function createMigrationMachine(config?: Record<string, any>): AnyStateMachine;
}

export function createAgentMachine(config?: Record<string, any>): AnyStateMachine;
export function createWorkflowMachine(config?: Record<string, any>): AnyStateMachine;
export function createMigrationMachine(config?: Record<string, any>): AnyStateMachine;

// ============================================================================
// Report Generation
// ============================================================================

export interface ReportOptions {
  /** Output file path (default: './test/reports/mbt-report.html') */
  output?: string;
  /** Report title (default: 'MBT Report') */
  title?: string;
  /** Show all explored paths (default: true) */
  includePathVisualization?: boolean;
}

export interface ReportResult {
  path: string;
}

/**
 * Generate an HTML report from MBT results.
 */
export function generateReport(
  result: MBTResult,
  options?: ReportOptions
): Promise<ReportResult>;

// ============================================================================
// CDS Integration
// ============================================================================

export class MbtService {
  constructor(options?: Record<string, any>);
  run(machine: AnyStateMachine, invariants?: Invariant[]): Promise<MBTResult>;
}

// ============================================================================
// Joule Module
// ============================================================================

export interface ReActConfig {
  id?: string;
  maxIterations?: number;
  budget?: number;
  tools?: string[];
  additionalStates?: Record<string, any>;
  additionalGuards?: Record<string, any>;
  additionalActions?: Record<string, any>;
}

export interface ReActContext {
  iteration: number;
  maxIterations: number;
  llmCallsUsed: number;
  llmCallsBudget: number;
  observations: any[];
  thoughts: any[];
  actions: any[];
  toolResults: Record<string, any>;
  availableTools: string[];
  finalAnswer: any | null;
  errorReason: string | null;
}

export interface A2AConfig {
  id?: string;
  protocol?: string;
  timeout?: number;
  maxNegotiations?: number;
}

export interface HITLConfig {
  id?: string;
  approvers?: string[];
  requiredApprovals?: number;
  timeout?: number;
  allowEscalation?: boolean;
}

export interface SubagentConfig {
  id?: string;
  maxSubagents?: number;
  timeout?: number;
  strategy?: 'parallel' | 'sequential' | 'race';
}

export interface ServiceDefinition {
  name: string;
  actions?: string[];
  hitlActions?: string[];
  tools?: string[];
  budget?: number;
  maxRetries?: number;
}

export interface StateChangeEvent {
  previousState: string;
  currentState: string;
  context: Record<string, any>;
  event: Record<string, any> | null;
  timestamp: number;
}

export interface RuntimeValidationResult {
  valid: boolean;
  passed: string[];
  failed: Array<{ name: string; message: string; severity: string }>;
  skipped: Array<{ name: string; message: string }>;
  state: string;
  timestamp: number;
}

export interface RuntimeAdapterOptions {
  autoValidate?: boolean;
  invariants?: Invariant[];
  recordHistory?: boolean;
  maxHistorySize?: number;
}

export class RuntimeAdapter {
  constructor(options?: RuntimeAdapterOptions);
  
  readonly isAttached: boolean;
  readonly currentState: string | null;
  readonly currentContext: Record<string, any> | null;
  readonly history: StateChangeEvent[];
  
  attach(agentInstance: any): void;
  detach(): void;
  onStateChange(callback: (event: StateChangeEvent) => void): () => void;
  validateCurrent(invariants?: Invariant[]): RuntimeValidationResult;
  onValidation(callback: (result: RuntimeValidationResult) => void): () => void;
  setAutoValidate(enabled: boolean, invariants?: Invariant[]): void;
  clearHistory(): void;
}

export namespace joule {
  function extractMachine(cdsFilePath: string): AnyStateMachine;
  function extractFromDefinition(serviceDefinition: ServiceDefinition): AnyStateMachine;
  function createReActMachine(config?: ReActConfig): AnyStateMachine;
  function createA2AMachine(config?: A2AConfig): AnyStateMachine;
  function createHITLMachine(config?: HITLConfig): AnyStateMachine;
  function createSubagentMachine(config?: SubagentConfig): AnyStateMachine;
  const RuntimeAdapter: typeof import('cds-mbt').RuntimeAdapter;
}

// ============================================================================
// TLA+ Module
// ============================================================================

export interface TLASpecOptions {
  moduleName?: string;
}

export interface TLCConfigOptions {
  checkLiveness?: boolean;
}

export interface TLCRunnerOptions {
  tlcPath?: string;
  javaPath?: string;
  tempDir?: string;
}

export interface TLCCheckOptions {
  workers?: number;
  depth?: number;
  configContent?: string;
  timeout?: number;
}

export interface TLCRunOptions {
  workers?: number;
  depth?: number;
  timeout?: number;
  deadlock?: boolean;
}

export interface Counterexample {
  invariant: string | null;
  trace: Array<{ step: number; state: string }>;
}

export interface TLCStats {
  statesGenerated?: number;
  distinctStates?: number;
  depth?: number;
  timeMs?: number;
  timedOut?: boolean;
}

export interface TLCResult {
  passed: boolean | null;
  counterexample: Counterexample | null;
  stats: TLCStats;
  error?: string;
  raw?: string;
}

export class TLCRunner {
  constructor(options?: TLCRunnerOptions);
  
  checkSpec(tlaContent: string, options?: TLCCheckOptions): Promise<TLCResult>;
  runFile(tlaFilePath: string, options?: TLCRunOptions): Promise<TLCResult>;
  
  static getTestSpec(): string;
}

export namespace tla {
  function generateTLASpec(
    machine: AnyStateMachine | Record<string, any>,
    invariants?: Invariant[],
    options?: TLASpecOptions
  ): string;
  
  function generateTLCConfig(
    machine: AnyStateMachine | Record<string, any>,
    invariants?: Invariant[],
    options?: TLCConfigOptions
  ): string;
  
  const TLCRunner: typeof import('cds-mbt').TLCRunner;
}

export function generateTLASpec(
  machine: AnyStateMachine | Record<string, any>,
  invariants?: Invariant[],
  options?: TLASpecOptions
): string;
