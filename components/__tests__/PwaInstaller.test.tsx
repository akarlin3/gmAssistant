import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PwaInstaller } from '@/src/components/PwaInstaller';
import manifest from '@/app/manifest';

describe('PWA Manifest & PwaInstaller', () => {
  const registerMock = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    registerMock.mockClear();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerMock },
      configurable: true,
    });
  });

  it('manifest() returns required standalone PWA fields, icons, and shortcuts', () => {
    const m = manifest();
    expect(m.name).toBe('GM Assistant — TTRPG Campaign & Table Suite');
    expect(m.short_name).toBe('GM Assistant');
    expect(m.description).toBe(
      'Offline-first TTRPG campaign prep, at-the-table run tools, and player-mode reveals.'
    );
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.orientation).toBe('any');
    expect(m.background_color).toBe('#090d16');
    expect(m.theme_color).toBe('#090d16');
    expect(m.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '192x192', purpose: 'maskable' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ])
    );
    expect(m.shortcuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Run Session', url: '/?tab=run' }),
        expect.objectContaining({ name: 'Campaign Prep', url: '/?tab=prep' }),
      ])
    );
  });

  it('registers /sw.js and triggers deferredPrompt.prompt() on Install App click', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    render(<PwaInstaller />);

    expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const beforeInstallEvent = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(beforeInstallEvent, {
      prompt: promptMock,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    act(() => {
      window.dispatchEvent(beforeInstallEvent);
    });

    const installBtn = await screen.findByRole('button', { name: /install app/i });
    expect(installBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(installBtn);
    });

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalledTimes(1);
    });
  });

  it('hides Install App button automatically when display-mode is standalone', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    render(<PwaInstaller />);

    const beforeInstallEvent = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(beforeInstallEvent, {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    act(() => {
      window.dispatchEvent(beforeInstallEvent);
    });

    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();
  });
});
