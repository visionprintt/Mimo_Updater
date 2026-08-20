'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { getAllUsers, getInvitations, deleteInvitation, deleteUserAccount, updateUser, updateUserStatus, createAuditLog } from '@/lib/firestore';
import type { MimoUser, Invitation, Department, UserRole } from '@/types';
import { DEPARTMENTS, ADMIN_ROLES } from '@/types';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function EmployeesPage() {
  const { mimoUser } = useAuthStore();
  const [users, setUsers] = useState<MimoUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [deptFilter, setDeptFilter] = useState<'all' | Department>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'suspended' | 'invited'>('all');

  // Modals / Modifying
  const [editingUser, setEditingUser] = useState<MimoUser | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', displayName: '', role: 'employee' as UserRole, department: 'Frontend' as Department, position: '' });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, i] = await Promise.all([
        getAllUsers(),
        getInvitations()
      ]);
      setUsers(u);
      setInvitations(i);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mimoUser) return;
    setActionLoading(true);
    try {
      const invite: Invitation = {
        email: inviteForm.email.toLowerCase(),
        displayName: inviteForm.displayName,
        role: inviteForm.role,
        departments: [inviteForm.department],
        position: inviteForm.position,
        invitedBy: mimoUser.uid,
        invitedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'invitations', invite.email), invite);
      
      try {
        const response = await fetch('/api/send-invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: invite.email,
            displayName: invite.displayName,
            role: invite.role,
            department: invite.departments[0] || 'Frontend',
          }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          alert(`Failed to send invitation email: ${errorData.error}`);
        }
      } catch (emailError) {
        console.error('Error calling send-invite API:', emailError);
        alert('An unexpected error occurred while sending the email.');
      }

      setShowInviteModal(false);
      await createAuditLog({
        actorId: mimoUser.uid,
        actorName: mimoUser.displayName,
        action: 'USER_INVITED',
        targetId: invite.email,
        targetName: invite.displayName,
        details: `Invited user ${invite.displayName} (${invite.email}) as ${invite.role}`,
        createdAt: new Date().toISOString()
      });
      setInviteForm({ email: '', displayName: '', role: 'employee', department: 'Frontend', position: '' });
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to send invitation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendInvite = async (inv: Invitation) => {
    try {
      const response = await fetch('/api/send-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inv.email,
          displayName: inv.displayName,
          role: inv.role,
          department: inv.departments?.[0] || 'Frontend',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to resend invitation email: ${errorData.error}`);
      } else {
        alert(`Invitation email successfully resent to ${inv.email}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error occurred while resending invitation.');
    }
  };

  const handleRevokeInvite = async (email: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    await deleteInvitation(email);
    if (mimoUser) {
      await createAuditLog({
        actorId: mimoUser.uid,
        actorName: mimoUser.displayName,
        action: 'INVITATION_REVOKED',
        targetId: email,
        targetName: email,
        details: `Revoked invitation for ${email}`,
        createdAt: new Date().toISOString()
      });
    }
    await loadData();
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Are you sure you want to completely delete this user? This cannot be undone.')) return;
    const targetUser = users.find(u => u.uid === uid);
    await deleteUserAccount(uid);
    if (mimoUser && targetUser) {
      await createAuditLog({
        actorId: mimoUser.uid,
        actorName: mimoUser.displayName,
        action: 'USER_DELETED',
        targetId: uid,
        targetName: targetUser.displayName,
        details: `Deleted user ${targetUser.displayName}`,
        createdAt: new Date().toISOString()
      });
    }
    await loadData();
  };

  const handleUpdateStatus = async (uid: string, status: 'approved' | 'suspended') => {
    if (!mimoUser) return;
    const targetUser = users.find(u => u.uid === uid);
    await updateUserStatus(uid, status, mimoUser.uid);
    if (targetUser) {
      await createAuditLog({
        actorId: mimoUser.uid,
        actorName: mimoUser.displayName,
        action: 'USER_STATUS_CHANGED',
        targetId: uid,
        targetName: targetUser.displayName,
        details: `Changed status of ${targetUser.displayName} to ${status}`,
        createdAt: new Date().toISOString()
      });
    }
    await loadData();
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setActionLoading(true);
    try {
      await updateUser(editingUser.uid, {
        displayName: editingUser.displayName,
        role: editingUser.role,
        departments: editingUser.departments || ['Frontend'],
        position: editingUser.position || '',
        phoneNumber: editingUser.phoneNumber || ''
      });
      if (mimoUser) {
        await createAuditLog({
          actorId: mimoUser.uid,
          actorName: mimoUser.displayName,
          action: 'USER_PROFILE_UPDATED',
          targetId: editingUser.uid,
          targetName: editingUser.displayName,
          details: `Updated profile details for ${editingUser.displayName}`,
          createdAt: new Date().toISOString()
        });
      }
      setEditingUser(null);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to update user');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    
    const filteredUsers = users.map(u => ({ ...u, _type: 'user' as const })).filter(u => {
      if (statusFilter !== 'all' && statusFilter !== 'invited' && u.status !== statusFilter) return false;
      if (statusFilter === 'invited') return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (deptFilter !== 'all' && !u.departments?.includes(deptFilter)) return false;
      if (q && !(u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))) return false;
      return true;
    });

    const filteredInvites = invitations.map(i => ({ ...i, _type: 'invite' as const })).filter(i => {
      if (statusFilter !== 'all' && statusFilter !== 'invited') return false;
      if (roleFilter !== 'all' && i.role !== roleFilter) return false;
      if (deptFilter !== 'all' && !i.departments?.includes(deptFilter)) return false;
      if (q && !(i.displayName?.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q))) return false;
      return true;
    });

    return [...filteredUsers, ...filteredInvites];
  }, [users, invitations, search, roleFilter, deptFilter, statusFilter]);

  if (loading) return <div style={{ padding: '24px' }}>Loading directory...</div>;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px 0' }}>Employees Directory</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage team members, roles, and invitations.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowInviteModal(true)}>
          + Add Employee
        </button>
      </div>

      <div className="glass-card-static" style={{ padding: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          className="form-input" 
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 250px' }}
        />
        <select className="form-input" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
          <option value="all">All Statuses</option>
          <option value="approved">Active</option>
          <option value="pending">Pending Signup</option>
          <option value="suspended">Suspended</option>
          <option value="invited">Invited (No Account)</option>
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)}>
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="lead">Lead</option>
          <option value="employee">Employee</option>
          <option value="intern">Intern</option>
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={deptFilter} onChange={e => setDeptFilter(e.target.value as any)}>
          <option value="all">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="glass-card-static" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '16px', fontWeight: 600 }}>Employee</th>
              <th style={{ padding: '16px', fontWeight: 600 }}>Role</th>
              <th style={{ padding: '16px', fontWeight: 600 }}>Department</th>
              <th style={{ padding: '16px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No employees found matching the filters.
                </td>
              </tr>
            ) : (
              filteredItems.map(item => (
                <tr key={item._type === 'user' ? (item as MimoUser).uid : (item as Invitation).email} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 600 }}>{item.displayName || 'Unknown'}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{item.email}</div>
                  </td>
                  <td style={{ padding: '16px', textTransform: 'capitalize' }}>{item.role}</td>
                  <td style={{ padding: '16px' }}>{item.departments?.join(', ')}</td>
                  <td style={{ padding: '16px' }}>
                    {item._type === 'invite' ? (
                      <span className="status-badge status-pending">Invited</span>
                    ) : (
                      <span className={`status-badge status-${(item as MimoUser).status}`}>
                        {(item as MimoUser).status}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    {item._type === 'invite' ? (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleResendInvite(item as Invitation)}>Resend</button>
                        <button className="btn btn-sm" style={{ background: 'var(--status-flagged)', color: 'white' }} onClick={() => handleRevokeInvite((item as Invitation).email)}>Revoke</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Link href={`/admin/employees/${(item as MimoUser).uid}/dashboard`} className="btn btn-sm btn-primary" style={{ padding: '0 12px' }}>
                          View Dashboard
                        </Link>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditingUser(item as MimoUser)}>Edit</button>
                        {(item as MimoUser).status === 'approved' ? (
                          <button className="btn btn-sm" style={{ background: 'var(--status-flagged)', color: 'white' }} onClick={() => handleUpdateStatus((item as MimoUser).uid, 'suspended')}>Suspend</button>
                        ) : (
                          <button className="btn btn-sm" style={{ background: 'var(--status-active)', color: 'white' }} onClick={() => handleUpdateStatus((item as MimoUser).uid, 'approved')}>Activate</button>
                        )}
                        <button className="btn btn-sm" style={{ background: 'var(--status-flagged)', color: 'white' }} onClick={() => handleDeleteUser((item as MimoUser).uid)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content glass-card-static" onClick={e => e.stopPropagation()}>
            <h2>Edit Employee</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div>
                <label className="form-label">Display Name</label>
                <input type="text" className="form-input" value={editingUser.displayName} onChange={e => setEditingUser({...editingUser, displayName: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select className="form-input" value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}>
                  <option value="admin">Admin</option>
                  <option value="lead">Lead</option>
                  <option value="employee">Employee</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div>
                <label className="form-label">Department</label>
                <select className="form-input" value={editingUser.departments?.[0] || 'Frontend'} onChange={e => setEditingUser({...editingUser, departments: [e.target.value as Department]})}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Position Title</label>
                <input type="text" className="form-input" value={editingUser.position || ''} onChange={e => setEditingUser({...editingUser, position: e.target.value})} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button className="btn btn-ghost" onClick={() => setEditingUser(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveEdit} disabled={actionLoading}>{actionLoading ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content glass-card-static" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h2>Invite Team Member</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Send an invitation link via email. They will log in with Google to accept.</p>
            <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Email Address</label>
                <input required type="email" className="form-input" value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Full Name</label>
                <input required type="text" className="form-input" value={inviteForm.displayName} onChange={e => setInviteForm({...inviteForm, displayName: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select className="form-input" value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value as UserRole})}>
                  <option value="admin">Admin</option>
                  <option value="lead">Lead</option>
                  <option value="employee">Employee</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div>
                <label className="form-label">Department</label>
                <select className="form-input" value={inviteForm.department} onChange={e => setInviteForm({...inviteForm, department: e.target.value as Department})}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Job Title (Optional)</label>
                <input type="text" className="form-input" value={inviteForm.position} onChange={e => setInviteForm({...inviteForm, position: e.target.value})} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowInviteModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
