import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { render } from 'preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MSG } from '@/shared/constants';

vi.mock('@/pages/slack/request-panel', () => ({ SlackRequestPanel: () => null }));

let root: HTMLDivElement;

beforeEach(() => {
    vi.resetModules();
    const stored: Record<string, unknown> = {};
    const watchers = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
    vi.stubGlobal('chrome', {
        i18n: { getMessage: (key: string) => (key === 'roleHost' ? 'Host' : key === 'roleClient' ? 'Client' : key) },
        runtime: {
            onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
            sendMessage: vi.fn(async (message: { type: string }) => {
                if (message.type !== MSG.OPTIONS_GET_STATUS) return { ok: true };
                return {
                    ok: true,
                    state: 'idle',
                    role: null,
                    connectionId: null,
                    authorized: false,
                    error: null,
                    pairing: { phase: 'idle', code: null, expiresAt: null, pending: null, pair: null, error: null }
                };
            })
        },
        storage: {
            onChanged: {
                addListener: (
                    listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
                ) => watchers.add(listener),
                removeListener: (
                    listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
                ) => watchers.delete(listener)
            },
            local: {
                get: vi.fn(
                    (
                        keys: string[] | Record<string, unknown>,
                        callback?: (values: Record<string, unknown>) => void
                    ) => {
                        const values = Array.isArray(keys) ? {} : { ...keys };
                        for (const key of Object.keys(stored)) values[key] = stored[key];
                        callback?.(values);
                        return Promise.resolve(values);
                    }
                ),
                set: vi.fn(async (values: Record<string, unknown>, callback?: () => void) => {
                    const changes: Record<string, chrome.storage.StorageChange> = {};
                    for (const [key, value] of Object.entries(values)) {
                        changes[key] = { oldValue: stored[key], newValue: value };
                        stored[key] = value;
                    }
                    for (const watcher of watchers) watcher(changes, 'local');
                    callback?.();
                })
            }
        }
    });
    root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
});

afterEach(() => {
    render(null, root);
    root.remove();
    vi.unstubAllGlobals();
});

it('makes pairing controls usable immediately after choosing a role, without reloading options', async () => {
    await import('@/pages/options/index');
    fireEvent.click(await screen.findByRole('button', { name: 'Host' }));
    await waitFor(() => expect(screen.queryByTestId('pairing-generate')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Client' }));
    await waitFor(() => expect(screen.queryByTestId('pairing-code-input')).not.toBeNull());
    expect(screen.queryByTestId('pairing-generate')).toBeNull();
});
