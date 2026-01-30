import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProficiencyBadge from '../components/ProficiencyBadge';

describe('ProficiencyBadge', () => {
  test('renders L100 badge with correct color', () => {
    render(<ProficiencyBadge level="L100" />);
    const badge = screen.getByText('L100 - Awareness');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ color: '#d13438' });
  });

  test('renders L200 badge with correct color', () => {
    render(<ProficiencyBadge level="L200" />);
    const badge = screen.getByText('L200 - Understanding');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ color: '#ca5010' });
  });

  test('renders L300 badge with correct color', () => {
    render(<ProficiencyBadge level="L300" />);
    const badge = screen.getByText('L300 - Practitioner');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ color: '#0078d4' });
  });

  test('renders L400 badge with correct color', () => {
    render(<ProficiencyBadge level="L400" />);
    const badge = screen.getByText('L400 - Expert');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ color: '#107c10' });
  });

  test('renders compact version', () => {
    render(<ProficiencyBadge level="L300" compact />);
    const badge = screen.getByText('L300');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('compact');
  });

  test('returns null for invalid level', () => {
    const { container } = render(<ProficiencyBadge level="INVALID" />);
    expect(container.firstChild).toBeNull();
  });

  test('returns null for missing level', () => {
    const { container } = render(<ProficiencyBadge />);
    expect(container.firstChild).toBeNull();
  });
});
