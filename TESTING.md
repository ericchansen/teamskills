# Testing Guide

This project has comprehensive testing at three levels: Backend API tests, Frontend component tests, and End-to-End browser tests.

## Quick Start

```bash
# Run all tests
npm test

# Run all tests including E2E
npm run test:all

# Run tests in Docker (isolated environment)
npm run test:docker
```

## Test Structure

```
teamskills/
├── backend/tests/          # Backend API tests (Jest + Supertest)
│   ├── users.test.js
│   ├── skills.test.js
│   └── matrix.test.js
├── frontend/src/tests/     # Frontend component tests (Vitest)
│   ├── ProficiencyBadge.test.jsx
│   └── SkillMatrix.test.jsx
└── tests/e2e/              # End-to-end tests (Playwright)
    ├── matrix.spec.js
    ├── userProfile.spec.js
    └── workflows.spec.js
```

## Backend API Tests

**Framework**: Jest + Supertest  
**What it tests**: API endpoints with mocked database

### Run Backend Tests

```bash
# Run all backend tests
npm run test:backend

# Run with watch mode
npx jest --watch

# Run with coverage
npx jest --coverage
```

### Example Test

```javascript
describe('GET /api/users', () => {
  test('should return all users', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

### Writing Backend Tests

1. Create test file in `backend/tests/`
2. Import required modules
3. Mock database with `jest.mock('../db')`
4. Write tests using `describe` and `test`
5. Use Supertest to make HTTP requests
6. Assert responses with Jest expectations

## Frontend Component Tests

**Framework**: Vitest + React Testing Library  
**What it tests**: React components in isolation

### Run Frontend Tests

```bash
# Run all frontend tests
npm run test:frontend

# Run with watch mode
cd frontend && npm run test:watch

# Run with UI
cd frontend && npm run test:ui
```

### Example Test

```javascript
test('renders L300 badge with correct color', () => {
  render(<ProficiencyBadge level="L300" />);
  const badge = screen.getByText('L300 - Practitioner');
  expect(badge).toBeInTheDocument();
  expect(badge).toHaveStyle({ color: '#0078d4' });
});
```

### Writing Frontend Tests

1. Create test file in `frontend/src/tests/`
2. Import component and testing utilities
3. Use `render()` to render component
4. Use `screen` queries to find elements
5. Simulate user interactions with `userEvent`
6. Assert with Jest-DOM matchers

## End-to-End Tests

**Framework**: Playwright  
**What it tests**: Complete user workflows in real browser

### Run E2E Tests

```bash
# Run E2E tests (requires app to be running)
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run specific test file
npx playwright test tests/e2e/matrix.spec.js

# Run in headed mode (see browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug
```

### Example Test

```javascript
test('should add skill to user', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Sarah Chen');
  await page.click('text=Add Skill');
  await page.fill('input[placeholder="Type to search"]', 'Azure');
  await page.click('text=Azure Functions');
  await page.check('input[value="L300"]');
  await page.click('button[type="submit"]');
  await expect(page.locator('text=Azure Functions')).toBeVisible();
});
```

### Writing E2E Tests

1. Create test file in `tests/e2e/`
2. Import Playwright test utilities
3. Use `page` object to interact with browser
4. Navigate with `page.goto()`
5. Interact with `page.click()`, `page.fill()`, etc.
6. Assert with Playwright expectations

## Running Tests in Docker

Docker provides an isolated, consistent testing environment.

### Setup

```bash
# Build and run all tests in Docker
npm run test:docker
```

This starts:
- PostgreSQL test database
- Backend API with test data
- Frontend dev server
- Playwright container for E2E tests

### Benefits

- ✅ No local setup needed
- ✅ Same environment as CI/CD
- ✅ Tests don't affect development database
- ✅ Runs on any machine with Docker

## Test Coverage

### Generate Coverage Report

```bash
# Backend coverage
npx jest --coverage

# Frontend coverage
cd frontend && npx vitest run --coverage
```

Coverage reports are generated in:
- `coverage/backend/` - Backend coverage
- `frontend/coverage/` - Frontend coverage

## Debugging Tests

### Backend Tests

```javascript
// Add console.log
console.log('Response:', response.body);

// Use debugger
debugger;

// Run single test
npx jest -t "should return all users"
```

### Frontend Tests

```javascript
// Use screen.debug()
screen.debug();

// Log component
console.log(container.innerHTML);

// Run single test
npx vitest run -t "renders L300 badge"
```

### E2E Tests

```bash
# Debug mode (step through)
npx playwright test --debug

# Headed mode (see browser)
npx playwright test --headed

# Trace viewer
npx playwright show-trace trace.zip
```

## CI/CD Integration

Tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: |
    npm install
    npm run test:docker
```

## Common Issues

### Backend Tests

**Issue**: Tests fail with database errors  
**Solution**: Check that database mocks are set up correctly

**Issue**: Port conflicts  
**Solution**: Stop local servers before running tests

### Frontend Tests

**Issue**: Component not found  
**Solution**: Use `await waitFor()` for async operations

**Issue**: Styled components not rendering  
**Solution**: Ensure CSS is imported in test setup

### E2E Tests

**Issue**: Tests timeout  
**Solution**: Increase timeout in `playwright.config.js`

**Issue**: App not starting  
**Solution**: Ensure Docker services are healthy

**Issue**: Element not found  
**Solution**: Wait for element with `await expect().toBeVisible()`

## Best Practices

### General

- ✅ Write tests alongside features
- ✅ Test behavior, not implementation
- ✅ Keep tests independent
- ✅ Use descriptive test names
- ✅ Follow AAA pattern (Arrange, Act, Assert)

### Backend

- ✅ Mock external dependencies
- ✅ Test happy path and error cases
- ✅ Verify response status and body
- ✅ Test validation and error handling

### Frontend

- ✅ Test from user's perspective
- ✅ Use semantic queries (`getByRole`, `getByLabelText`)
- ✅ Avoid testing implementation details
- ✅ Mock API calls

### E2E

- ✅ Test critical user workflows
- ✅ Use data-testid for complex selectors
- ✅ Keep tests stable (avoid flaky tests)
- ✅ Test realistic scenarios

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
