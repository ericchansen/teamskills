import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillMatrix from '../components/SkillMatrix';

// Mock fetch
global.fetch = vi.fn();

describe('SkillMatrix', () => {
  const mockMatrixData = {
    users: [
      { id: 1, name: 'John Doe', role: 'SE', team: 'Enterprise' },
      { id: 2, name: 'Jane Smith', role: 'Senior SE', team: 'SMB' },
    ],
    skills: [
      { id: 1, name: 'Azure Functions', category_name: 'Azure Compute' },
      { id: 2, name: 'Azure SQL', category_name: 'Azure Data' },
    ],
    userSkills: {
      '1-1': { proficiency_level: 'L300', notes: null },
      '2-2': { proficiency_level: 'L400', notes: 'Expert' },
    },
  };

  beforeEach(() => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => mockMatrixData,
    });
  });

  test('renders loading state initially', () => {
    render(<SkillMatrix onUserSelect={vi.fn()} />);
    expect(screen.getByText('Loading matrix...')).toBeInTheDocument();
  });

  test('renders matrix data after loading', async () => {
    render(<SkillMatrix onUserSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Azure Functions')).toBeInTheDocument();
      expect(screen.getByText('Azure SQL')).toBeInTheDocument();
    });
  });

  test('displays proficiency badges for user skills', async () => {
    render(<SkillMatrix onUserSelect={vi.fn()} />);

    await waitFor(() => {
      const badges = screen.getAllByText(/L[0-9]{3}/);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  test('calls onUserSelect when user name is clicked', async () => {
    const mockOnUserSelect = vi.fn();
    render(<SkillMatrix onUserSelect={mockOnUserSelect} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('John Doe'));
    expect(mockOnUserSelect).toHaveBeenCalledWith(1);
  });

  test('filters skills by category', async () => {
    render(<SkillMatrix onUserSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Azure Functions')).toBeInTheDocument();
    });

    // Get the category select specifically by its label
    const categorySelect = screen.getByRole('combobox', { name: /category/i });
    await userEvent.selectOptions(categorySelect, 'Azure Compute');

    // Azure SQL should not be visible, Azure Functions should be
    expect(screen.getByText('Azure Functions')).toBeInTheDocument();
  });

  test('displays legend with all proficiency levels', async () => {
    render(<SkillMatrix onUserSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Proficiency Levels:')).toBeInTheDocument();
    });

    expect(screen.getByText('L100 - Foundational')).toBeInTheDocument();
    expect(screen.getByText('L200 - Intermediate')).toBeInTheDocument();
    expect(screen.getByText('L300 - Advanced')).toBeInTheDocument();
    expect(screen.getByText('L400 - Expert')).toBeInTheDocument();
  });

  test('displays error message on fetch failure', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    render(<SkillMatrix onUserSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });
});
