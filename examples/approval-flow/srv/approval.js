/**
 * Approval Service Implementation
 * 
 * Implements multi-step approval workflow with:
 * - Configurable approval chains based on type and amount
 * - Human-in-the-loop (HITL) actions for approve, reject, escalate
 * - Delegation support
 * - Complete audit trail
 */

const cds = require('@sap/cds');

class ApprovalService extends cds.ApplicationService {
  
  async init() {
    await super.init();
    
    const { Requests, Approvers, ApprovalSteps, ApprovalChains, AuditLog } = this.entities;
    
    /**
     * Submit Request - triggers approval workflow
     */
    this.on('submitRequest', async (req) => {
      const { requestId } = req.data;
      const tx = cds.tx(req);
      
      try {
        const request = await tx.run(SELECT.one.from(Requests).where({ ID: requestId }));
        if (!request) {
          return { success: false, message: 'Request not found', currentLevel: 0, pendingApprover: null };
        }
        
        if (request.status !== 'draft') {
          return { success: false, message: `Cannot submit: request status is ${request.status}`, currentLevel: request.currentLevel, pendingApprover: null };
        }
        
        // Determine approval chain based on type and amount
        const chain = await this._getApprovalChain(tx, ApprovalChains, request.type, request.amount);
        
        if (chain.length === 0) {
          // Auto-approve if no chain required
          await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
            status: 'approved',
            totalLevels: 0,
            submittedAt: new Date().toISOString(),
            completedAt: new Date().toISOString()
          }));
          
          await this._audit(tx, AuditLog, requestId, 'system', 'auto_approved', 'draft', 'approved', { reason: 'No approval chain required' });
          
          return { success: true, message: 'Request auto-approved', currentLevel: 0, pendingApprover: null };
        }
        
        // Find first level approver
        const firstLevel = chain[0];
        const approver = await this._findApprover(tx, Approvers, firstLevel.role, request.amount);
        
        if (!approver) {
          return { success: false, message: `No approver found for role ${firstLevel.role}`, currentLevel: 0, pendingApprover: null };
        }
        
        // Update request
        await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
          status: 'pendingApproval',
          currentLevel: 1,
          totalLevels: chain.length,
          submittedAt: new Date().toISOString()
        }));
        
        // Create approval step
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3); // 3 day SLA
        
        await tx.run(INSERT.into(ApprovalSteps).entries({
          ID: cds.utils.uuid(),
          request_ID: requestId,
          approver_ID: approver.ID,
          level: 1,
          action: 'pending',
          dueDate: dueDate.toISOString()
        }));
        
        await this._audit(tx, AuditLog, requestId, request.requesterName, 'submitted', 'draft', 'pendingApproval', { approver: approver.name, level: 1 });
        
        return {
          success: true,
          message: 'Request submitted for approval',
          currentLevel: 1,
          pendingApprover: approver.name
        };
        
      } catch (error) {
        return { success: false, message: `Submission failed: ${error.message}`, currentLevel: 0, pendingApprover: null };
      }
    });
    
    /**
     * Approve - HITL action
     */
    this.on('approve', async (req) => {
      const { requestId, comments } = req.data;
      const tx = cds.tx(req);
      
      try {
        const request = await tx.run(SELECT.one.from(Requests).where({ ID: requestId }));
        if (!request) {
          return { success: false, message: 'Request not found', isComplete: false, nextApprover: null };
        }
        
        if (request.status !== 'pendingApproval') {
          return { success: false, message: `Cannot approve: status is ${request.status}`, isComplete: false, nextApprover: null };
        }
        
        // Get current pending step
        const pendingStep = await tx.run(
          SELECT.one.from(ApprovalSteps).where({ request_ID: requestId, level: request.currentLevel, action: 'pending' })
        );
        
        if (!pendingStep) {
          return { success: false, message: 'No pending approval step found', isComplete: false, nextApprover: null };
        }
        
        // Get approver info for audit
        const approver = await tx.run(SELECT.one.from(Approvers).where({ ID: pendingStep.approver_ID }));
        
        // Update approval step
        await tx.run(UPDATE(ApprovalSteps).where({ ID: pendingStep.ID }).set({
          action: 'approved',
          comments,
          actedAt: new Date().toISOString()
        }));
        
        // Check if more levels needed
        if (request.currentLevel >= request.totalLevels) {
          // Final approval
          await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
            status: 'approved',
            completedAt: new Date().toISOString()
          }));
          
          await this._audit(tx, AuditLog, requestId, approver?.name || 'Approver', 'approved', 'pendingApproval', 'approved', { comments, level: request.currentLevel, final: true });
          
          return { success: true, message: 'Request fully approved', isComplete: true, nextApprover: null };
        }
        
        // Move to next level
        const chain = await this._getApprovalChain(tx, ApprovalChains, request.type, request.amount);
        const nextLevel = chain.find(c => c.level === request.currentLevel + 1);
        
        if (!nextLevel) {
          // No more levels defined, complete
          await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
            status: 'approved',
            completedAt: new Date().toISOString()
          }));
          
          await this._audit(tx, AuditLog, requestId, approver?.name || 'Approver', 'approved', 'pendingApproval', 'approved', { comments, level: request.currentLevel, final: true });
          
          return { success: true, message: 'Request fully approved', isComplete: true, nextApprover: null };
        }
        
        const nextApprover = await this._findApprover(tx, Approvers, nextLevel.role, request.amount);
        
        if (!nextApprover) {
          return { success: false, message: `No approver found for level ${request.currentLevel + 1}`, isComplete: false, nextApprover: null };
        }
        
        // Update request level
        await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
          currentLevel: request.currentLevel + 1
        }));
        
        // Create next approval step
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3);
        
        await tx.run(INSERT.into(ApprovalSteps).entries({
          ID: cds.utils.uuid(),
          request_ID: requestId,
          approver_ID: nextApprover.ID,
          level: request.currentLevel + 1,
          action: 'pending',
          dueDate: dueDate.toISOString()
        }));
        
        await this._audit(tx, AuditLog, requestId, approver?.name || 'Approver', 'approved', 'pendingApproval', 'pendingApproval', { comments, level: request.currentLevel, nextLevel: request.currentLevel + 1, nextApprover: nextApprover.name });
        
        return {
          success: true,
          message: `Approved at level ${request.currentLevel}, pending level ${request.currentLevel + 1}`,
          isComplete: false,
          nextApprover: nextApprover.name
        };
        
      } catch (error) {
        return { success: false, message: `Approval failed: ${error.message}`, isComplete: false, nextApprover: null };
      }
    });
    
    /**
     * Reject - HITL action
     */
    this.on('reject', async (req) => {
      const { requestId, reason } = req.data;
      const tx = cds.tx(req);
      
      try {
        const request = await tx.run(SELECT.one.from(Requests).where({ ID: requestId }));
        if (!request) {
          return { success: false, message: 'Request not found' };
        }
        
        if (request.status !== 'pendingApproval') {
          return { success: false, message: `Cannot reject: status is ${request.status}` };
        }
        
        if (!reason || reason.trim() === '') {
          return { success: false, message: 'Rejection reason is required' };
        }
        
        // Get current step
        const pendingStep = await tx.run(
          SELECT.one.from(ApprovalSteps).where({ request_ID: requestId, level: request.currentLevel, action: 'pending' })
        );
        
        if (pendingStep) {
          const approver = await tx.run(SELECT.one.from(Approvers).where({ ID: pendingStep.approver_ID }));
          
          await tx.run(UPDATE(ApprovalSteps).where({ ID: pendingStep.ID }).set({
            action: 'rejected',
            comments: reason,
            actedAt: new Date().toISOString()
          }));
          
          await this._audit(tx, AuditLog, requestId, approver?.name || 'Approver', 'rejected', 'pendingApproval', 'rejected', { reason, level: request.currentLevel });
        }
        
        await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
          status: 'rejected',
          completedAt: new Date().toISOString()
        }));
        
        return { success: true, message: 'Request rejected' };
        
      } catch (error) {
        return { success: false, message: `Rejection failed: ${error.message}` };
      }
    });
    
    /**
     * Escalate - HITL action
     */
    this.on('escalate', async (req) => {
      const { requestId, reason, targetApproverId } = req.data;
      const tx = cds.tx(req);
      
      try {
        const request = await tx.run(SELECT.one.from(Requests).where({ ID: requestId }));
        if (!request) {
          return { success: false, message: 'Request not found', escalatedTo: null };
        }
        
        if (!reason || reason.trim() === '') {
          return { success: false, message: 'Escalation reason is required', escalatedTo: null };
        }
        
        // Get target approver (or find VP/executive)
        let targetApprover;
        if (targetApproverId) {
          targetApprover = await tx.run(SELECT.one.from(Approvers).where({ ID: targetApproverId }));
        } else {
          // Find VP or higher
          targetApprover = await tx.run(
            SELECT.one.from(Approvers).where({ role: 'vp', isActive: true })
          );
          if (!targetApprover) {
            targetApprover = await tx.run(
              SELECT.one.from(Approvers).where({ role: 'cfo', isActive: true })
            );
          }
        }
        
        if (!targetApprover) {
          return { success: false, message: 'No suitable escalation target found', escalatedTo: null };
        }
        
        // Update current pending step to escalated
        await tx.run(
          UPDATE(ApprovalSteps).where({ request_ID: requestId, action: 'pending' }).set({
            action: 'escalated',
            comments: reason,
            actedAt: new Date().toISOString()
          })
        );
        
        // Create new step for escalation target
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1); // Urgent - 1 day SLA
        
        await tx.run(INSERT.into(ApprovalSteps).entries({
          ID: cds.utils.uuid(),
          request_ID: requestId,
          approver_ID: targetApprover.ID,
          level: 99, // Escalation level
          action: 'pending',
          dueDate: dueDate.toISOString()
        }));
        
        await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
          status: 'escalated',
          escalationReason: reason,
          urgency: 'critical'
        }));
        
        await this._audit(tx, AuditLog, requestId, 'System', 'escalated', request.status, 'escalated', { reason, escalatedTo: targetApprover.name });
        
        return {
          success: true,
          message: 'Request escalated',
          escalatedTo: targetApprover.name
        };
        
      } catch (error) {
        return { success: false, message: `Escalation failed: ${error.message}`, escalatedTo: null };
      }
    });
    
    /**
     * Delegate - HITL action
     */
    this.on('delegate', async (req) => {
      const { requestId, toApproverId, reason } = req.data;
      const tx = cds.tx(req);
      
      try {
        const request = await tx.run(SELECT.one.from(Requests).where({ ID: requestId }));
        if (!request) {
          return { success: false, message: 'Request not found', delegatedTo: null };
        }
        
        const toApprover = await tx.run(SELECT.one.from(Approvers).where({ ID: toApproverId }));
        if (!toApprover) {
          return { success: false, message: 'Delegate target not found', delegatedTo: null };
        }
        
        if (!toApprover.isActive) {
          return { success: false, message: 'Delegate target is not active', delegatedTo: null };
        }
        
        // Get current step
        const pendingStep = await tx.run(
          SELECT.one.from(ApprovalSteps).where({ request_ID: requestId, action: 'pending' })
        );
        
        if (!pendingStep) {
          return { success: false, message: 'No pending step to delegate', delegatedTo: null };
        }
        
        const fromApprover = await tx.run(SELECT.one.from(Approvers).where({ ID: pendingStep.approver_ID }));
        
        // Update current step
        await tx.run(UPDATE(ApprovalSteps).where({ ID: pendingStep.ID }).set({
          action: 'delegated',
          comments: reason || `Delegated to ${toApprover.name}`,
          actedAt: new Date().toISOString()
        }));
        
        // Create new step for delegate
        await tx.run(INSERT.into(ApprovalSteps).entries({
          ID: cds.utils.uuid(),
          request_ID: requestId,
          approver_ID: toApproverId,
          level: pendingStep.level,
          action: 'pending',
          dueDate: pendingStep.dueDate
        }));
        
        await this._audit(tx, AuditLog, requestId, fromApprover?.name || 'Approver', 'delegated', 'pendingApproval', 'pendingApproval', { reason, delegatedTo: toApprover.name, level: pendingStep.level });
        
        return {
          success: true,
          message: 'Approval delegated',
          delegatedTo: toApprover.name
        };
        
      } catch (error) {
        return { success: false, message: `Delegation failed: ${error.message}`, delegatedTo: null };
      }
    });
    
    /**
     * Recall Request
     */
    this.on('recallRequest', async (req) => {
      const { requestId, reason } = req.data;
      const tx = cds.tx(req);
      
      try {
        const request = await tx.run(SELECT.one.from(Requests).where({ ID: requestId }));
        if (!request) {
          return { success: false, message: 'Request not found' };
        }
        
        // Can only recall if in early stages
        if (!['submitted', 'pendingApproval'].includes(request.status)) {
          return { success: false, message: `Cannot recall: status is ${request.status}` };
        }
        
        // Check if any approvals already done
        const approvedSteps = await tx.run(
          SELECT.from(ApprovalSteps).where({ request_ID: requestId, action: 'approved' })
        );
        
        if (approvedSteps.length > 0) {
          return { success: false, message: 'Cannot recall: approvals already received' };
        }
        
        // Cancel pending steps
        await tx.run(
          UPDATE(ApprovalSteps).where({ request_ID: requestId, action: 'pending' }).set({
            action: 'cancelled',
            comments: reason || 'Request recalled',
            actedAt: new Date().toISOString()
          })
        );
        
        await tx.run(UPDATE(Requests).where({ ID: requestId }).set({
          status: 'draft',
          currentLevel: 1,
          submittedAt: null
        }));
        
        await this._audit(tx, AuditLog, requestId, request.requesterName, 'recalled', request.status, 'draft', { reason });
        
        return { success: true, message: 'Request recalled' };
        
      } catch (error) {
        return { success: false, message: `Recall failed: ${error.message}` };
      }
    });
    
    /**
     * Get Pending Approvals
     */
    this.on('getPendingApprovals', async (req) => {
      const { approverId } = req.data;
      const tx = cds.tx(req);
      
      const pendingSteps = await tx.run(
        SELECT.from(ApprovalSteps).where({ approver_ID: approverId, action: 'pending' })
      );
      
      const results = [];
      for (const step of pendingSteps) {
        const request = await tx.run(SELECT.one.from(Requests).where({ ID: step.request_ID }));
        if (request) {
          const daysWaiting = Math.floor((Date.now() - new Date(request.submittedAt).getTime()) / (1000 * 60 * 60 * 24));
          results.push({
            requestId: request.ID,
            title: request.title,
            amount: request.amount,
            requester: request.requesterName,
            daysWaiting,
            urgency: request.urgency
          });
        }
      }
      
      return results;
    });
    
    /**
     * Get Approval Chain
     */
    this.on('getApprovalChain', async (req) => {
      const { requestId } = req.data;
      const tx = cds.tx(req);
      
      const steps = await tx.run(
        SELECT.from(ApprovalSteps).where({ request_ID: requestId }).orderBy('level asc', 'actedAt asc')
      );
      
      const results = [];
      for (const step of steps) {
        const approver = await tx.run(SELECT.one.from(Approvers).where({ ID: step.approver_ID }));
        results.push({
          level: step.level,
          approverName: approver?.name || 'Unknown',
          role: approver?.role || 'Unknown',
          status: step.action,
          actedAt: step.actedAt,
          comments: step.comments
        });
      }
      
      return results;
    });
    
    /**
     * Check Auto Approval
     */
    this.on('checkAutoApproval', async (req) => {
      const { requestId } = req.data;
      const tx = cds.tx(req);
      
      const request = await tx.run(SELECT.one.from(Requests).where({ ID: requestId }));
      if (!request) {
        return { canAutoApprove: false, reason: 'Request not found' };
      }
      
      // Check if amount is below auto-approval threshold
      if (request.amount <= 100) {
        return { canAutoApprove: true, reason: 'Amount below auto-approval threshold' };
      }
      
      // Check if type allows auto-approval
      if (request.type === 'leave' && request.amount <= 5) { // 5 days or less
        return { canAutoApprove: true, reason: 'Short leave requests are auto-approved' };
      }
      
      return { canAutoApprove: false, reason: 'Requires manual approval' };
    });
  }
  
  /**
   * Internal: Get approval chain for request type and amount
   */
  async _getApprovalChain(tx, ApprovalChains, type, amount) {
    const chain = await tx.run(
      SELECT.from(ApprovalChains)
        .where({ type })
        .and('amountThreshold <=', amount)
        .orderBy('level asc')
    );
    return chain;
  }
  
  /**
   * Internal: Find an active approver by role
   */
  async _findApprover(tx, Approvers, role, amount) {
    const approver = await tx.run(
      SELECT.one.from(Approvers)
        .where({ role, isActive: true })
        .and('approvalLimit >=', amount)
    );
    return approver;
  }
  
  /**
   * Internal: Write audit log
   */
  async _audit(tx, AuditLog, requestId, actor, action, fromStatus, toStatus, details) {
    await tx.run(INSERT.into(AuditLog).entries({
      ID: cds.utils.uuid(),
      request_ID: requestId,
      actor,
      action,
      fromStatus,
      toStatus,
      details: JSON.stringify(details)
    }));
  }
}

module.exports = ApprovalService;
