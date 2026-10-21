/**
 * Approval Flow Data Model
 * 
 * Defines entities for multi-step approval workflows with
 * human-in-the-loop (HITL) patterns.
 */

namespace approval;

/**
 * Approval Requests - items needing approval
 */
entity Requests {
  key ID : UUID;
  requestNumber : String(20);
  type : String(30); // expense, purchase, leave, travel, budget
  title : String(100) @mandatory;
  description : String(500);
  amount : Decimal(12, 2);
  currency : String(3) default 'USD';
  requester_ID : UUID @mandatory;
  requesterName : String(100);
  currentLevel : Integer default 1;
  totalLevels : Integer default 1;
  status : String(20) default 'draft';
  // Status: draft, submitted, inReview, pendingApproval, approved, rejected, escalated, cancelled
  submittedAt : Timestamp;
  completedAt : Timestamp;
  urgency : String(10) default 'normal'; // low, normal, high, critical
  escalationReason : String(500);
}

/**
 * Approvers - people who can approve requests
 */
entity Approvers {
  key ID : UUID;
  email : String(100) @mandatory;
  name : String(100) @mandatory;
  role : String(50); // manager, director, vp, cfo, ceo
  approvalLimit : Decimal(12, 2) default 10000.00;
  department : String(50);
  isActive : Boolean default true;
}

/**
 * Approval Steps - tracks each approval action
 */
entity ApprovalSteps {
  key ID : UUID;
  request : Association to Requests;
  approver : Association to Approvers;
  level : Integer @mandatory;
  action : String(20); // pending, approved, rejected, delegated, escalated
  comments : String(500);
  actedAt : Timestamp;
  dueDate : Timestamp;
  reminderSent : Boolean default false;
}

/**
 * Approval Chain Templates - defines approval routing
 */
entity ApprovalChains {
  key ID : UUID;
  type : String(30); // Maps to Request type
  level : Integer;
  role : String(50); // Required approver role
  amountThreshold : Decimal(12, 2); // Min amount for this level
  description : String(100);
}

/**
 * Audit Log - complete history of all actions
 */
entity AuditLog {
  key ID : UUID;
  request_ID : UUID;
  timestamp : Timestamp default $now;
  actor : String(100);
  action : String(50);
  fromStatus : String(20);
  toStatus : String(20);
  details : LargeString;
}
