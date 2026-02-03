import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatPanel from '../components/ChatPanel';

// Mock fetch globally
global.fetch = vi.fn();

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders toggle button when closed', () => {
    render(<ChatPanel isOpen={false} onToggle={() => {}} />);
    const button = screen.getByTitle('Open chat assistant');
    expect(button).toBeInTheDocument();
    // Button now contains an SVG icon instead of emoji
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  test('renders panel when open', () => {
    render(<ChatPanel isOpen={true} onToggle={() => {}} />);
    expect(screen.getByText('🤖 Skills Assistant')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask about team skills...')).toBeInTheDocument();
  });

  test('shows welcome message when no messages', () => {
    render(<ChatPanel isOpen={true} onToggle={() => {}} />);
    expect(screen.getByText(/Hi! I can help you find team members/)).toBeInTheDocument();
    expect(screen.getByText(/"Who knows Kubernetes\?"/)).toBeInTheDocument();
  });

  test('calls onToggle when toggle button clicked', () => {
    const onToggle = vi.fn();
    render(<ChatPanel isOpen={false} onToggle={onToggle} />);
    
    fireEvent.click(screen.getByTitle('Open chat assistant'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('calls onToggle when close button clicked', () => {
    const onToggle = vi.fn();
    render(<ChatPanel isOpen={true} onToggle={onToggle} />);
    
    fireEvent.click(screen.getByTitle('Close chat'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('input field is enabled when not loading', () => {
    render(<ChatPanel isOpen={true} onToggle={() => {}} />);
    const input = screen.getByPlaceholderText('Ask about team skills...');
    expect(input).not.toBeDisabled();
  });

  test('send button is disabled when input is empty', () => {
    render(<ChatPanel isOpen={true} onToggle={() => {}} />);
    const button = screen.getByRole('button', { name: '→' });
    expect(button).toBeDisabled();
  });

  test('send button is enabled when input has text', () => {
    render(<ChatPanel isOpen={true} onToggle={() => {}} />);
    const input = screen.getByPlaceholderText('Ask about team skills...');
    
    fireEvent.change(input, { target: { value: 'Hello' } });
    
    const button = screen.getByRole('button', { name: '→' });
    expect(button).not.toBeDisabled();
  });

  test('shows user message after submit', async () => {
    // Mock SSE response
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"type":"content","content":"Hello!"}\n\n')
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"type":"done"}\n\n')
        })
        .mockResolvedValueOnce({ done: true })
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => mockReader
      }
    });

    render(<ChatPanel isOpen={true} onToggle={() => {}} />);
    
    const input = screen.getByPlaceholderText('Ask about team skills...');
    fireEvent.change(input, { target: { value: 'Who knows Python?' } });
    fireEvent.submit(input.closest('form'));

    // User message should appear
    await waitFor(() => {
      expect(screen.getByText('Who knows Python?')).toBeInTheDocument();
    });
  });

  test('displays error message on fetch failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    render(<ChatPanel isOpen={true} onToggle={() => {}} />);
    
    const input = screen.getByPlaceholderText('Ask about team skills...');
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
