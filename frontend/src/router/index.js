import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import SkillsMatrix from '../components/SkillsMatrix.vue';
import SkillsGraph from '../components/SkillsGraph.vue';
import GapAnalysis from '../components/GapAnalysis.vue';
import UserProfile from '../components/UserProfile.vue';
import SkillCatalog from '../components/SkillCatalog.vue';

const routes = [
  {
    path: '/',
    name: 'matrix',
    component: SkillsMatrix,
    meta: { label: 'Skills Matrix', primaryNav: true, navOrder: 1 },
  },
  {
    path: '/graph',
    name: 'graph',
    component: SkillsGraph,
    meta: { label: 'Skills Graph', primaryNav: true, navOrder: 2 },
  },
  {
    path: '/gap-analysis',
    name: 'gap',
    component: GapAnalysis,
    meta: { label: 'Gap Analysis', primaryNav: true, navOrder: 3 },
  },
  {
    path: '/profile',
    name: 'profile',
    component: UserProfile,
    meta: { label: 'My Profile', requiresAuth: true, navOrder: 4 },
  },
  {
    path: '/skill-catalog',
    name: 'skill-catalog',
    component: SkillCatalog,
    meta: { label: 'Skill Catalog', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'matrix' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const { isAuthenticated, isLoading, initialize, user } = useAuth();
    // Ensure auth has finished initializing before checking
    if (isLoading.value) {
      await initialize();
    }
    if (!isAuthenticated.value) {
      return { name: 'matrix' };
    }
    if (to.meta.requiresAdmin && !user.value?.is_admin) {
      return { name: 'matrix' };
    }
  }
});

export default router;
