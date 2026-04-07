/**
 * Tests for DeviceAuthTab — 3-step wizard
 *
 * Step 1: Device code sign-in  (renders on mount, copy button, manual "I've authenticated" advance)
 * Step 2: Service principal name input
 * Step 3: SP credentials preview + "Validate Now" callback
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// We need to mock fetch before importing the component
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock navigator.clipboard
Object.defineProperty(global.navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  writable: true,
});

// Import after globals are set up
import { DeviceAuthTab } from '../app/components/DeviceAuthTab';

const DEVICE_CODE_RESPONSE = {
  session_id: 'sess-abc123',
  user_code: 'ABCD1234',
  verification_url: 'https://microsoft.com/devicelogin',
  message: 'Go to https://microsoft.com/devicelogin and enter code: ABCD1234',
  expires_in: 900,
};

const CREATE_SP_RESPONSE = {
  session_id: 'sess-abc123',
  service_principal: {
    appId: 'app-id-xyz',
    displayName: 'test-sp',
    password: 'super-secret-password',
    tenant: 'tenant-id-abc',
  },
  subscription_id: 'sub-id-123',
  account_name: 'user@example.com',
  message: 'Service principal created successfully',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('DeviceAuthTab', () => {
  it('renders step 1 on mount and starts device auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => DEVICE_CODE_RESPONSE,
    });

    render(<DeviceAuthTab />);

    // Should show loading / start state initially
    // After fetch resolves, should show user code
    await waitFor(() => {
      expect(screen.getByText('ABCD1234')).toBeInTheDocument();
    });

    expect(screen.getByText(/Sign in with Azure/i)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/device-auth/start', expect.objectContaining({ method: 'POST' }));
  });

  it('copy code button calls clipboard.writeText with the user code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => DEVICE_CODE_RESPONSE,
    });

    render(<DeviceAuthTab />);

    await waitFor(() => {
      expect(screen.getByText('ABCD1234')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /copy code/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCD1234');
  });

  it('clicking "I\'ve authenticated" advances to step 2', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => DEVICE_CODE_RESPONSE,
    });

    render(<DeviceAuthTab />);

    await waitFor(() => {
      expect(screen.getByText('ABCD1234')).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /i've authenticated/i });
    fireEvent.click(nextBtn);

    // Step 2 should be visible
    expect(screen.getByRole('heading', { name: /Create service principal/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/my-app-sp/i)).toBeInTheDocument();
  });

  it('step 2: submitting SP name calls create-sp API and advances to step 3', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => DEVICE_CODE_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => CREATE_SP_RESPONSE });

    render(<DeviceAuthTab />);

    // Advance to step 2
    await waitFor(() => expect(screen.getByText('ABCD1234')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /i've authenticated/i }));

    // Fill in SP name and submit
    const nameInput = screen.getByPlaceholderText(/my-app-sp/i);
    fireEvent.change(nameInput, { target: { value: 'test-sp' } });
    fireEvent.click(screen.getByRole('button', { name: /create service principal/i }));

    // Should call the create-sp endpoint
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/device-auth/sess-abc123/create-sp',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Step 3: credentials preview
    await waitFor(() => {
      expect(screen.getByText(/service principal created/i)).toBeInTheDocument();
    });

    // Should show appId and tenant — NOT the password
    expect(screen.getByText('app-id-xyz')).toBeInTheDocument();
    expect(screen.getByText('tenant-id-abc')).toBeInTheDocument();
    expect(screen.queryByText('super-secret-password')).not.toBeInTheDocument();
  });

  it('step 3: "Validate Now" calls onValidate callback with correct args', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => DEVICE_CODE_RESPONSE })
      .mockResolvedValueOnce({ ok: true, json: async () => CREATE_SP_RESPONSE });

    const onValidate = jest.fn();
    render(<DeviceAuthTab onValidate={onValidate} />);

    // Navigate through all steps
    await waitFor(() => expect(screen.getByText('ABCD1234')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /i've authenticated/i }));

    const nameInput = screen.getByPlaceholderText(/my-app-sp/i);
    fireEvent.change(nameInput, { target: { value: 'test-sp' } });
    fireEvent.click(screen.getByRole('button', { name: /create service principal/i }));

    await waitFor(() => expect(screen.getByText(/service principal created/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /validate now/i }));

    expect(onValidate).toHaveBeenCalledWith(
      {
        tenant_id: 'tenant-id-abc',
        client_id: 'app-id-xyz',
        client_secret: 'super-secret-password',
        display_name: 'test-sp',
      },
      'sub-id-123'
    );
  });
});
