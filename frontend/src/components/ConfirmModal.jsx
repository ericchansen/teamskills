import React from 'react';
import './ConfirmModal.css';

function ConfirmModal({ isOpen, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel, variant = 'danger' }) {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div className="confirm-modal-backdrop" onClick={handleBackdropClick}>
      <div className="confirm-modal">
        <h3 className="confirm-modal-title">{title}</h3>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button 
            className="confirm-modal-btn cancel" 
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button 
            className={`confirm-modal-btn confirm ${variant}`} 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
