import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
    MSG,
    type Lifecycle,
    type RequestOutcome,
    type RequestState,
    type Role
} from '@/shared/constants';
import { t } from '@/shared/lib/i18n';
import { logger } from '@/shared/lib/logger';
import { kv } from '@/shared/lib/storage';

import '@/shared/styles.css';

interface TransportStatus {
    state: Lifecycle;
    role: Role | null;
    connectionId: string | null;
    localDescriptor: string | null;
    error: string | null;
}

interface RequestStatusView {
    requestId: string | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    since: number | null;
    error: string | null;
    reason: string | null;
}

const initialRequest: RequestStatusView = {
    requestId: null,
    state: 'idle',
    outcome: null,
    since: null,
    error: null,
    reason: null
};

const TransportPanel = () => {
    const [status, setStatus] = useState<TransportStatus>({
        state: 'idle',
        role: null,
        connectionId: null,
        localDescriptor: null,
        error: null
    });
    const [remoteDescriptor, setRemoteDescriptor] = useState('');
    const [busy, setBusy] = useState(false);
    const [lastResult, setLastResult] = useState<string>('');

    const refresh = (): void => {
        chrome.runtime
            .sendMessage({ type: MSG.OPTIONS_GET_STATUS })
            .then((res) => {
                if (res && typeof res === 'object' && 'state' in (res as object)) {
                    setStatus(res as TransportStatus);
                }
            })
            .catch((err: unknown) => logger.debug('[options] status fetch:', err));
    };

    useEffect(() => {
        refresh();
        const onEvent = (msg: unknown): void => {
            if (
                msg &&
                typeof msg === 'object' &&
                (msg as { type?: unknown }).type === MSG.OFFSCREEN_EVENT
            ) {
                refresh();
            }
        };
        chrome.runtime.onMessage.addListener(onEvent);
        return () => chrome.runtime.onMessage.removeListener(onEvent);
    }, []);

    const startHost = async (): Promise<void> => {
        setBusy(true);
        setLastResult('');
        try {
            const res = await chrome.runtime.sendMessage({ type: MSG.OPTIONS_START_HOST });
            const r = res as { ok?: boolean; descriptor?: string; error?: string };
            if (r.ok && r.descriptor) {
                setStatus((s) => ({ ...s, localDescriptor: r.descriptor as string }));
                setLastResult(`offer ready (${(r.descriptor as string).length} bytes)`);
            } else {
                setLastResult(`error: ${r.error ?? 'unknown'}`);
            }
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const startClient = async (): Promise<void> => {
        if (!remoteDescriptor) return;
        setBusy(true);
        setLastResult('');
        try {
            const res = await chrome.runtime.sendMessage({
                type: MSG.OPTIONS_START_CLIENT,
                payload: { remoteDescriptor }
            });
            const r = res as { ok?: boolean; descriptor?: string; error?: string };
            if (r.ok && r.descriptor) {
                setStatus((s) => ({ ...s, localDescriptor: r.descriptor as string }));
                setLastResult(`answer ready (${(r.descriptor as string).length} bytes)`);
            } else {
                setLastResult(`error: ${r.error ?? 'unknown'}`);
            }
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const applyAnswer = async (): Promise<void> => {
        if (!remoteDescriptor) return;
        setBusy(true);
        setLastResult('');
        try {
            const res = await chrome.runtime.sendMessage({
                type: MSG.OPTIONS_APPLY_ANSWER,
                payload: { remoteDescriptor }
            });
            const r = res as { ok?: boolean; error?: string };
            setLastResult(r.ok ? 'answer applied' : `error: ${r.error ?? 'unknown'}`);
            if (r.ok) setRemoteDescriptor('');
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const sendEcho = async (): Promise<void> => {
        setBusy(true);
        setLastResult('');
        try {
            const res = await chrome.runtime.sendMessage({
                type: MSG.OPTIONS_SEND_SYNTHETIC,
                payload: { payloadKind: 'echo', text: 'hello from options', deadlineMs: 5000 }
            });
            const r = res as { ok?: boolean; requestId?: string; error?: string };
            setLastResult(r.ok ? `sent ${r.requestId}` : `error: ${r.error ?? 'unknown'}`);
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const disconnect = async (): Promise<void> => {
        setBusy(true);
        setLastResult('');
        try {
            await chrome.runtime.sendMessage({ type: MSG.OPTIONS_DISCONNECT });
            setLastResult('disconnected');
        } finally {
            setBusy(false);
            refresh();
        }
    };

    return (
        <section>
            <h2>{t('transportTitle', 'Transport')}</h2>
            <ul>
                <li>
                    <strong>{t('transportState', 'State')}: </strong>
                    <span data-testid="transport-state">{status.state}</span>
                </li>
                <li>
                    <strong>{t('transportRole', 'Role')}: </strong>
                    {status.role ?? '—'}
                </li>
                <li>
                    <strong>{t('connectionId', 'Connection ID')}: </strong>
                    {status.connectionId ?? '—'}
                </li>
                {status.error && (
                    <li>
                        <strong>{t('transportError', 'Error')}: </strong>
                        {status.error}
                    </li>
                )}
            </ul>

            {status.localDescriptor && (
                <div>
                    <h3>{t('transportLocalDescriptor', 'Local descriptor')}</h3>
                    <textarea readOnly value={status.localDescriptor} rows={6} data-testid="local-descriptor" />
                </div>
            )}

            <h3>{t('manualSignaling', 'Manual signaling')}</h3>
            <textarea
                value={remoteDescriptor}
                onInput={(e: Event) =>
                    setRemoteDescriptor((e.currentTarget as HTMLTextAreaElement).value)
                }
                placeholder={t('transportRemoteDescriptor', 'Remote descriptor (paste from peer)')}
                rows={6}
                data-testid="remote-descriptor"
            />

            <div>
                <button type="button" disabled={busy} onClick={startHost} data-testid="start-host">
                    {t('transportStartHost', 'Start host')}
                </button>
                <button type="button" disabled={busy || !remoteDescriptor} onClick={startClient} data-testid="start-client">
                    {t('transportStartClient', 'Start client')}
                </button>
                <button type="button" disabled={busy || !remoteDescriptor} onClick={applyAnswer} data-testid="apply-answer">
                    {t('transportApplyAnswer', 'Apply answer')}
                </button>
                <button
                    type="button"
                    disabled={busy || status.state !== 'connected'}
                    onClick={sendEcho}
                    data-testid="send-echo"
                >
                    {t('transportSendEcho', 'Send echo')}
                </button>
                <button type="button" disabled={busy} onClick={disconnect} data-testid="disconnect">
                    {t('transportDisconnect', 'Disconnect')}
                </button>
            </div>

            {lastResult && <p data-testid="last-result">{lastResult}</p>}
        </section>
    );
};

const RequestPanel = () => {
    const [status, setStatus] = useState<RequestStatusView>(initialRequest);
    const [busy, setBusy] = useState(false);

    const refresh = (): void => {
        chrome.runtime
            .sendMessage({ type: MSG.REQUEST_STATUS })
            .then((res) => {
                if (res && typeof res === 'object' && 'state' in (res as object)) {
                    setStatus(res as RequestStatusView);
                }
            })
            .catch((err: unknown) => logger.debug('[options] request status:', err));
    };

    useEffect(() => {
        refresh();
    }, []);

    const start = async (): Promise<void> => {
        setBusy(true);
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];
            if (!tab || tab.id === undefined) return;
            const origin = (tab.url ?? '').trim();
            const allowedReturnOrigins = origin ? [new URL(origin).origin] : [];
            await chrome.runtime.sendMessage({
                type: MSG.REQUEST_START,
                payload: {
                    applicationKey: 'unspecified',
                    intendedAccount: 'unspecified',
                    intendedOriginTab: tab.id,
                    allowedReturnOrigins
                }
            });
        } finally {
            setBusy(false);
            refresh();
        }
    };

    const cancel = async (): Promise<void> => {
        setBusy(true);
        try {
            await chrome.runtime.sendMessage({ type: MSG.REQUEST_CANCEL });
        } finally {
            setBusy(false);
            refresh();
        }
    };

    return (
        <section>
            <h2>{t('requestTitle', 'Current request')}</h2>
            <ul>
                <li>
                    <strong>{t('requestState', 'State')}: </strong>
                    <span data-testid="request-state">{status.state}</span>
                </li>
                {status.outcome && (
                    <li>
                        <strong>{t('requestOutcome', 'Outcome')}: </strong>
                        {status.outcome}
                        {status.reason ? ` (${status.reason})` : ''}
                    </li>
                )}
                {status.error && (
                    <li>
                        <strong>{t('transportError', 'Error')}: </strong>
                        {status.error}
                    </li>
                )}
            </ul>
            <div>
                <button type="button" disabled={busy} onClick={start} data-testid="start-request">
                    {t('syncAuth', 'sync auth')}
                </button>
                <button type="button" disabled={busy || !status.requestId} onClick={cancel} data-testid="cancel-request">
                    {t('cancelRequest', 'Cancel')}
                </button>
            </div>
            <p>
                <em>
                    {t(
                        'requestNoController',
                        'Application controllers are not yet implemented. Phase 4 leaves applicationKey="unspecified" in REQUEST_NOT_SUPPORTED until Phase 6/7/8 ships a supported contract.'
                    )}
                </em>
            </p>
        </section>
    );
};

const RoleConfigCard = () => {
    const [role, setRole] = useState<'host' | 'client' | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        kv.get('local', 'role', null as 'host' | 'client' | null)
            .then(setRole)
            .catch((err: unknown) => logger.error('[options] role load:', err));
    }, []);

    const save = async (next: 'host' | 'client'): Promise<void> => {
        setBusy(true);
        try {
            try {
                await kv.set('local', 'role', next);
                setRole(next);
            } catch (err: unknown) {
                logger.error('[options] role save failed (visible):', err);
                throw err;
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <section>
            <h2>{t('roleTitle', 'Local role (machine-local)')}</h2>
            <p>
                {t(
                    'roleDescription',
                    'This setting is stored in chrome.storage.local. It never syncs across machines and is reset if you uninstall the extension.'
                )}
            </p>
            <div>
                <button type="button" disabled={busy || role === 'host'} onClick={() => void save('host')}>
                    {t('roleHost', 'Host')}
                </button>
                <button type="button" disabled={busy || role === 'client'} onClick={() => void save('client')}>
                    {t('roleClient', 'Client')}
                </button>
            </div>
            <p data-testid="local-role">{role ?? '—'}</p>
        </section>
    );
};

const Options = () => (
    <main className="min-w-[48rem] p-6">
        <TransportPanel />
        <RequestPanel />
        <RoleConfigCard />
    </main>
);

const root = document.getElementById('root');
if (root) render(<Options />, root);