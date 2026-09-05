import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MSG, type Lifecycle, type Role, type RequestState, type RequestOutcome } from '@/shared/constants';
import { kv } from '@/shared/lib/storage';
import { t } from '@/shared/lib/i18n';
import { logger } from '@/shared/lib/logger';

import '@/shared/styles.css';

interface TransportStatus {
    state: Lifecycle;
    role: Role | null;
    connectionId: string | null;
    error: string | null;
}

interface RequestView {
    requestId: string | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    since: number | null;
    error: string | null;
    reason: string | null;
}

const initialRequest: RequestView = {
    requestId: null,
    state: 'idle',
    outcome: null,
    since: null,
    error: null,
    reason: null
};

const Popup = () => {
    const [transport, setTransport] = useState<TransportStatus>({
        state: 'idle',
        role: null,
        connectionId: null,
        error: null
    });
    const [request, setRequest] = useState<RequestView>(initialRequest);

    useEffect(() => {
        const refreshTransport = (): void => {
            chrome.runtime
                .sendMessage({ type: MSG.OPTIONS_GET_STATUS })
                .then((res) => {
                    if (res && typeof res === 'object' && 'state' in (res as object)) {
                        setTransport(res as TransportStatus);
                    }
                })
                .catch((err: unknown) => logger.debug('[popup] status fetch:', err));
        };
        const refreshRequest = (): void => {
            chrome.runtime
                .sendMessage({ type: MSG.REQUEST_STATUS })
                .then((res) => {
                    if (res && typeof res === 'object' && 'requestId' in (res as object)) {
                        const r = res as {
                            requestId: string | null;
                            state: RequestState;
                            outcome: RequestOutcome | null;
                            since: number | null;
                            error: string | null;
                            reason: string | null;
                        };
                        setRequest({
                            requestId: r.requestId,
                            state: r.state,
                            outcome: r.outcome,
                            since: r.since,
                            error: r.error,
                            reason: r.reason
                        });
                    }
                })
                .catch((err: unknown) => logger.debug('[popup] request fetch:', err));
        };
        const refresh = (): void => {
            refreshTransport();
            refreshRequest();
        };
        refresh();
        const onEvent = (msg: unknown): void => {
            if (
                msg &&
                typeof msg === 'object' &&
                (msg as { type?: unknown }).type === MSG.OFFSCREEN_EVENT
            ) {
                refreshTransport();
            }
        };
        chrome.runtime.onMessage.addListener(onEvent);
        return () => chrome.runtime.onMessage.removeListener(onEvent);
    }, []);

    const startSyncAuth = async (): Promise<void> => {
        try {
            // Phase 4 leaves the application-specific request shape to Phase 6/7/8.
            // For now, the popup can ask the worker to begin a request against the
            // currently active tab; if no application key is wired yet, the worker
            // returns REQUEST_NOT_SUPPORTED.
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];
            if (!tab || tab.id === undefined) return;
            const origin = (tab.url ?? '').trim();
            const allowedReturnOrigins = origin ? [new URL(origin).origin] : [];
            const requestId = (crypto as { randomUUID?: () => string }).randomUUID?.() ?? '';
            await chrome.runtime.sendMessage({
                type: MSG.REQUEST_START,
                payload: {
                    applicationKey: 'unspecified',
                    intendedAccount: 'unspecified',
                    intendedOriginTab: tab.id,
                    allowedReturnOrigins
                }
            });
        } catch (err: unknown) {
            logger.debug('[popup] sync auth:', err);
        }
    };

    const cancelRequest = async (): Promise<void> => {
        try {
            await chrome.runtime.sendMessage({ type: MSG.REQUEST_CANCEL });
        } catch (err: unknown) {
            logger.debug('[popup] cancel:', err);
        }
    };

    const disconnect = async (): Promise<void> => {
        try {
            await chrome.runtime.sendMessage({ type: MSG.OPTIONS_DISCONNECT });
        } catch (err: unknown) {
            logger.debug('[popup] disconnect:', err);
        }
    };

    // Trigger initial local-only role load (machine-local per Phase 4 contract).
    useEffect(() => {
        kv.get('local', 'role', null as 'host' | 'client' | null)
            .then((r) => setTransport((s) => ({ ...s, role: r })))
            .catch((err: unknown) => logger.debug('[popup] role load:', err));
    }, []);

    return (
        <main className="min-w-[24rem] p-4">
            <section>
                <h1>{t('transportStatus', 'Transport status')}</h1>
                <ul>
                    <li>
                        <strong>{t('transportState', 'State')}: </strong>
                        <span data-testid="transport-state">{transport.state}</span>
                    </li>
                    <li>
                        <strong>{t('transportRole', 'Role')}: </strong>
                        {transport.role ?? '—'}
                    </li>
                    {transport.error && (
                        <li>
                            <strong>{t('transportError', 'Error')}: </strong>
                            {transport.error}
                        </li>
                    )}
                </ul>
                <button type="button" onClick={disconnect}>
                    {t('transportDisconnect', 'Disconnect')}
                </button>
            </section>

            <section>
                <h1>{t('requestTitle', 'Current request')}</h1>
                <ul>
                    <li>
                        <strong>{t('requestState', 'State')}: </strong>
                        <span data-testid="request-state">{request.state}</span>
                    </li>
                    {request.outcome && (
                        <li>
                            <strong>{t('requestOutcome', 'Outcome')}: </strong>
                            {request.outcome}
                            {request.reason ? ` (${request.reason})` : ''}
                        </li>
                    )}
                    {request.error && (
                        <li>
                            <strong>{t('transportError', 'Error')}: </strong>
                            {request.error}
                        </li>
                    )}
                </ul>
                <button type="button" onClick={startSyncAuth}>
                    {t('syncAuth', 'sync auth')}
                </button>
                <button type="button" onClick={cancelRequest} disabled={!request.requestId}>
                    {t('cancelRequest', 'Cancel')}
                </button>
            </section>
        </main>
    );
};

const root = document.getElementById('root');
if (root) render(<Popup />, root);