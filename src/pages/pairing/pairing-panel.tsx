import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '@/components/tailgrids/core/button';
import { type Lifecycle, MSG, type Role } from '@/shared/constants';
import { t } from '@/shared/lib/i18n';
import { logger } from '@/shared/lib/logger';
import {
    isPairingCode,
    normalizePairingCode,
    type PairingCommand,
    type PairingFailure,
    type PairingPhase,
    type PairingSnapshot
} from '@/shared/lib/pairing-protocol';
import { kv } from '@/shared/lib/storage';

const IDLE_PAIRING: PairingSnapshot = {
    phase: 'idle',
    code: null,
    expiresAt: null,
    pending: null,
    pair: null,
    error: null
};

export interface TransportView {
    state: Lifecycle;
    role: Role | null;
    connectionId: string | null;
    authorized: boolean;
    pairing: PairingSnapshot;
    error: string | null;
}

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

const failureMessage = (error: unknown): string =>
    typeof error === 'string' && Object.hasOwn(FAILURE_COPY, error)
        ? FAILURE_COPY[error as PairingFailure]
        : FAILURE_COPY.unavailable;

export const pairingLocksRole = (pairing: PairingSnapshot): boolean =>
    pairing.pair !== null ||
    pairing.phase === 'creating' ||
    pairing.phase === 'waiting' ||
    pairing.phase === 'confirming' ||
    pairing.phase === 'connecting' ||
    pairing.phase === 'connected';

const asTransport = (value: unknown): TransportView | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const o = value as Record<string, unknown>;
    if (typeof o.state !== 'string') return null;
    const pairing =
        o.pairing && typeof o.pairing === 'object' && !Array.isArray(o.pairing)
            ? (o.pairing as PairingSnapshot)
            : IDLE_PAIRING;
    return {
        state: o.state as Lifecycle,
        role: o.role === 'host' || o.role === 'client' ? o.role : null,
        connectionId: typeof o.connectionId === 'string' ? o.connectionId : null,
        authorized: o.authorized === true,
        pairing: {
            phase: typeof pairing.phase === 'string' ? pairing.phase : 'idle',
            code: typeof pairing.code === 'string' ? pairing.code : null,
            expiresAt: typeof pairing.expiresAt === 'number' ? pairing.expiresAt : null,
            pending: pairing.pending ?? null,
            pair: pairing.pair ?? null,
            error: pairing.error ?? null
        },
        error: typeof o.error === 'string' ? o.error : null
    };
};

const remainingLabel = (expiresAt: number | null, now: number): string | null => {
    if (expiresAt === null) return null;
    const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
};

export const useTransportStatus = (): {
    status: TransportView;
    localRole: Role | null;
    busy: boolean;
    actionError: string | null;
    echoResult: string | null;
    refresh: () => void;
    sendCommand: (command: PairingCommand) => Promise<void>;
    disconnect: () => Promise<void>;
    sendEcho: () => Promise<void>;
    setLocalRole: (role: Role) => Promise<void>;
} => {
    const [status, setStatus] = useState<TransportView>({
        state: 'idle',
        role: null,
        connectionId: null,
        authorized: false,
        pairing: IDLE_PAIRING,
        error: null
    });
    const [localRole, setLocalRoleState] = useState<Role | null>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [echoResult, setEchoResult] = useState<string | null>(null);
    const refreshVersion = useRef(0);

    const refresh = (): void => {
        const version = ++refreshVersion.current;
        chrome.runtime
            .sendMessage({ type: MSG.OPTIONS_GET_STATUS })
            .then((res) => {
                if (version !== refreshVersion.current) return;
                const next = asTransport(res);
                if (!next) return;
                setStatus(next);
                const pinned = next.pairing.pair?.role;
                if (pinned === 'host' || pinned === 'client') {
                    setLocalRoleState(pinned);
                }
            })
            .catch((err: unknown) => logger.debug('[pairing] status fetch:', err));
    };

    useEffect(() => {
        let active = true;
        let roleChanged = false;
        const unwatch = kv.watch('local', 'role', (role) => {
            if (!active) return;
            roleChanged = true;
            setLocalRoleState(role === 'host' || role === 'client' ? role : null);
        });
        kv.get('local', 'role', null as Role | null)
            .then((role) => {
                if (active && !roleChanged && (role === 'host' || role === 'client')) setLocalRoleState(role);
            })
            .catch((err: unknown) => logger.debug('[pairing] role load:', err));
        refresh();
        const onEvent = (msg: unknown): void => {
            if (msg && typeof msg === 'object' && 'type' in msg && msg.type === MSG.OFFSCREEN_EVENT) {
                refresh();
            }
        };
        chrome.runtime.onMessage.addListener(onEvent);
        return () => {
            active = false;
            refreshVersion.current++;
            unwatch();
            chrome.runtime.onMessage.removeListener(onEvent);
        };
    }, []);

    const sendCommand = async (command: PairingCommand): Promise<void> => {
        setBusy(true);
        setActionError(null);
        setEchoResult(null);
        try {
            const result = await chrome.runtime.sendMessage({ type: MSG.PAIRING, payload: command });
            if (result?.ok !== true) setActionError(failureMessage(result?.error));
        } catch {
            setActionError(FAILURE_COPY.unavailable);
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const disconnect = async (): Promise<void> => {
        setBusy(true);
        setActionError(null);
        setEchoResult(null);
        try {
            const result = await chrome.runtime.sendMessage({ type: MSG.OPTIONS_DISCONNECT });
            if (result?.ok !== true) setActionError(FAILURE_COPY.unavailable);
        } catch {
            setActionError(FAILURE_COPY.unavailable);
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const sendEcho = async (): Promise<void> => {
        setBusy(true);
        setActionError(null);
        setEchoResult(null);
        try {
            const result = await chrome.runtime.sendMessage({
                type: MSG.OPTIONS_SEND_SYNTHETIC,
                payload: { payloadKind: 'echo', text: 'hello from options', deadlineMs: 5000 }
            });
            if (result?.ok === true) setEchoResult('Test message returned successfully.');
            else setActionError('The test message did not return. Check the paired connection.');
        } catch {
            setActionError('The test message could not be sent.');
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const setLocalRole = async (role: Role): Promise<void> => {
        if (pairingLocksRole(status.pairing)) return;
        setBusy(true);
        setActionError(null);
        try {
            await kv.set('local', 'role', role);
            setLocalRoleState(role);
        } catch {
            setActionError('The profile role could not be saved.');
        } finally {
            setBusy(false);
        }
    };

    return {
        status,
        localRole,
        busy,
        actionError,
        echoResult,
        refresh,
        sendCommand,
        disconnect,
        sendEcho,
        setLocalRole
    };
};

export const PairingPanel = ({
    compact = false,
    transport
}: {
    compact?: boolean;
    transport: ReturnType<typeof useTransportStatus>;
}) => {
    const { status, localRole, busy, actionError, echoResult, sendCommand, disconnect, sendEcho } = transport;
    const [codeInput, setCodeInput] = useState('');
    const [now, setNow] = useState(Date.now());
    const pairing = status.pairing;
    const role = pairing.pair?.role ?? localRole ?? status.role;
    const pending = pairing.pending;
    const countdown = remainingLabel(pairing.expiresAt, now);
    const setupNeeded = !compact ? false : role === null && pairing.pair === null && pairing.phase === 'idle';

    useEffect(() => {
        if (pairing.expiresAt === null) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [pairing.expiresAt]);

    const errorText = actionError ?? (pairing.error ? FAILURE_COPY[pairing.error] : status.error);
    const counterpart = pending?.peer.label ?? pairing.pair?.peer.label ?? null;

    return (
        <section
            className={
                compact
                    ? 'space-y-4 rounded-2xl border border-gray-200 bg-white p-4'
                    : 'min-w-0 space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7'
            }
            aria-labelledby="pairing-title">
            <div>
                {!compact && (
                    <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                        02 / Pair browsers
                    </p>
                )}
                <h2 id="pairing-title" className={compact ? 'text-base font-semibold' : 'text-xl font-semibold'}>
                    {t('pairingTitle')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{t('pairingDescription')}</p>
            </div>

            <ul
                className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"
                aria-live="polite"
                data-testid="pairing-status">
                <li>
                    <strong>{t('transportState')}: </strong>
                    <span
                        className={`ml-2 inline-flex rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${
                            status.authorized && status.state === 'connected'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-200 text-gray-700'
                        }`}
                        data-testid="transport-state"
                        role="status">
                        {PHASE_COPY[pairing.phase] ?? status.state}
                    </span>
                </li>
                <li>
                    <strong>{t('transportRole')}: </strong>
                    <span className="ml-2 font-mono">{role ?? '—'}</span>
                </li>
                {counterpart && (
                    <li data-testid="pairing-peer">
                        <strong>{pairing.pair ? t('pairingPaired') : t('pairingPending')}: </strong>
                        <span className="ml-2">{counterpart}</span>
                    </li>
                )}
                {countdown && pairing.expiresAt !== null && pairing.expiresAt > now && (
                    <li>
                        <strong>{t('pairingExpires')}: </strong>
                        <span className="ml-2 font-mono" data-testid="pairing-countdown">
                            {countdown}
                        </span>
                    </li>
                )}
            </ul>

            {errorText && (
                <p
                    className="break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    data-testid="pairing-error"
                    role="alert">
                    {errorText}
                </p>
            )}

            {setupNeeded && (
                <div className="flex flex-wrap gap-3">
                    <Button
                        size="sm"
                        appearance="outline"
                        onClick={() => void chrome.runtime.openOptionsPage()}
                        data-testid="pairing-open-options">
                        {t('pairingOpenOptions')}
                    </Button>
                </div>
            )}

            {pairing.code && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold">{t('pairingCodeLabel')}</p>
                    <p
                        className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 text-center font-mono text-3xl font-semibold tracking-[0.35em] text-gray-900 sm:text-4xl"
                        data-testid="pairing-code">
                        {pairing.code}
                    </p>
                </div>
            )}

            {role === 'host' && pairing.pair === null && !pairingLocksRole(pairing) && (
                <div className="flex flex-wrap gap-3">
                    <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void sendCommand({ action: 'create', label: 'Host browser' })}
                        data-testid="pairing-generate">
                        {t('pairingGenerate')}
                    </Button>
                </div>
            )}

            {role === 'client' && pairing.pair === null && !pairingLocksRole(pairing) && (
                <div className="space-y-3">
                    <label htmlFor="pairing-code-input" className="block text-sm font-semibold">
                        {t('pairingCodeLabel')}
                    </label>
                    <p className="text-sm text-gray-600">{t('pairingCodeHelp')}</p>
                    <input
                        id="pairing-code-input"
                        className="block w-full rounded-lg border-gray-300 bg-white p-3 font-mono text-lg tracking-[0.35em] uppercase placeholder:text-gray-400 focus:border-primary-500 focus:ring-primary-500"
                        value={codeInput}
                        maxLength={5}
                        autoComplete="off"
                        spellcheck={false}
                        onInput={(e: Event) => {
                            const input = e.currentTarget as HTMLInputElement;
                            setCodeInput(normalizePairingCode(input.value).slice(0, 5));
                        }}
                        data-testid="pairing-code-input"
                    />
                    <Button
                        size="sm"
                        disabled={busy || !isPairingCode(codeInput)}
                        onClick={() => void sendCommand({ action: 'join', code: codeInput, label: 'Client browser' })}
                        data-testid="pairing-join">
                        {t('pairingJoin')}
                    </Button>
                </div>
            )}

            {role === null && pairing.pair === null && !compact && (
                <p className="text-sm text-gray-600">{t('pairingChooseRole')}</p>
            )}

            {pending && typeof pending.attemptId === 'string' && (
                <div className="flex flex-wrap gap-3">
                    {!pending.confirmed && (
                        <Button
                            key={pending.attemptId}
                            size="sm"
                            disabled={busy}
                            data-attempt-id={pending.attemptId}
                            data-testid="pairing-confirm"
                            onClick={() => void sendCommand({ action: 'confirm', attemptId: pending.attemptId })}>
                            {t('pairingConfirm')}
                        </Button>
                    )}
                    <Button
                        size="sm"
                        appearance="outline"
                        variant="danger"
                        onClick={() => void sendCommand({ action: 'cancel' })}
                        data-testid="pairing-reject">
                        {t('pairingReject')}
                    </Button>
                </div>
            )}

            {(pairing.phase === 'creating' || pairing.phase === 'waiting') && (
                <div className="flex flex-wrap gap-3">
                    <Button
                        size="sm"
                        appearance="outline"
                        variant="danger"
                        onClick={() => void sendCommand({ action: 'cancel' })}
                        data-testid="pairing-cancel">
                        {t('pairingCancel')}
                    </Button>
                </div>
            )}

            {pairing.pair && (
                <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5">
                    {status.state !== 'connected' && pairing.phase !== 'connecting' && pairing.phase !== 'waiting' && (
                        <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void sendCommand({ action: 'connect' })}
                            data-testid="pairing-connect">
                            {t('pairingConnect')}
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="danger"
                        appearance="outline"
                        onClick={() => void disconnect()}
                        data-testid="pairing-disconnect">
                        {t('pairingDisconnect')}
                    </Button>
                    <Button
                        size="sm"
                        variant="danger"
                        appearance="outline"
                        onClick={() => void sendCommand({ action: 'forget' })}
                        data-testid="pairing-forget">
                        {t('pairingForget')}
                    </Button>
                </div>
            )}

            {!compact && (
                <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5">
                    <Button
                        size="sm"
                        appearance="outline"
                        disabled={busy || status.state !== 'connected' || !status.authorized}
                        onClick={() => void sendEcho()}
                        data-testid="send-echo">
                        {t('transportSendEcho')}
                    </Button>
                    {echoResult && (
                        <p className="text-sm text-emerald-800" role="status">
                            {echoResult}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
};
