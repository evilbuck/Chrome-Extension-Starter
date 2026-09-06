import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MSG } from '@/shared/constants';
import type { PairingCommand, PairingFailure, PairingPhase, PairingSnapshot } from '@/shared/lib/pairing-protocol';

vi.mock('@/pages/slack/request-panel', () => ({ SlackRequestPanel: () => null }));

const LOCKED_COPY = 'This role is locked until you forget the pair.';

const FAILURE_COPY: Record<PairingFailure, string> = {
    invalid_code: 'That code is not valid.',
    expired: 'The pairing code expired. Generate a new one.',
    busy: 'Another browser is already pairing with this code.',
    rejected: 'The other browser rejected this pair.',
    cancelled: 'Pairing was cancelled.',
    disconnected: 'The browsers are not connected.',
    unpaired: 'This browser is not paired.',
    invalid_peer: 'The other browser did not match the pending pair.',
    invalid_message: 'The pairing request was not valid.',
    rate_limited: 'Too many pairing attempts. Try again in a moment.',
    unavailable: 'The pairing service is unavailable.',
    connection_failed: 'The browsers could not connect.'
};

const PHASE_COPY: Record<PairingPhase, string> = {
    idle: 'No pair yet',
    creating: 'Creating a pairing code',
    waiting: 'Waiting for the other browser',
    confirming: 'Confirm the other browser',
    connecting: 'Connecting',
    connected: 'Connected',
    disconnected: 'Disconnected',
    expired: 'The pairing code expired',
    rejected: 'Pairing was rejected',
    failed: 'Pairing failed'
};

const LOCKING_PHASES: PairingPhase[] = ['creating', 'waiting', 'confirming', 'connecting', 'connected'];

const idlePairing = (): PairingSnapshot => ({
    phase: 'idle',
    code: null,
    expiresAt: null,
    pending: null,
    pair: null,
    error: null
});

type TransportStatus = {
    ok: true;
    state: string;
    role: 'host' | 'client' | null;
    connectionId: string | null;
    authorized: boolean;
    error: string | null;
    pairing: PairingSnapshot;
};

const idleStatus = (): TransportStatus => ({
    ok: true,
    state: 'idle',
    role: null,
    connectionId: null,
    authorized: false,
    error: null,
    pairing: idlePairing()
});

const pair = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    role: 'host' as const,
    peer: { publicKey: 'AAAA', label: 'Other browser' },
    createdAt: 1
};

const attemptId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

let root: HTMLDivElement;
let currentStatus: TransportStatus;
let getStatusReply: (() => unknown) | null;
let pairingHandler: ((payload: unknown) => unknown) | null;
let pairingThrows: boolean;
let disconnectReply: unknown;
let disconnectThrows: boolean;
let echoReply: unknown;
let echoThrows: boolean;
let sendMessage: ReturnType<typeof vi.fn>;
let openOptionsPage: ReturnType<typeof vi.fn>;
const runtimeListeners: Array<(message: unknown) => void> = [];
let stored: Record<string, unknown>;

const pairingCalls = (): PairingCommand[] =>
    sendMessage.mock.calls
        .map((args) => args[0] as { type?: string; payload?: PairingCommand })
        .filter((message) => message.type === MSG.PAIRING)
        .map((message) => message.payload)
        .filter((payload): payload is PairingCommand => payload != null);

const emitOffscreenEvent = (message: unknown = { type: MSG.OFFSCREEN_EVENT }): void => {
    for (const listener of runtimeListeners) listener(message);
};

const loadOptions = async (): Promise<void> => {
    await import('@/pages/options/index');
    await waitFor(() => expect(runtimeListeners.length).toBeGreaterThan(0));
};

const loadPopup = async (): Promise<void> => {
    await import('@/pages/popup/index');
    await waitFor(() => expect(runtimeListeners.length).toBeGreaterThan(0));
};

beforeEach(() => {
    vi.resetModules();
    currentStatus = idleStatus();
    getStatusReply = null;
    pairingHandler = null;
    pairingThrows = false;
    disconnectReply = { ok: true };
    disconnectThrows = false;
    echoReply = { ok: true, requestId: 'echo-1' };
    echoThrows = false;
    runtimeListeners.length = 0;
    stored = {};
    const watchers = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
    sendMessage = vi.fn(async (message: { type: string; payload?: unknown }) => {
        if (message.type === MSG.OPTIONS_GET_STATUS) {
            return getStatusReply ? getStatusReply() : currentStatus;
        }
        if (message.type === MSG.PAIRING) {
            if (pairingThrows) throw new Error('pairing-unavailable');
            if (pairingHandler) return pairingHandler(message.payload);
            return { ok: true };
        }
        if (message.type === MSG.OPTIONS_DISCONNECT) {
            if (disconnectThrows) throw new Error('disconnect-unavailable');
            return disconnectReply;
        }
        if (message.type === MSG.OPTIONS_SEND_SYNTHETIC) {
            if (echoThrows) throw new Error('echo-unavailable');
            return echoReply;
        }
        return { ok: true };
    });
    openOptionsPage = vi.fn();
    vi.stubGlobal('chrome', {
        i18n: {
            getMessage: (key: string) =>
                key === 'roleHost'
                    ? 'Host'
                    : key === 'roleClient'
                      ? 'Client'
                      : key === 'pairingRoleLocked'
                        ? LOCKED_COPY
                        : key
        },
        runtime: {
            onMessage: {
                addListener: vi.fn((listener: (message: unknown) => void) => {
                    runtimeListeners.push(listener);
                }),
                removeListener: vi.fn((listener: (message: unknown) => void) => {
                    const index = runtimeListeners.indexOf(listener);
                    if (index >= 0) runtimeListeners.splice(index, 1);
                })
            },
            sendMessage,
            openOptionsPage
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

describe('host generate', () => {
    it('sends create and shows waiting code plus countdown', async () => {
        const expiresAt = Date.now() + 90_000;
        pairingHandler = (payload) => {
            currentStatus.pairing = {
                phase: 'waiting',
                code: 'AB3DE',
                expiresAt,
                pending: null,
                pair: null,
                error: null
            };
            return { ok: true, pairing: currentStatus.pairing, echo: payload };
        };
        await loadOptions();
        fireEvent.click(await screen.findByRole('button', { name: 'Host' }));
        await waitFor(() => expect(screen.queryByTestId('pairing-generate')).not.toBeNull());
        fireEvent.click(screen.getByTestId('pairing-generate'));
        await waitFor(() => expect(screen.queryByTestId('pairing-code')).not.toBeNull());
        expect(pairingCalls()).toContainEqual({ action: 'create', label: 'Host browser' });
        expect(screen.getByTestId('pairing-code').textContent?.trim()).toBe('AB3DE');
        expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.waiting);
        expect(screen.getByTestId('pairing-countdown').textContent).toMatch(/^\d{2}:\d{2}$/);
        expect(screen.queryByTestId('pairing-cancel')).not.toBeNull();
        expect(screen.queryByTestId('pairing-generate')).toBeNull();
        expect((screen.getByRole('button', { name: 'Host' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(LOCKED_COPY).textContent).toBe(LOCKED_COPY);
    });
});

describe('client join', () => {
    it('sends join with a valid code and does not send an invalid code', async () => {
        pairingHandler = (payload) => {
            currentStatus.pairing = {
                phase: 'confirming',
                code: null,
                expiresAt: null,
                pending: {
                    attemptId,
                    peer: { publicKey: 'BBBB', label: 'Joining browser' },
                    confirmed: false
                },
                pair: null,
                error: null
            };
            return { ok: true, pairing: currentStatus.pairing, echo: payload };
        };
        await loadOptions();
        fireEvent.click(await screen.findByRole('button', { name: 'Client' }));
        await waitFor(() => expect(screen.queryByTestId('pairing-code-input')).not.toBeNull());
        const join = () => screen.getByTestId('pairing-join') as HTMLButtonElement;
        expect(join().disabled).toBe(true);
        fireEvent.input(screen.getByTestId('pairing-code-input'), { target: { value: 'aaaa' } });
        await waitFor(() => expect((screen.getByTestId('pairing-code-input') as HTMLInputElement).value).toBe('AAAA'));
        expect(join().disabled).toBe(true);
        expect(pairingCalls().filter((command) => command.action === 'join')).toHaveLength(0);
        fireEvent.input(screen.getByTestId('pairing-code-input'), { target: { value: 'AB3DE' } });
        await waitFor(() => expect(join().disabled).toBe(false));
        fireEvent.click(join());
        await waitFor(() =>
            expect(pairingCalls()).toContainEqual({ action: 'join', code: 'AB3DE', label: 'Client browser' })
        );
        await waitFor(() => expect(screen.getByTestId('pairing-confirm')).not.toBeNull());
    });
});

describe('pending confirm', () => {
    it('shows the pending peer and sends confirm with attemptId', async () => {
        currentStatus.role = 'host';
        currentStatus.pairing = {
            phase: 'confirming',
            code: 'AB3DE',
            expiresAt: null,
            pending: {
                attemptId,
                peer: { publicKey: 'BBBB', label: 'Joining browser' },
                confirmed: false
            },
            pair: null,
            error: null
        };
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-confirm')).not.toBeNull());
        expect(screen.getByTestId('pairing-peer').textContent).toContain('Joining browser');
        expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.confirming);
        expect(screen.getByTestId('pairing-confirm').getAttribute('data-attempt-id')).toBe(attemptId);
        fireEvent.click(screen.getByTestId('pairing-confirm'));
        await waitFor(() => expect(pairingCalls()).toContainEqual({ action: 'confirm', attemptId }));
    });

    it('hides confirm once the pending peer is already confirmed', async () => {
        currentStatus.pairing = {
            phase: 'confirming',
            code: null,
            expiresAt: null,
            pending: {
                attemptId,
                peer: { publicKey: 'BBBB', label: 'Joining browser' },
                confirmed: true
            },
            pair: null,
            error: null
        };
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-reject')).not.toBeNull());
        expect(screen.queryByTestId('pairing-confirm')).toBeNull();
        fireEvent.click(screen.getByTestId('pairing-reject'));
        await waitFor(() => expect(pairingCalls()).toContainEqual({ action: 'cancel' }));
    });
});

describe('forget and disconnect', () => {
    it('sends forget and OPTIONS_DISCONNECT when a pair is set', async () => {
        currentStatus.role = 'host';
        currentStatus.pairing = {
            phase: 'disconnected',
            code: null,
            expiresAt: null,
            pending: null,
            pair,
            error: null
        };
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-forget')).not.toBeNull());
        expect(screen.getByTestId('pairing-peer').textContent).toContain('Other browser');
        expect(screen.queryByTestId('pairing-connect')).not.toBeNull();
        expect(screen.queryByTestId('pairing-disconnect')).not.toBeNull();
        expect((screen.getByRole('button', { name: 'Host' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(LOCKED_COPY).textContent).toBe(LOCKED_COPY);
        fireEvent.click(screen.getByTestId('pairing-forget'));
        await waitFor(() => expect(pairingCalls()).toContainEqual({ action: 'forget' }));
        fireEvent.click(screen.getByTestId('pairing-disconnect'));
        await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: MSG.OPTIONS_DISCONNECT }));
        fireEvent.click(screen.getByTestId('pairing-connect'));
        await waitFor(() => expect(pairingCalls()).toContainEqual({ action: 'connect' }));
    });

    it('shows unavailable copy when disconnect fails', async () => {
        currentStatus.pairing = { ...idlePairing(), phase: 'disconnected', pair };
        disconnectReply = { ok: false, error: 'timeout' };
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-disconnect')).not.toBeNull());
        fireEvent.click(screen.getByTestId('pairing-disconnect'));
        await waitFor(() => expect(screen.getByTestId('pairing-error').textContent).toBe(FAILURE_COPY.unavailable));
    });

    it('shows unavailable copy when disconnect throws', async () => {
        currentStatus.pairing = { ...idlePairing(), phase: 'disconnected', pair };
        disconnectThrows = true;
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-disconnect')).not.toBeNull());
        fireEvent.click(screen.getByTestId('pairing-disconnect'));
        await waitFor(() => expect(screen.getByTestId('pairing-error').textContent).toBe(FAILURE_COPY.unavailable));
    });
});

describe('failure copy', () => {
    it('renders FAILURE_COPY for each known pairing.error', async () => {
        await loadOptions();
        for (const [error, copy] of Object.entries(FAILURE_COPY) as Array<[PairingFailure, string]>) {
            currentStatus.pairing = { ...idlePairing(), phase: 'failed', error };
            emitOffscreenEvent();
            await waitFor(() => expect(screen.getByTestId('pairing-error').textContent).toBe(copy));
        }
    });

    it('shows unavailable copy when a pairing command fails with an unknown error', async () => {
        currentStatus.role = 'host';
        pairingHandler = () => ({ ok: false, error: 'not-a-real-failure' });
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-generate')).not.toBeNull());
        fireEvent.click(screen.getByTestId('pairing-generate'));
        await waitFor(() => expect(screen.getByTestId('pairing-error').textContent).toBe(FAILURE_COPY.unavailable));
    });

    it('shows known command failure copy from the pairing result', async () => {
        currentStatus.role = 'host';
        pairingHandler = () => ({ ok: false, error: 'busy' });
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-generate')).not.toBeNull());
        fireEvent.click(screen.getByTestId('pairing-generate'));
        await waitFor(() => expect(screen.getByTestId('pairing-error').textContent).toBe(FAILURE_COPY.busy));
    });

    it('shows unavailable copy when a pairing command throws', async () => {
        currentStatus.role = 'host';
        pairingThrows = true;
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-generate')).not.toBeNull());
        fireEvent.click(screen.getByTestId('pairing-generate'));
        await waitFor(() => expect(screen.getByTestId('pairing-error').textContent).toBe(FAILURE_COPY.unavailable));
    });
});

describe('phase copy', () => {
    it('renders PHASE_COPY and locks the role for in-flight phases', async () => {
        await loadOptions();
        for (const [phase, copy] of Object.entries(PHASE_COPY) as Array<[PairingPhase, string]>) {
            currentStatus.pairing = { ...idlePairing(), phase };
            emitOffscreenEvent();
            await waitFor(() => expect(screen.getByTestId('transport-state').textContent).toBe(copy));
            const host = screen.getByRole('button', { name: 'Host' }) as HTMLButtonElement;
            if (LOCKING_PHASES.includes(phase)) {
                expect(host.disabled).toBe(true);
                expect(screen.getByText(LOCKED_COPY).textContent).toBe(LOCKED_COPY);
            } else {
                expect(host.disabled).toBe(false);
                expect(screen.queryByText(LOCKED_COPY)).toBeNull();
            }
        }
    });

    it('shows cancel while creating a code', async () => {
        currentStatus.role = 'host';
        currentStatus.pairing = { ...idlePairing(), phase: 'creating' };
        await loadOptions();
        await waitFor(() => expect(screen.queryByTestId('pairing-cancel')).not.toBeNull());
        fireEvent.click(screen.getByTestId('pairing-cancel'));
        await waitFor(() => expect(pairingCalls()).toContainEqual({ action: 'cancel' }));
    });
});

describe('pairingLocksRole', () => {
    it('disables role buttons and shows locked copy when a pair is set', async () => {
        currentStatus.pairing = { ...idlePairing(), phase: 'disconnected', pair: { ...pair, role: 'client' } };
        await loadOptions();
        await waitFor(() => expect(screen.getByText(LOCKED_COPY).textContent).toBe(LOCKED_COPY));
        expect((screen.getByRole('button', { name: 'Host' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Client' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId('local-role').textContent).toBe('client');
    });

    it('locks the role while waiting or connected even without clicking a role', async () => {
        currentStatus.pairing = { ...idlePairing(), phase: 'waiting', code: 'AB3DE', expiresAt: Date.now() + 30_000 };
        await loadOptions();
        await waitFor(() => expect(screen.getByText(LOCKED_COPY).textContent).toBe(LOCKED_COPY));
        currentStatus.pairing = { ...idlePairing(), phase: 'connected', pair };
        emitOffscreenEvent();
        await waitFor(() => expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.connected));
        expect((screen.getByRole('button', { name: 'Host' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(LOCKED_COPY).textContent).toBe(LOCKED_COPY);
    });
});

describe('status updates', () => {
    it('refreshes from OPTIONS_GET_STATUS when OFFSCREEN_EVENT fires', async () => {
        await loadOptions();
        await waitFor(() => expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.idle));
        currentStatus = {
            ok: true,
            state: 'connected',
            role: 'host',
            connectionId: pair.id,
            authorized: true,
            error: null,
            pairing: {
                phase: 'connected',
                code: null,
                expiresAt: null,
                pending: null,
                pair,
                error: null
            }
        };
        emitOffscreenEvent({ type: 'NOT_AN_EVENT' });
        await Promise.resolve();
        expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.idle);
        emitOffscreenEvent();
        await waitFor(() => expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.connected));
        expect(screen.getByTestId('pairing-peer').textContent).toContain('Other browser');
        expect((screen.getByTestId('send-echo') as HTMLButtonElement).disabled).toBe(false);
    });

    it('ignores GET_STATUS payloads that asTransport cannot read', async () => {
        currentStatus = {
            ok: true,
            state: 'connected',
            role: 'host',
            connectionId: pair.id,
            authorized: true,
            error: null,
            pairing: { ...idlePairing(), phase: 'connected', pair }
        };
        await loadOptions();
        await waitFor(() => expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.connected));
        const calls = sendMessage.mock.calls.length;
        getStatusReply = () => ({ ok: true });
        emitOffscreenEvent();
        await waitFor(() => expect(sendMessage.mock.calls.length).toBeGreaterThan(calls));
        expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.connected);
    });

    it('treats a missing pairing object as idle pairing', async () => {
        getStatusReply = () => ({
            ok: true,
            state: 'connected',
            role: 'host',
            connectionId: pair.id,
            authorized: true
        });
        await loadOptions();
        await waitFor(() => expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.idle));
        expect((screen.getByTestId('send-echo') as HTMLButtonElement).disabled).toBe(false);
    });

    it('normalizes non-host/client roles and non-string transport errors', async () => {
        getStatusReply = () => ({
            ok: true,
            state: 'idle',
            role: 'observer',
            connectionId: 12,
            authorized: 'yes',
            error: 5,
            pairing: {
                phase: 1,
                code: 99,
                expiresAt: 'soon',
                pending: undefined,
                pair: undefined,
                error: undefined
            }
        });
        await loadOptions();
        await waitFor(() => expect(screen.getByTestId('transport-state').textContent).toBe(PHASE_COPY.idle));
        expect(screen.getByTestId('local-role').textContent).toBe('—');
        expect(screen.queryByTestId('pairing-error')).toBeNull();
        expect(screen.queryByTestId('pairing-countdown')).toBeNull();
        expect(screen.queryByTestId('pairing-code')).toBeNull();
    });

    it('does not show a countdown after the code has expired', async () => {
        currentStatus.pairing = {
            phase: 'waiting',
            code: 'AB3DE',
            expiresAt: Date.now() - 1_000,
            pending: null,
            pair: null,
            error: null
        };
        await loadOptions();
        await waitFor(() => expect(screen.getByTestId('pairing-code').textContent?.trim()).toBe('AB3DE'));
        expect(screen.queryByTestId('pairing-countdown')).toBeNull();
    });
});

describe('echo', () => {
    const connected = (): TransportStatus => ({
        ok: true,
        state: 'connected',
        role: 'host',
        connectionId: pair.id,
        authorized: true,
        error: null,
        pairing: { ...idlePairing(), phase: 'connected', pair }
    });

    it('sends a synthetic echo and shows success copy', async () => {
        currentStatus = connected();
        await loadOptions();
        await waitFor(() => expect((screen.getByTestId('send-echo') as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByTestId('send-echo'));
        await waitFor(() =>
            expect(sendMessage).toHaveBeenCalledWith({
                type: MSG.OPTIONS_SEND_SYNTHETIC,
                payload: { payloadKind: 'echo', text: 'hello from options', deadlineMs: 5000 }
            })
        );
        await waitFor(() => expect(screen.getByText('Test message returned successfully.')).not.toBeNull());
    });

    it('shows failure copy when the echo does not return', async () => {
        currentStatus = connected();
        echoReply = { ok: false, error: 'timeout' };
        await loadOptions();
        await waitFor(() => expect((screen.getByTestId('send-echo') as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByTestId('send-echo'));
        await waitFor(() =>
            expect(screen.getByTestId('pairing-error').textContent).toBe(
                'The test message did not return. Check the paired connection.'
            )
        );
    });

    it('shows failure copy when the echo cannot be sent', async () => {
        currentStatus = connected();
        echoThrows = true;
        await loadOptions();
        await waitFor(() => expect((screen.getByTestId('send-echo') as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByTestId('send-echo'));
        await waitFor(() =>
            expect(screen.getByTestId('pairing-error').textContent).toBe('The test message could not be sent.')
        );
    });
});

describe('compact popup', () => {
    it('opens options when no role is chosen', async () => {
        await loadPopup();
        await waitFor(() => expect(screen.queryByTestId('pairing-open-options')).not.toBeNull());
        expect(screen.queryByTestId('send-echo')).toBeNull();
        fireEvent.click(screen.getByTestId('pairing-open-options'));
        expect(openOptionsPage).toHaveBeenCalledOnce();
    });

    it('shows generate when a host role is already stored', async () => {
        stored.role = 'host';
        await loadPopup();
        await waitFor(() => expect(screen.queryByTestId('pairing-generate')).not.toBeNull());
        expect(screen.queryByTestId('pairing-open-options')).toBeNull();
    });
});
