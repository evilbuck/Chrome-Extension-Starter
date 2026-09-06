import { useEffect, useState } from 'preact/hooks';
import { Button } from '@/components/tailgrids/core/button';
import { ERROR_KIND, MSG, type RequestOutcome, type RequestState, type Role } from '@/shared/constants';
import { t } from '@/shared/lib/i18n';
import { logger } from '@/shared/lib/logger';
import {
    isSlackSource,
    SLACK_FAILURES,
    SLACK_ORIGIN,
    SLACK_PERMISSIONS,
    type SlackFailure,
    type SlackSource
} from '@/shared/lib/slack';
import { kv } from '@/shared/lib/storage';

const POLL_MS = 750;

const ACTIVE_STATES: Record<string, true> = {
    checking_host: true,
    preparing_host: true,
    completing_client: true,
    verifying: true,
    waiting_for_user: true
};

const REQUEST_STATES: Record<string, true> = {
    idle: true,
    checking_host: true,
    preparing_host: true,
    completing_client: true,
    verifying: true,
    succeeded: true,
    waiting_for_user: true
};

const REQUEST_OUTCOMES: Record<string, true> = {
    unsupported: true,
    host_unavailable: true,
    account_mismatch: true,
    disconnected: true,
    cancelled: true,
    expired: true,
    failed: true
};

const FAILURE_COPY: Record<SlackFailure, string> = {
    permission_denied: 'Slack access was not granted.',
    sharing_not_approved: 'Shared-session consent is required on this browser.',
    no_source:
        'No signed-in Slack workspace is ready. On the host, open Slack, sign in normally, then refresh sources.',
    unsupported_scope:
        'This Slack account shape is not supported. Only Enterprise Grid with one member workspace is supported.',
    auth_required:
        'Slack requested sign-in or device verification. The transfer stopped without completing authentication.',
    client_not_empty:
        'This browser already has a Slack session. Use a profile that is not signed into Slack. Existing sessions are not overwritten.',
    scope_changed: 'The Slack session changed during transfer. Start again.',
    invalid_payload: 'The request was rejected.',
    cancelled: 'The transfer was cancelled.',
    expired: 'The transfer expired. Start again.',
    disconnected: 'The peer connection is not ready.',
    busy: 'A transfer is already in progress.',
    cleanup_required:
        'Local Slack cleanup could not finish. Re-enable Slack access and refresh sources to retry cleanup, or clear Slack site data in this client profile.',
    failed: 'The transfer failed.'
};

const STATE_COPY: Record<RequestState, string> = {
    idle: 'Idle',
    checking_host: 'Checking host…',
    preparing_host: 'Preparing host session…',
    completing_client: 'Applying session on this browser…',
    verifying: 'Verifying signed-in identity…',
    succeeded: 'Signed in',
    waiting_for_user: 'Waiting for you to continue…'
};

const OUTCOME_FAILURE: Record<RequestOutcome, SlackFailure> = {
    unsupported: 'failed',
    host_unavailable: 'disconnected',
    account_mismatch: 'scope_changed',
    disconnected: 'disconnected',
    cancelled: 'cancelled',
    expired: 'expired',
    failed: 'failed'
};

const ERROR_KIND_FAILURE: Record<string, SlackFailure> = {
    [ERROR_KIND.TIMEOUT]: 'expired',
    [ERROR_KIND.DEADLINE_EXCEEDED]: 'expired',
    [ERROR_KIND.REQUEST_EXPIRED]: 'expired',
    [ERROR_KIND.CHANNEL_CLOSED]: 'disconnected',
    [ERROR_KIND.DUPLICATE_REQUEST]: 'busy',
    [ERROR_KIND.INVALID_SENDER_CONTEXT]: 'invalid_payload',
    [ERROR_KIND.MALFORMED]: 'invalid_payload',
    [ERROR_KIND.OVERSIZED]: 'invalid_payload',
    [ERROR_KIND.REQUEST_NOT_SUPPORTED]: 'failed',
    [ERROR_KIND.NO_ACTIVE_REQUEST]: 'failed',
    [ERROR_KIND.UNKNOWN]: 'failed'
};

interface RequestView {
    requestId: string | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    since: number | null;
    destinationTabId: number | null;
}

const initialRequest: RequestView = {
    requestId: null,
    state: 'idle',
    outcome: null,
    since: null,
    destinationTabId: null
};

const asFailure = (value: unknown): value is SlackFailure =>
    typeof value === 'string' && (SLACK_FAILURES as readonly string[]).includes(value);

const failureFromCode = (value: unknown): SlackFailure | null => {
    if (asFailure(value)) return value;
    if (typeof value === 'string' && value in ERROR_KIND_FAILURE) return ERROR_KIND_FAILURE[value];
    return null;
};

const sourceKey = (source: SlackSource): string =>
    `${source.sourceTabId}:${source.scopeId}:${source.workspaceId}:${source.userId}`;

const parseRequest = (value: unknown): RequestView | null => {
    if (typeof value !== 'object' || value === null) return null;
    const state = 'state' in value ? value.state : undefined;
    if (typeof state !== 'string' || !REQUEST_STATES[state]) return null;
    const outcomeRaw = 'outcome' in value ? value.outcome : undefined;
    const requestIdRaw = 'requestId' in value ? value.requestId : undefined;
    const sinceRaw = 'since' in value ? value.since : undefined;
    const destinationRaw = 'destinationTabId' in value ? value.destinationTabId : undefined;
    return {
        requestId: typeof requestIdRaw === 'string' && requestIdRaw.length > 0 ? requestIdRaw : null,
        state: state as RequestState,
        outcome: typeof outcomeRaw === 'string' && REQUEST_OUTCOMES[outcomeRaw] ? (outcomeRaw as RequestOutcome) : null,
        since: typeof sinceRaw === 'number' && Number.isSafeInteger(sinceRaw) ? sinceRaw : null,
        destinationTabId:
            typeof destinationRaw === 'number' && Number.isSafeInteger(destinationRaw) && destinationRaw >= 0
                ? destinationRaw
                : null
    };
};

const parseOk = (
    value: unknown
): { ok: true; sources?: unknown; requestId?: unknown } | { ok: false; error: SlackFailure } => {
    if (typeof value !== 'object' || value === null || !('ok' in value)) return { ok: false, error: 'failed' };
    if (value.ok === true) {
        return {
            ok: true,
            sources: 'sources' in value ? value.sources : undefined,
            requestId: 'requestId' in value ? value.requestId : undefined
        };
    }
    if (value.ok === false) {
        return { ok: false, error: failureFromCode('error' in value ? value.error : undefined) ?? 'failed' };
    }
    return { ok: false, error: 'failed' };
};

const send = async (type: string, payload?: unknown): Promise<unknown> =>
    chrome.runtime.sendMessage(payload === undefined ? { type } : { type, payload });

export const SlackRequestPanel = ({ compact = false }: { compact?: boolean }) => {
    const [role, setRole] = useState<Role | null>(null);
    const [connected, setConnected] = useState(false);
    const [consent, setConsent] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [sources, setSources] = useState<SlackSource[]>([]);
    const [selected, setSelected] = useState<SlackSource | null>(null);
    const [request, setRequest] = useState<RequestView>(initialRequest);
    const [failure, setFailure] = useState<SlackFailure | null>(null);
    const [busy, setBusy] = useState(false);

    const refreshRequest = (): void => {
        chrome.runtime
            .sendMessage({ type: MSG.REQUEST_STATUS })
            .then((res) => {
                const parsed = parseRequest(res);
                if (!parsed) return;
                setRequest(parsed);
                const mapped =
                    typeof res === 'object' && res !== null
                        ? (failureFromCode('reason' in res ? res.reason : undefined) ??
                          failureFromCode('error' in res ? res.error : undefined))
                        : null;
                if (parsed.state === 'succeeded') {
                    setFailure(null);
                    return;
                }
                if (parsed.state in ACTIVE_STATES) return;
                if (parsed.outcome) setFailure(mapped ?? OUTCOME_FAILURE[parsed.outcome]);
                else if (mapped) setFailure(mapped);
            })
            .catch(() => logger.debug('[slack-ui] request status failed'));
    };

    const refreshTransport = (): void => {
        chrome.runtime
            .sendMessage({ type: MSG.OPTIONS_GET_STATUS })
            .then((res) => {
                setConnected(res?.ok === true && res.state === 'connected' && res.authorized === true);
                if (typeof res !== 'object' || res === null) return;
                if ('role' in res && (res.role === 'host' || res.role === 'client')) setRole(res.role);
            })
            .catch(() => {
                setConnected(false);
                logger.debug('[slack-ui] transport status failed');
            });
    };

    const applySources = (next: SlackSource[]): void => {
        setSources(next);
        setSelected((current) => {
            if (!current) return null;
            const key = sourceKey(current);
            return next.find((source) => sourceKey(source) === key) ?? null;
        });
    };

    const listSources = async (): Promise<SlackFailure | null> => {
        const res = parseOk(await send(MSG.SLACK_LIST));
        if (!res.ok) return res.error;
        applySources(Array.isArray(res.sources) ? res.sources.filter(isSlackSource) : []);
        return null;
    };

    useEffect(() => {
        let alive = true;
        const hydrate = async (): Promise<void> => {
            try {
                const storedRole = await kv.get('local', 'role', null as Role | null);
                if (!alive) return;
                if (storedRole === 'host' || storedRole === 'client') setRole(storedRole);
            } catch {
                logger.debug('[slack-ui] role load failed');
            }
            refreshTransport();
            refreshRequest();
            try {
                const granted = await chrome.permissions.contains(SLACK_PERMISSIONS);
                if (!alive || !granted) return;
                const error = await listSources();
                if (!alive) return;
                if (error === 'sharing_not_approved' || error === 'permission_denied') {
                    setEnabled(false);
                    return;
                }
                if (error === 'failed') return;
                setEnabled(true);
                setConsent(true);
                if (error && error !== 'no_source' && error !== 'auth_required' && error !== 'disconnected') {
                    setFailure(error);
                }
            } catch {
                logger.debug('[slack-ui] permission probe failed');
            }
        };
        void hydrate();
        const onEvent = (msg: unknown): void => {
            if (typeof msg === 'object' && msg !== null && 'type' in msg && msg.type === MSG.OFFSCREEN_EVENT) {
                refreshTransport();
            }
        };
        const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
            if (area !== 'local' || !changes.role) return;
            const next = changes.role.newValue;
            setRole(next === 'host' || next === 'client' ? next : null);
            applySources([]);
        };
        chrome.storage.onChanged.addListener(onStorage);
        chrome.runtime.onMessage.addListener(onEvent);
        return () => {
            alive = false;
            chrome.runtime.onMessage.removeListener(onEvent);
            chrome.storage.onChanged.removeListener(onStorage);
        };
    }, []);

    useEffect(() => {
        if (!request.requestId || request.state === 'succeeded' || request.outcome) return;
        const timer = window.setInterval(refreshRequest, POLL_MS);
        return () => window.clearInterval(timer);
    }, [request.requestId, request.state, request.outcome]);

    const enableSlack = async (): Promise<void> => {
        if (!consent) return;
        setBusy(true);
        setFailure(null);
        try {
            const granted = await chrome.permissions.request(SLACK_PERMISSIONS);
            if (!granted) {
                setFailure('permission_denied');
                setBusy(false);
                return;
            }
        } catch {
            setFailure('permission_denied');
            setBusy(false);
            return;
        }
        try {
            const res = parseOk(await send(MSG.SLACK_ENABLE, { sharedSessionConsent: true }));
            if (!res.ok) {
                setFailure(res.error);
                return;
            }
            setEnabled(true);
            const listError = await listSources();
            if (
                listError &&
                listError !== 'no_source' &&
                listError !== 'auth_required' &&
                listError !== 'disconnected'
            ) {
                setFailure(listError);
            }
        } catch {
            setFailure('failed');
        } finally {
            setBusy(false);
        }
    };

    const refreshSources = async (): Promise<void> => {
        setBusy(true);
        setFailure(null);
        try {
            const error = await listSources();
            if (error) setFailure(error);
        } catch {
            setFailure('failed');
        } finally {
            setBusy(false);
        }
    };

    const openHostSlack = async (): Promise<void> => {
        setBusy(true);
        setFailure(null);
        try {
            await chrome.tabs.create({ url: `${SLACK_ORIGIN}/` });
        } catch {
            setFailure('failed');
        } finally {
            setBusy(false);
        }
    };

    const startTeleport = async (): Promise<void> => {
        if (!selected || !isSlackSource(selected) || !consent) return;
        setBusy(true);
        setFailure(null);
        try {
            const res = parseOk(
                await send(MSG.REQUEST_START, {
                    applicationKey: 'slack',
                    source: selected,
                    sharedSessionConsent: true as const
                })
            );
            if (!res.ok) {
                setFailure(res.error);
                return;
            }
            if (typeof res.requestId === 'string' && res.requestId.length > 0) {
                const requestId = res.requestId;
                setRequest((current) => ({ ...current, requestId }));
            }
            refreshRequest();
        } catch {
            setFailure('failed');
        } finally {
            setBusy(false);
        }
    };

    const cancelRequest = async (): Promise<void> => {
        setBusy(true);
        try {
            await send(MSG.REQUEST_CANCEL, request.requestId ? { requestId: request.requestId } : undefined);
            refreshRequest();
        } catch {
            setFailure('failed');
        } finally {
            setBusy(false);
        }
    };

    const openDestination = async (): Promise<void> => {
        if (request.state !== 'succeeded' || request.destinationTabId === null) return;
        try {
            const tab = await chrome.tabs.update(request.destinationTabId, { active: true });
            if (tab?.windowId !== undefined) {
                try {
                    await chrome.windows.update(tab.windowId, { focused: true });
                } catch {
                    logger.debug('[slack-ui] window focus skipped');
                }
            }
        } catch {
            setFailure('failed');
        }
    };

    const client = role === 'client';
    const host = role === 'host';
    const succeeded = request.state === 'succeeded';
    const canList = enabled && (host || connected);
    const canStart =
        client &&
        enabled &&
        connected &&
        consent &&
        selected !== null &&
        !(request.state in ACTIVE_STATES) &&
        !succeeded;
    const canCancel = Boolean(request.requestId) && !succeeded && request.outcome === null;
    const showDestination = succeeded && request.destinationTabId !== null;
    const displayFailure = succeeded || request.state in ACTIVE_STATES ? null : failure;

    return (
        <section
            className={
                compact
                    ? 'mt-4 space-y-4 rounded-2xl border border-gray-200 bg-white p-4'
                    : 'min-w-0 space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7'
            }
            aria-labelledby="slack-title">
            <div>
                {!compact && (
                    <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                        03 / Slack session
                    </p>
                )}
                <h2 id="slack-title" className={compact ? 'text-base font-semibold' : 'text-xl font-semibold'}>
                    {t('slackTitle')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                    {host ? t('slackHostHelp') : client ? t('slackClientHelp') : t('slackRoleHelp')}
                </p>
            </div>

            {role === null && (
                <div className="flex flex-wrap gap-3">
                    <Button
                        size="sm"
                        appearance="outline"
                        onClick={() => void chrome.runtime.openOptionsPage()}
                        data-testid="slack-open-options">
                        {t('slackOpenOptions')}
                    </Button>
                </div>
            )}

            <label className="flex gap-3 text-sm leading-6 text-gray-800">
                <input
                    type="checkbox"
                    className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={consent}
                    disabled={busy}
                    onChange={(e) => setConsent((e.currentTarget as HTMLInputElement).checked)}
                    data-testid="slack-consent"
                />
                <span>{t('slackConsent')}</span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    size="sm"
                    disabled={busy || !consent}
                    onClick={() => void enableSlack()}
                    data-testid="slack-enable">
                    {t('slackEnable')}
                </Button>
                {enabled && (
                    <span
                        className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-800"
                        data-testid="slack-enabled"
                        role="status">
                        {t('slackEnabled')}
                    </span>
                )}
            </div>

            {host && (
                <div className="flex flex-wrap gap-3">
                    <Button
                        size="sm"
                        appearance="outline"
                        disabled={busy}
                        onClick={() => void openHostSlack()}
                        data-testid="slack-open-host">
                        {t('slackOpenHost')}
                    </Button>
                </div>
            )}

            <div className="flex flex-wrap gap-3">
                <Button
                    size="sm"
                    appearance="outline"
                    disabled={busy || !canList}
                    onClick={() => void refreshSources()}
                    data-testid="slack-refresh-sources">
                    {t('slackRefreshSources')}
                </Button>
            </div>

            {client && !connected && <p className="text-sm leading-6 text-gray-600">{t('slackNeedConnection')}</p>}

            {enabled && sources.length === 0 && canList && (
                <p className="text-sm leading-6 text-gray-600">{host ? t('slackHostEmpty') : t('slackClientEmpty')}</p>
            )}

            {sources.length > 0 && (
                <fieldset className="space-y-3" data-testid="slack-source-list">
                    <legend className="text-sm font-semibold">{t('slackChooseSource')}</legend>
                    <p className="text-sm leading-6 text-gray-600">
                        {client ? t('slackChooseClient') : t('slackChooseHost')}
                    </p>
                    {client ? (
                        <div className="flex flex-wrap gap-3">
                            {sources.map((source, index) => {
                                const pressed = selected !== null && sourceKey(selected) === sourceKey(source);
                                return (
                                    <Button
                                        key={sourceKey(source)}
                                        size="sm"
                                        appearance={pressed ? 'fill' : 'outline'}
                                        aria-pressed={pressed}
                                        disabled={busy}
                                        onClick={() => setSelected(source)}
                                        data-testid={`slack-source-${index}`}>
                                        {source.workspaceName}
                                        <span className="ml-2 font-mono text-xs">{source.userId}</span>
                                    </Button>
                                );
                            })}
                        </div>
                    ) : (
                        <ul className="space-y-2 text-sm">
                            {sources.map((source, index) => (
                                <li
                                    key={sourceKey(source)}
                                    className="font-medium"
                                    data-testid={`slack-source-${index}`}>
                                    {source.workspaceName}
                                    <span className="ml-2 font-mono text-xs">{source.userId}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </fieldset>
            )}

            <ul className="space-y-3 break-words rounded-xl bg-gray-50 p-4 text-sm" aria-live="polite">
                <li>
                    <strong>{t('requestState')}: </strong>
                    <span className="ml-2 font-mono" data-testid="request-state">
                        {STATE_COPY[request.state]}
                    </span>
                </li>
                {request.outcome && !succeeded && (
                    <li>
                        <strong>{t('requestOutcome')}: </strong>
                        <span data-testid="request-outcome">{FAILURE_COPY[OUTCOME_FAILURE[request.outcome]]}</span>
                    </li>
                )}
            </ul>

            {displayFailure && (
                <p
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
                    data-testid="slack-failure"
                    role="alert">
                    {FAILURE_COPY[displayFailure]}
                </p>
            )}

            <div className="flex flex-wrap gap-3">
                {client && (
                    <Button
                        size="sm"
                        disabled={busy || !canStart}
                        onClick={() => void startTeleport()}
                        data-testid="slack-start">
                        {t('slackStart')}
                    </Button>
                )}
                <Button
                    size="sm"
                    appearance="outline"
                    disabled={busy || !canCancel}
                    onClick={() => void cancelRequest()}
                    data-testid="cancel-request">
                    {t('cancelRequest')}
                </Button>
                {showDestination && (
                    <Button
                        size="sm"
                        variant="success"
                        onClick={() => void openDestination()}
                        data-testid="slack-open-destination">
                        {t('slackOpenDestination')}
                    </Button>
                )}
            </div>
        </section>
    );
};
