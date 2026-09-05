import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '@/components/tailgrids/core/button';
import { type Lifecycle, MSG, type RequestOutcome, type RequestState, type Role } from '@/shared/constants';
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
            if (msg && typeof msg === 'object' && (msg as { type?: unknown }).type === MSG.OFFSCREEN_EVENT) {
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
        <section
            className="min-w-0 space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
            aria-labelledby="transport-title">
            <div>
                <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                    02 / Connect profiles
                </p>
                <h2 id="transport-title" className="text-xl font-semibold">
                    {t('transportTitle', 'Transport')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                    Create an offer on the host, accept it on the client, then apply the client’s answer on the host.
                </p>
            </div>
            <ul className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                <li>
                    <strong>{t('transportState', 'State')}: </strong>
                    <span
                        className={`ml-2 inline-flex rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${status.state === 'connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}
                        data-testid="transport-state"
                        role="status">
                        {status.state}
                    </span>
                </li>
                <li>
                    <strong>{t('transportRole', 'Role')}: </strong>
                    <span className="ml-2 font-mono">{status.role ?? '—'}</span>
                </li>
                <li className="break-all">
                    <strong>{t('connectionId', 'Connection ID')}: </strong>
                    <span className="font-mono text-xs text-gray-600">{status.connectionId ?? '—'}</span>
                </li>
                {status.error && (
                    <li className="break-words text-red-700" role="alert">
                        <strong>{t('transportError', 'Error')}: </strong>
                        {status.error}
                    </li>
                )}
            </ul>

            {status.localDescriptor && (
                <div className="space-y-2">
                    <label htmlFor="local-descriptor" className="block text-sm font-semibold">
                        {t('transportLocalDescriptor', 'Local descriptor')}
                    </label>
                    <p className="text-sm text-gray-600">Read only. Copy this entire value to the other profile.</p>
                    <textarea
                        id="local-descriptor"
                        className="block w-full resize-y rounded-lg border-gray-300 bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700 focus:border-primary-500 focus:ring-primary-500"
                        readOnly
                        value={status.localDescriptor}
                        rows={6}
                        data-testid="local-descriptor"
                    />
                </div>
            )}

            <div className="space-y-2">
                <label htmlFor="remote-descriptor" className="block text-sm font-semibold">
                    {t('transportRemoteDescriptor', 'Remote descriptor (paste from peer)')}
                </label>
                <textarea
                    id="remote-descriptor"
                    className="block w-full resize-y rounded-lg border-gray-300 bg-white p-3 font-mono text-xs leading-5 placeholder:text-gray-500 focus:border-primary-500 focus:ring-primary-500"
                    value={remoteDescriptor}
                    onInput={(e: Event) => setRemoteDescriptor((e.currentTarget as HTMLTextAreaElement).value)}
                    placeholder={t('transportRemoteDescriptor', 'Remote descriptor (paste from peer)')}
                    rows={6}
                    data-testid="remote-descriptor"
                />
            </div>

            <div className="flex flex-wrap gap-3">
                <Button size="sm" disabled={busy} onClick={startHost} data-testid="start-host">
                    {t('transportStartHost', 'Start host')}
                </Button>
                <Button
                    size="sm"
                    appearance="outline"
                    disabled={busy || !remoteDescriptor}
                    onClick={startClient}
                    data-testid="start-client">
                    {t('transportStartClient', 'Start client')}
                </Button>
                <Button
                    size="sm"
                    appearance="outline"
                    disabled={busy || !remoteDescriptor}
                    onClick={applyAnswer}
                    data-testid="apply-answer">
                    {t('transportApplyAnswer', 'Apply answer')}
                </Button>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-5">
                <Button
                    size="sm"
                    appearance="outline"
                    disabled={busy || status.state !== 'connected'}
                    onClick={sendEcho}
                    data-testid="send-echo">
                    {t('transportSendEcho', 'Send echo')}
                </Button>
                <Button
                    size="sm"
                    variant="danger"
                    appearance="outline"
                    disabled={busy}
                    onClick={disconnect}
                    data-testid="disconnect">
                    {t('transportDisconnect', 'Disconnect')}
                </Button>
            </div>

            {lastResult && (
                <p
                    className="break-all rounded-lg bg-gray-100 px-4 py-3 font-mono text-xs text-gray-700"
                    data-testid="last-result"
                    role="status">
                    {lastResult}
                </p>
            )}
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
        <section
            className="min-w-0 space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
            aria-labelledby="request-title">
            <div>
                <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-gray-500">
                    03 / Request diagnostics
                </p>
                <h2 id="request-title" className="text-xl font-semibold">
                    {t('requestTitle', 'Current request')}
                </h2>
            </div>
            <ul className="space-y-3 break-words rounded-xl bg-gray-50 p-4 text-sm" aria-live="polite">
                <li>
                    <strong>{t('requestState', 'State')}: </strong>
                    <span className="ml-2 font-mono" data-testid="request-state">
                        {status.state}
                    </span>
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
            <div className="flex flex-wrap gap-3">
                <Button size="sm" appearance="outline" disabled={busy} onClick={start} data-testid="start-request">
                    {t('syncAuth', 'sync auth')}
                </Button>
                <Button
                    size="sm"
                    appearance="outline"
                    disabled={busy || !status.requestId}
                    onClick={cancel}
                    data-testid="cancel-request">
                    {t('cancelRequest', 'Cancel')}
                </Button>
            </div>
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
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
        <section
            className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
            aria-labelledby="role-title">
            <div>
                <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                    01 / Choose this profile’s role
                </p>
                <h2 id="role-title" className="text-xl font-semibold">
                    {t('roleTitle', 'Local role (machine-local)')}
                </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-gray-600">
                {t(
                    'roleDescription',
                    'This setting is stored in chrome.storage.local. It never syncs across machines and is reset if you uninstall the extension.'
                )}
            </p>
            <fieldset className="flex flex-wrap gap-3" aria-labelledby="role-title">
                <Button
                    size="sm"
                    appearance={role === 'host' ? 'fill' : 'outline'}
                    aria-pressed={role === 'host'}
                    disabled={busy}
                    onClick={() => void save('host')}>
                    {t('roleHost', 'Host')}
                </Button>
                <Button
                    size="sm"
                    appearance={role === 'client' ? 'fill' : 'outline'}
                    aria-pressed={role === 'client'}
                    disabled={busy}
                    onClick={() => void save('client')}>
                    {t('roleClient', 'Client')}
                </Button>
            </fieldset>
            <p className="text-sm text-gray-600" role="status">
                Saved role:{' '}
                <span className="font-mono font-semibold text-gray-900" data-testid="local-role">
                    {role ?? '—'}
                </span>
            </p>
        </section>
    );
};

const Options = () => (
    <main className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8">
        <header className="mb-8 border-b border-gray-200 pb-6">
            <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                Profile connection / Development preview
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('extName', 'Beam me up')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
                Connect two Chrome profiles using a manual offer and answer. Start with your local role, then exchange
                connection descriptors below.
            </p>
        </header>
        <RoleConfigCard />
        <TransportPanel />
        <RequestPanel />
    </main>
);

const root = document.getElementById('root');
if (root) render(<Options />, root);
