/**
 * Approval Service Definition
 * 
 * Multi-step approval workflow with human-in-the-loop (HITL) patterns.
 * Supports configurable approval chains, delegation, and escalation.
 */

using { approval } from '../db/schema';

@path: '/approvals'
service ApprovalService {
  
  /**
   * Entity views
   */
  entity Requests as projection on approval.Requests;
  @readonly entity Approvers as projection on approval.Approvers;
  @readonly entity ApprovalSteps as projection on approval.ApprovalSteps;
  @readonly entity ApprovalChains as projection on approval.ApprovalChains;
  @readonly entity AuditLog as projection on approval.AuditLog;
  
  /**
   * Submit a request for approval
   * Triggers the approval workflow based on request type and amount
   */
  action submitRequest(
    requestId : UUID @mandatory
  ) returns {
    success : Boolean;
    message : String;
    currentLevel : Integer;
    pendingApprover : String;
  };
  
  /**
   * Approve a request at the current level
   * Advances to next approver or completes if final
   * 
   * @hitl - Human-in-the-loop action
   */
  @hitl
  action approve(
    requestId : UUID @mandatory,
    comments : String
  ) returns {
    success : Boolean;
    message : String;
    isComplete : Boolean;
    nextApprover : String;
  };
  
  /**
   * Reject a request with reason
   * 
   * @hitl - Human-in-the-loop action
   */
  @hitl
  action reject(
    requestId : UUID @mandatory,
    reason : String @mandatory
  ) returns {
    success : Boolean;
    message : String;
  };
  
  /**
   * Escalate a request to a higher authority
   * Bypasses normal approval chain for urgent cases
   * 
   * @hitl - Human-in-the-loop action
   */
  @hitl
  action escalate(
    requestId : UUID @mandatory,
    reason : String @mandatory,
    targetApproverId : UUID
  ) returns {
    success : Boolean;
    message : String;
    escalatedTo : String;
  };
  
  /**
   * Delegate approval to another approver
   * 
   * @hitl - Human-in-the-loop action
   */
  @hitl
  action delegate(
    requestId : UUID @mandatory,
    toApproverId : UUID @mandatory,
    reason : String
  ) returns {
    success : Boolean;
    message : String;
    delegatedTo : String;
  };
  
  /**
   * Recall a submitted request (before any approval)
   */
  action recallRequest(
    requestId : UUID @mandatory,
    reason : String
  ) returns {
    success : Boolean;
    message : String;
  };
  
  /**
   * Get pending approvals for an approver
   */
  function getPendingApprovals(
    approverId : UUID @mandatory
  ) returns array of {
    requestId : UUID;
    title : String;
    amount : Decimal;
    requester : String;
    daysWaiting : Integer;
    urgency : String;
  };
  
  /**
   * Get approval chain for a request
   */
  function getApprovalChain(
    requestId : UUID @mandatory
  ) returns array of {
    level : Integer;
    approverName : String;
    role : String;
    status : String;
    actedAt : Timestamp;
    comments : String;
  };
  
  /**
   * Check if request can be auto-approved
   */
  function checkAutoApproval(
    requestId : UUID @mandatory
  ) returns {
    canAutoApprove : Boolean;
    reason : String;
  };
}
