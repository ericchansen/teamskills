import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import SkillsMatrix from '../components/SkillsMatrix.vue';
import SkillsGraph from '../components/SkillsGraph.vue';
import GapAnalysis from '../components/GapAnalysis.vue';
import UserProfile from '../components/UserProfile.vue';

const routes = [
  { path: '/', name: 'matrix', component: SkillsMatrix, meta: { label: 'Skills Matrix' } },
  { path: '/graph', name: 'graph', component: SkillsGraph, meta: { label: 'Skills Graph' } },
  { path: '/gap-analysis', name: 'gap', component: GapAnalysis, meta: { label: 'Gap Analysis' } },
  { path: '/profile', name: 'profile', component: UserProfile, meta: { label: 'My Profile', requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const { isAuthenticated, isLoading, initialize } = useAuth();
    // Ensure auth has finished initializing before checking
    if (isLoading.value) {
      await initialize();
    }
    if (!isAuthenticated.value) {
      return { name: 'matrix' };
    }
  }
});

export default router;
