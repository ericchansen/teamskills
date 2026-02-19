import React, { useState, useEffect, useCallback } from 'react';
import apiFetch from '../api';
import toast from 'react-hot-toast';
import './AdminProposalReview.css';

function AdminProposalReview({ onClose }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProposals = useCallback(async () => {
    try {
      const res = await apiFetch('/api/proposals?status=all');
      if (res.ok) {
        const data = await res.json();
        setProposals(data);
      }
    } catch {
      toast.error('Failed to load proposals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  const handleAction = async (id, action) => {
    try {
      const res = await apiFetch(`/api/proposals/${id}/${action}`, { method: 'POST' });
      if (res.ok) {
        toast.success(`Proposal ${action}d`);
        fetchProposals();
      } else {
        const err = await res.json();
        toast.error(err.error || `Failed to ${action}`);
      }
    } catch {
      toast.error(`Failed to ${action} proposal`);
    }
  };

  const pending = proposals.filter(p => p.status === 'pending');
  const reviewed = proposals.filter(p => p.status !== 'pending');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content proposal-review" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📋 Skill Proposals</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <p className="loading-text">Loading...</p>
        ) : pending.length === 0 && reviewed.length === 0 ? (
          <p className="empty-text">No proposals yet.</p>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="proposal-section">
                <h4>Pending ({pending.length})</h4>
                {pending.map(p => (
                  <div key={p.id} className="proposal-card pending">
                    <div className="proposal-info">
                      <strong>{p.name}</strong>
                      {p.category_name && <span className="category-tag">{p.category_name}</span>}
                      {p.description && <p className="proposal-desc">{p.description}</p>}
                      <span className="proposal-meta">by {p.proposed_by_name}</span>
                    </div>
                    <div className="proposal-actions">
                      <button className="approve-btn" onClick={() => handleAction(p.id, 'approve')}>✓ Approve</button>
                      <button className="reject-btn" onClick={() => handleAction(p.id, 'reject')}>✗ Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {reviewed.length > 0 && (
              <div className="proposal-section">
                <h4>Reviewed</h4>
                {reviewed.slice(0, 10).map(p => (
                  <div key={p.id} className={`proposal-card ${p.status}`}>
                    <div className="proposal-info">
                      <strong>{p.name}</strong>
                      <span className={`status-badge ${p.status}`}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminProposalReview;
