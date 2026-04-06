import { expect } from '@playwright/test';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flattenCategories(nodes, flat = new Map()) {
  for (const node of nodes) {
    flat.set(node.id, node);
    flattenCategories(node.children || [], flat);
  }
  return flat;
}

function buildCategoryPathMap(nodes, path = [], flat = new Map()) {
  for (const node of nodes) {
    const nextPath = [...path, node.name];
    flat.set(node.id, nextPath.join(' > '));
    buildCategoryPathMap(node.children || [], nextPath, flat);
  }
  return flat;
}

function buildMockUser(userType) {
  if (userType === 'member') {
    return {
      id: 3,
      name: 'Jordan Lee',
      email: 'jordanlee@example.com',
      role: 'Apps & AI',
      team: 'Apps & AI',
      is_admin: false,
    };
  }

  return {
    id: 1,
    name: 'Alex Chen',
    email: 'alexchen@example.com',
    role: 'Apps & AI',
    team: 'Apps & AI',
    is_admin: true,
  };
}

export function buildMockMatrixResponse() {
  return {
    users: [
      { id: 1, name: 'Alex Chen', email: 'alexchen@example.com', role: 'Apps & AI', team: 'Apps & AI' },
      { id: 2, name: 'Sam Rivera', email: 'samrivera@example.com', role: 'Data', team: 'Data' },
      { id: 3, name: 'Jordan Lee', email: 'jordanlee@example.com', role: 'Apps & AI', team: 'Apps & AI' },
    ],
    skills: [
      {
        id: 17,
        name: 'Azure AI Bot Service',
        preferred_label: 'Azure AI Bot Service',
        category_id: 10,
        category_path: 'Apps & AI > AI & Machine Learning > Solution',
      },
      {
        id: 18,
        name: 'Retrieval-Augmented Generation (RAG)',
        preferred_label: 'Retrieval-Augmented Generation (RAG)',
        category_id: 10,
        category_path: 'Apps & AI > AI & Machine Learning > Solution',
      },
      {
        id: 19,
        name: 'Microsoft Foundry',
        preferred_label: 'Microsoft Foundry',
        category_id: 12,
        category_path: 'Apps & AI > AI & Machine Learning > Platform',
      },
      {
        id: 22,
        name: 'Azure AI Services (OpenAI)',
        preferred_label: 'Azure AI Services (OpenAI)',
        category_id: 10,
        category_path: 'Apps & AI > AI & Machine Learning > Solution',
      },
      {
        id: 32,
        name: 'Azure Functions',
        preferred_label: 'Azure Functions',
        category_id: 13,
        category_path: 'Apps & AI > Application Development > Solution',
      },
      {
        id: 34,
        name: 'Playwright',
        preferred_label: 'Playwright',
        category_id: 15,
        category_path: 'Apps & AI > Application Development > Framework',
      },
    ],
    categories: [
      {
        id: 1,
        name: 'Apps & AI',
        parent_id: null,
        level: 1,
        sort_order: 1,
        children: [
          {
            id: 6,
            name: 'AI & Machine Learning',
            parent_id: 1,
            level: 2,
            sort_order: 1,
            children: [
              {
                id: 10,
                name: 'Solution',
                parent_id: 6,
                level: 3,
                sort_order: 1,
                children: [],
              },
              {
                id: 12,
                name: 'Platform',
                parent_id: 6,
                level: 3,
                sort_order: 2,
                children: [],
              },
            ],
          },
          {
            id: 11,
            name: 'Application Development',
            parent_id: 1,
            level: 2,
            sort_order: 2,
            children: [
              {
                id: 13,
                name: 'Solution',
                parent_id: 11,
                level: 3,
                sort_order: 1,
                children: [],
              },
              {
                id: 15,
                name: 'Framework',
                parent_id: 11,
                level: 3,
                sort_order: 2,
                children: [],
              },
            ],
          },
        ],
      },
    ],
    userSkills: {
      '1-17': { proficiency_level: 'L100', notes: '' },
      '1-18': { proficiency_level: 'L200', notes: '' },
      '1-19': { proficiency_level: 'L300', notes: '' },
      '1-22': { proficiency_level: 'L300', notes: '' },
      '1-32': { proficiency_level: 'L200', notes: '' },
      '1-34': { proficiency_level: 'L300', notes: '' },
      '2-17': { proficiency_level: 'L200', notes: '' },
      '2-18': { proficiency_level: 'L100', notes: '' },
      '2-19': { proficiency_level: 'L400', notes: '' },
      '2-22': { proficiency_level: 'L200', notes: '' },
      '2-32': { proficiency_level: 'L100', notes: '' },
      '2-34': { proficiency_level: 'L100', notes: '' },
      '3-17': { proficiency_level: 'L200', notes: '' },
      '3-18': { proficiency_level: 'L300', notes: '' },
      '3-19': { proficiency_level: 'L100', notes: '' },
      '3-22': { proficiency_level: 'L200', notes: '' },
      '3-32': { proficiency_level: 'L300', notes: '' },
      '3-34': { proficiency_level: 'L200', notes: '' },
    },
  };
}

export async function loadDashboard(page) {
  await page.addInitScript(() => {
    globalThis.__E2E_TEST__ = true;
  });
  await page.goto('/');
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('.matrix-view')).toBeVisible({ timeout: 15000 });
}

export async function readJsonSummary(page, testId) {
  const raw = await page.getByTestId(testId).textContent();
  return JSON.parse(raw || '{}');
}

export async function readGraphEdgeCount(page) {
  const raw = await page.getByTestId('graph-edge-count').textContent();
  return Number.parseInt(raw || '0', 10);
}

export function chooseTargetLevel(currentLevel) {
  return currentLevel === 400 ? 300 : 400;
}

export function thresholdDelta(currentLevel) {
  return currentLevel === 400 ? -1 : 1;
}

export async function mockDashboardApi(page, { userType = 'admin', failNextSave = false } = {}) {
  const matrixData = clone(buildMockMatrixResponse());
  const currentUser = buildMockUser(userType);
  const categoryMap = flattenCategories(matrixData.categories);
  const categoryPathMap = buildCategoryPathMap(matrixData.categories);
  let shouldFail = failNextSave;

  function getSkillMap() {
    return new Map(
      matrixData.skills.flatMap((skill) => [
        [skill.name.toLowerCase(), skill],
        [(skill.preferred_label || skill.name).toLowerCase(), skill],
      ])
    );
  }

  function getSkillById(id) {
    return matrixData.skills.find((skill) => skill.id === Number(id)) || null;
  }

  function getNextSkillId() {
    return Math.max(...matrixData.skills.map((skill) => skill.id), 10) + 1;
  }

  function buildConflictResponse(existingSkill) {
    return {
      error: 'A skill with this name already exists',
      canonicalSkill: {
        id: existingSkill.id,
        name: existingSkill.name,
        preferred_label: existingSkill.preferred_label,
      },
    };
  }

  await page.route('**/api/auth/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentUser),
    });
  });

  await page.route('**/api/matrix', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(matrixData),
    });
  });

  await page.route('**/api/user-skills', async (route) => {
    const method = route.request().method();

    if (method !== 'PUT' && method !== 'DELETE') {
      await route.continue();
      return;
    }

    const requestBody = route.request().postDataJSON();
    const key = `${requestBody.user_id}-${requestBody.skill_id}`;

    if (shouldFail) {
      shouldFail = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Forced failure for rollback test' }),
      });
      return;
    }

    if (method === 'PUT') {
      matrixData.userSkills[key] = {
        proficiency_level: requestBody.proficiency_level,
        notes: requestBody.notes || '',
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: requestBody.user_id,
          skill_id: requestBody.skill_id,
          proficiency_level: requestBody.proficiency_level,
          notes: requestBody.notes || '',
        }),
      });
      return;
    }

    delete matrixData.userSkills[key];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'User skill deleted successfully' }),
    });
  });

  await page.route('**/api/skills**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postData() ? request.postDataJSON() : null;

    if (!currentUser.is_admin) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Admin access required' }),
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/merge')) {
      const survivingSkill = getSkillById(body.surviving_skill_id);
      const mergedSkills = (body.merged_skill_ids || []).map((id) => getSkillById(id)).filter(Boolean);

      if (!survivingSkill || mergedSkills.length === 0) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Select a surviving skill and at least one duplicate skill' }),
        });
        return;
      }

      const desiredName = (body.desired_name || '').trim();
      const skillMap = getSkillMap();
      const existingSkill = desiredName ? skillMap.get(desiredName.toLowerCase()) : null;
      if (existingSkill && ![survivingSkill.id, ...mergedSkills.map((skill) => skill.id)].includes(existingSkill.id)) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(buildConflictResponse(existingSkill)),
        });
        return;
      }

      if (desiredName) {
        survivingSkill.name = desiredName;
        survivingSkill.preferred_label = desiredName;
      }
      if (body.target_category_id) {
        survivingSkill.category_id = Number(body.target_category_id);
        survivingSkill.category_path = categoryPathMap.get(survivingSkill.category_id);
      }
      matrixData.skills = matrixData.skills.filter(
        (skill) => !mergedSkills.some((mergedSkill) => mergedSkill.id === skill.id)
      );

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Skills merged successfully',
          skill: clone(survivingSkill),
        }),
      });
      return;
    }

    if (request.method() === 'POST') {
      const normalizedName = (body.name || '').trim();
      const skillMap = getSkillMap();
      const existingSkill = skillMap.get(normalizedName.toLowerCase());
      if (existingSkill) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(buildConflictResponse(existingSkill)),
        });
        return;
      }

      const categoryId = Number(body.category_id);
      const category = categoryMap.get(categoryId);
      const newSkill = {
        id: getNextSkillId(),
        name: normalizedName,
        preferred_label: normalizedName,
        category_id: categoryId,
        category_path: categoryPathMap.get(categoryId),
        category_name: category?.name || null,
        description: body.description || null,
        lifecycle_status: 'active',
      };

      matrixData.skills = [...matrixData.skills, newSkill];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newSkill),
      });
      return;
    }

    const skillId = Number(url.pathname.split('/').pop());
    const skill = getSkillById(skillId);
    if (!skill) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Skill not found' }),
      });
      return;
    }

    if (request.method() === 'PUT') {
      if (body.name) {
        const normalizedName = body.name.trim();
        const skillMap = getSkillMap();
        const existingSkill = skillMap.get(normalizedName.toLowerCase());
        if (existingSkill && existingSkill.id !== skill.id) {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify(buildConflictResponse(existingSkill)),
          });
          return;
        }
        skill.name = normalizedName;
        skill.preferred_label = normalizedName;
      }

      if (body.category_id !== undefined) {
        skill.category_id = Number(body.category_id);
        skill.category_path = categoryPathMap.get(skill.category_id);
      }

      if (body.description !== undefined) {
        skill.description = body.description;
      }

      if (body.lifecycle_status !== undefined) {
        skill.lifecycle_status = body.lifecycle_status;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(clone(skill)),
      });
      return;
    }

    if (request.method() === 'DELETE') {
      matrixData.skills = matrixData.skills.filter((entry) => entry.id !== skill.id);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Skill deleted successfully' }),
      });
      return;
    }

    await route.continue();
  });
}
