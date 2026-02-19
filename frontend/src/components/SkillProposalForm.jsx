import React, { useState, useEffect } from 'react';
import apiFetch from '../api';
import toast from 'react-hot-toast';
import './SkillProposalForm.css';

function SkillProposalForm({ onClose, onProposed }) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch('/api/categories')
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    try {
      const res = await apiFetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category_id: categoryId || null,
          description: description.trim() || null,
        }),
      });

      if (res.ok) {
        toast.success('Skill proposed! An admin will review it.');
        onProposed?.();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to submit proposal');
      }
    } catch {
      toast.error('Failed to submit proposal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content proposal-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💡 Suggest a New Skill</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <p className="proposal-hint">
          Don&apos;t see a skill in the matrix? Propose it here and an admin will review.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Skill Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Terraform, GraphQL, Prompt Engineering..."
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select a category (optional)</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Why should we track this?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description or justification..."
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
            <button type="submit" className="submit-btn" disabled={submitting || !name.trim()}>
              {submitting ? 'Submitting...' : 'Submit Proposal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SkillProposalForm;
