<template>
  <section class="taxonomy-review">
    <header class="page-header">
      <div>
        <h2>Taxonomy Review</h2>
        <p>Review ambiguous or newly imported skill labels before they become part of the approved vocabulary.</p>
      </div>
      <div class="toolbar">
        <label>
          <span>Status</span>
          <select v-model="statusFilter" @change="loadProposals">
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </select>
        </label>
        <button class="secondary-btn" @click="loadProposals">Refresh</button>
      </div>
    </header>

    <div v-if="!isAdmin" class="info-card error">
      <strong>Admin access required.</strong>
      <p>You can only review taxonomy proposals with an admin account.</p>
    </div>

    <div v-else-if="loading" class="info-card">
      Loading taxonomy proposals...
    </div>

    <div v-else-if="error" class="info-card error">
      <strong>Could not load proposals.</strong>
      <p>{{ error }}</p>
    </div>

    <div v-else-if="proposals.length === 0" class="info-card">
      No proposals found for this filter.
    </div>

    <div v-else class="proposal-list">
      <article v-for="proposal in proposals" :key="proposal.id" class="proposal-card">
        <div class="proposal-main">
          <div class="proposal-title-row">
            <h3>{{ proposal.name }}</h3>
            <span class="status-pill" :class="proposal.status">{{ proposal.status }}</span>
          </div>
          <p class="proposal-meta">
            <span><strong>Category:</strong> {{ proposal.category_name || 'Unassigned' }}</span>
            <span><strong>Suggested action:</strong> {{ proposal.suggested_action || 'new_skill' }}</span>
            <span v-if="proposal.confidence !== null && proposal.confidence !== undefined">
              <strong>Confidence:</strong> {{ Math.round(Number(proposal.confidence) * 100) }}%
            </span>
          </p>
          <p v-if="proposal.canonical_preferred_label || proposal.canonical_skill_name" class="proposal-meta">
            <strong>Suggested canonical skill:</strong>
            {{ proposal.canonical_preferred_label || proposal.canonical_skill_name }}
          </p>
          <p v-if="proposal.review_notes || proposal.description" class="proposal-notes">
            {{ proposal.review_notes || proposal.description }}
          </p>
        </div>

        <div v-if="proposal.status === 'pending'" class="proposal-actions">
          <button class="approve-btn" @click="approveProposal(proposal.id)">Approve</button>
          <button class="reject-btn" @click="rejectProposal(proposal.id)">Reject</button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useApi } from '../composables/useApi';
import { useAuth } from '../composables/useAuth';

const api = useApi();
const { user } = useAuth();

const isAdmin = computed(() => !!user.value?.is_admin);
const proposals = ref([]);
const loading = ref(false);
const error = ref(null);
const statusFilter = ref('pending');

async function loadProposals() {
  if (!isAdmin.value) return;
  loading.value = true;
  error.value = null;
  try {
    proposals.value = await api.get(`/api/proposals?status=${encodeURIComponent(statusFilter.value)}`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function approveProposal(id) {
  await api.post(`/api/proposals/${id}/approve`, {});
  await loadProposals();
}

async function rejectProposal(id) {
  await api.post(`/api/proposals/${id}/reject`, {});
  await loadProposals();
}

onMounted(loadProposals);
</script>

<style scoped>
.taxonomy-review {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 1100px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.page-header h2 {
  margin: 0 0 0.25rem;
}

.page-header p {
  margin: 0;
  color: var(--text-secondary, #a0a0b0);
}

.toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
}

.toolbar label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-secondary, #a0a0b0);
}

.toolbar select,
.secondary-btn,
.approve-btn,
.reject-btn {
  border-radius: 8px;
  border: 1px solid var(--border, #2a2a4a);
  background: var(--bg-secondary, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
  padding: 0.45rem 0.8rem;
}

.secondary-btn,
.approve-btn,
.reject-btn {
  cursor: pointer;
}

.proposal-list {
  display: grid;
  gap: 0.9rem;
}

.proposal-card,
.info-card {
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
  padding: 1rem 1.1rem;
}

.info-card.error {
  border-color: rgba(248, 113, 113, 0.5);
}

.proposal-title-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
}

.proposal-title-row h3 {
  margin: 0;
  font-size: 1rem;
}

.proposal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0.5rem 0 0;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.9rem;
}

.proposal-notes {
  margin: 0.65rem 0 0;
  color: var(--text-primary, #e0e0e0);
}

.proposal-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.status-pill {
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-pill.pending {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.status-pill.approved {
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
}

.status-pill.rejected {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.approve-btn:hover {
  background: rgba(74, 222, 128, 0.18);
}

.reject-btn:hover {
  background: rgba(248, 113, 113, 0.18);
}

@media (max-width: 760px) {
  .page-header {
    flex-direction: column;
  }

  .toolbar {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
