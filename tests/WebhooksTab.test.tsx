/**
 * Tests for WebhooksTab — config form + delivery history
 *
 * (a) renders loading state on mount
 * (b) populates form from config response
 * (c) save button calls PUT /api/webhooks/config
 * (d) deliveries list renders correctly
 * (e) empty state when no deliveries
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock fetch before importing component
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { WebhooksTab } from '../app/components/WebhooksTab';

const CONFIG_RESPONSE = {
  url: 'https://n8n.myapp.com/webhook/azure',
  enabled: true,
  has_secret: true,
  updated_at: '2026-03-19T10:00:00Z',
};

const DELIVERIES_RESPONSE = {
  deliveries: [
    {
      id: 'd1',
      validation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      http_status: 200,
      success: true,
      attempted_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2m ago
    },
    {
      id: 'd2',
      validation_id: 'b12c4444-1111-2222-3333-444444444444',
      http_status: 200,
      success: true,
      attempted_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(), // 1h ago
    },
    {
      id: 'd3',
      validation_id: '991e0000-dead-beef-cafe-123456789012',
      http_status: null,
      success: false,
      attempted_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3h ago
    },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('WebhooksTab', () => {
  it('renders a loading indicator before fetches resolve', () => {
    // Never resolves — stays loading
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<WebhooksTab />);

    // Should show some loading indicator
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('populates form fields from config response', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => DELIVERIES_RESPONSE });

    render(<WebhooksTab />);

    await waitFor(() => {
      const urlInput = screen.getByPlaceholderText(/https:\/\//i);
      expect(urlInput).toHaveValue('https://n8n.myapp.com/webhook/azure');
    });

    // enabled toggle should be on — find the toggle by role switch
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Secret input should be empty (write-only) but placeholder shows masking
    const secretInput = screen.getByPlaceholderText(/••••/);
    expect(secretInput).toHaveValue('');
  });

  it('save button calls PUT /api/webhooks/config with form values', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => DELIVERIES_RESPONSE });

    render(<WebhooksTab />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\//i)).toHaveValue('https://n8n.myapp.com/webhook/azure');
    });

    // Set up mock for the PUT call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...CONFIG_RESPONSE, success: true }),
    });

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        (call) => call[0] === '/api/webhooks/config' && call[1]?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall[1].body);
      expect(body.url).toBe('https://n8n.myapp.com/webhook/azure');
      expect(body.enabled).toBe(true);
    });
  });

  it('save does not include secret_header when input is empty', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => DELIVERIES_RESPONSE });

    render(<WebhooksTab />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\//i)).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...CONFIG_RESPONSE }),
    });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        (call) => call[0] === '/api/webhooks/config' && call[1]?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall[1].body);
      expect(body.secret_header).toBeUndefined();
    });
  });

  it('shows inline success feedback after save', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => DELIVERIES_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...CONFIG_RESPONSE }) });

    render(<WebhooksTab />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/https:\/\//i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
  });

  it('renders deliveries list with correct status indicators', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => DELIVERIES_RESPONSE });

    render(<WebhooksTab />);

    await waitFor(() => {
      expect(screen.getByText('Recent Deliveries')).toBeInTheDocument();
    });

    // Should show truncated validation IDs
    expect(screen.getByText(/3fa8/)).toBeInTheDocument();
    expect(screen.getByText(/b12c/)).toBeInTheDocument();
    expect(screen.getByText(/991e/)).toBeInTheDocument();

    // Should show relative times
    expect(screen.getByText(/2m ago/)).toBeInTheDocument();
  });

  it('shows empty state when no deliveries', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deliveries: [] }) });

    render(<WebhooksTab />);

    await waitFor(() => {
      expect(screen.getByText(/no deliveries yet/i)).toBeInTheDocument();
    });
  });

  it('Test button shows "coming soon" message when clicked', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => CONFIG_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => DELIVERIES_RESPONSE });

    render(<WebhooksTab />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /test/i }));

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
