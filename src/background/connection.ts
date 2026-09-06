// Worker-side bridge.
//
// Owns the offscreen-document lifecycle (one per profile) and routes
// OFFSCREEN_* messages between the popup/options UI and the offscreen.
// Runtime-validates inbound senders by extension ID and exact document URL.
// Status queries are answered from the offscreen (the authoritative state
// owner) when that document exists — NEVER from worker module-level globals,
// which would be lost on MV3 worker revival. When the offscreen is absent,
// status loads remembered public pair metadata only and does not create a
// live connection.
//
// Sender trust is restricted to the EXACT popup.html or options.html URL
// (no other extension page — including the offscreen — can drive these
// commands). The offscreen and content-script pages are rejected.
//
// Trusted extension pages (popup, options) drive the connection through
// these worker-bound commands:
//
//   OPTIONS_GET_STATUS      → query offscreen state or remembered pair
//   OPTIONS_DISCONNECT      → cancel pairing signaling + tear down offscreen
//   OPTIONS_SEND_SYNTHETIC  → send echo / ping over the data channel
//   PAIRING                 → validated PairingCommand → offscreen
//
// Each command has a runtime payload validator. The worker forwards pairing
// commands to the offscreen by tagging them with `target: OFFSCREEN_TARGET`.

import {
    applySlackSession,
    captureSlackSession,
    listSlackSources,
    prepareSlackDestination,
    verifySlackHost
} from '@/background/apps/slack';
import {
    attachDestination,
    cancelRequest,
    completeRequest,
    createRequestGuard,
    getRequestStatus,
    invalidateRequest,
    runRequestPipeline,
    setRequestState,
    startRequest
} from '@/background/request';
import {
    ERROR_KIND,
    type ErrorKind,
    LIFECYCLE,
    type Lifecycle,
    MSG,
    OFFSCREEN_TARGET,
    PAIRING_TRUST_STORAGE_KEY,
    PAYLOAD_KIND,
    PAYLOAD_RESPONSE_KIND,
    type PayloadKind,
    REQUEST_STATE,
    REQUEST_TRANSPORT_TIMEOUT_MS,
    ROLE,
    type Role
} from '@/shared/constants';
import { logger } from '@/shared/lib/logger';
import {
    isPairingCode,
    isPairingCommand,
    isPairingDevice,
    normalizePairingCode,
    type PairedBrowser,
    type PairingCommand,
    type PairingCommandResult,
    type PairingFailure,
    type PairingPhase,
    type PairingSnapshot
} from '@/shared/lib/pairing-protocol';
import {
    isSlackSession,
    isSlackSource,
    SLACK_FAILURES,
    SLACK_PERMISSIONS,
    SLACK_SHARING_APPROVED,
    SlackError,
    type SlackFailure,
    type SlackSource,
    sameSlackSource,
    slackFailure
} from '@/shared/lib/slack';
import { isUuidV4, randomUuid } from '@/shared/lib/uuid';

import type { MessageMap } from '@/shared/types';

// ---------------------------------------------------------------------------
// Sender trust
// ---------------------------------------------------------------------------

const POPUP_URL = chrome.runtime.getURL('popup.html');
const OPTIONS_URL = chrome.runtime.getURL('options.html');
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

/** Allowed: only the popup or the options page. Rejects the offscreen,
 *  any other extension page, content scripts, and external pages. */
const isAllowedUiPage = (sender: chrome.runtime.MessageSender): boolean => {
    if (sender.id !== chrome.runtime.id) return false;
    // Options opens in a tab; sender.tab does not imply a content script.
    if (typeof sender.url !== 'string' || sender.url.length === 0) return false;
    return sender.url === POPUP_URL || sender.url === OPTIONS_URL;
};

const isFromOffscreen = (sender: chrome.runtime.MessageSender): boolean => {
    if (sender.id !== chrome.runtime.id) return false;
    if (sender.tab) return false;
    return sender.url === OFFSCREEN_URL;
};

// ---------------------------------------------------------------------------
// Offscreen lifecycle — single-flight create, real close, real query
// ---------------------------------------------------------------------------

let ensureInFlight: Promise<boolean> | null = null;

const queryOffscreenPresent = async (): Promise<boolean> => {
    try {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            documentUrls: [OFFSCREEN_URL]
        });
        return contexts.length > 0;
    } catch {
        return false;
    }
};

const ensureOffscreen = (): Promise<boolean> => {
    if (ensureInFlight) return ensureInFlight;
    ensureInFlight = (async () => {
        try {
            if (await queryOffscreenPresent()) return true;
            await chrome.offscreen.createDocument({
                url: OFFSCREEN_URL,
                reasons: [chrome.offscreen.Reason.WEB_RTC],
                justification: 'LAN auth-handoff peer connection (extension-only transport)'
            });
            return true;
        } catch (err) {
            logger.error('[connection] createDocument failed:', err);
            return false;
        } finally {
            ensureInFlight = null;
        }
    })();
    return ensureInFlight;
};

const closeOffscreenDocument = async (): Promise<void> => {
    try {
        await chrome.offscreen.closeDocument();
    } catch (err) {
        logger.debug('[connection] closeDocument no-op:', err);
    }
};

// ---------------------------------------------------------------------------
// Send-to-offscreen helper
// ---------------------------------------------------------------------------

const sendToOffscreen = async <T>(type: MSG, payload?: unknown): Promise<T | { ok: false; error: ErrorKind }> => {
    const ok = await ensureOffscreen();
    if (!ok) return { ok: false, error: ERROR_KIND.CREATE_DOCUMENT_FAILED };
    try {
        return await chrome.runtime.sendMessage({ type, target: OFFSCREEN_TARGET, payload });
    } catch (err) {
        logger.error('[connection] sendMessage to offscreen failed:', err);
        return { ok: false, error: ERROR_KIND.UNKNOWN };
    }
};

const sendToExistingOffscreen = async <T>(
    type: MSG,
    payload?: unknown
): Promise<T | { ok: false; error: ErrorKind }> => {
    try {
        return await chrome.runtime.sendMessage({ type, target: OFFSCREEN_TARGET, payload });
    } catch (err) {
        logger.error('[connection] sendMessage to offscreen failed:', err);
        return { ok: false, error: ERROR_KIND.UNKNOWN };
    }
};

// ---------------------------------------------------------------------------
// Runtime validators
// ---------------------------------------------------------------------------

const LIFECYCLE_VALUES = Object.values(LIFECYCLE) as Lifecycle[];
const ERROR_KIND_VALUES = Object.values(ERROR_KIND) as ErrorKind[];
const ROLE_VALUES = Object.values(ROLE) as Role[];
const PAIRING_PHASES: readonly PairingPhase[] = [
    'idle',
    'creating',
    'waiting',
    'confirming',
    'connecting',
    'connected',
    'disconnected',
    'expired',
    'rejected',
    'failed'
];
const PAIRING_FAILURES: readonly PairingFailure[] = [
    'invalid_code',
    'expired',
    'busy',
    'rejected',
    'cancelled',
    'disconnected',
    'unpaired',
    'invalid_peer',
    'invalid_message',
    'rate_limited',
    'unavailable',
    'connection_failed'
];

const isLifecycle = (v: unknown): v is Lifecycle => typeof v === 'string' && LIFECYCLE_VALUES.includes(v as Lifecycle);
const isRole = (v: unknown): v is Role => typeof v === 'string' && ROLE_VALUES.includes(v as Role);
const isErrorKind = (v: unknown): v is ErrorKind => typeof v === 'string' && ERROR_KIND_VALUES.includes(v as ErrorKind);
const isSyntheticPayloadKind = (v: unknown): v is typeof PAYLOAD_KIND.ECHO | typeof PAYLOAD_KIND.PING =>
    v === PAYLOAD_KIND.ECHO || v === PAYLOAD_KIND.PING;
const isPairingPhase = (v: unknown): v is PairingPhase =>
    typeof v === 'string' && (PAIRING_PHASES as readonly string[]).includes(v);
const isPairingFailure = (v: unknown): v is PairingFailure =>
    typeof v === 'string' && (PAIRING_FAILURES as readonly string[]).includes(v);

const isPairedBrowser = (v: unknown): v is PairedBrowser => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o.id === 'string' &&
        isUuidV4(o.id) &&
        isRole(o.role) &&
        isPairingDevice(o.peer) &&
        typeof o.createdAt === 'number' &&
        Number.isFinite(o.createdAt)
    );
};

const isPairingSnapshot = (v: unknown): v is PairingSnapshot => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    if (!isPairingPhase(o.phase)) return false;
    if (o.code !== null && !isPairingCode(o.code)) return false;
    if (o.expiresAt !== null && (typeof o.expiresAt !== 'number' || !Number.isFinite(o.expiresAt))) return false;
    if (o.error !== null && !isPairingFailure(o.error)) return false;
    if (o.pair !== null && !isPairedBrowser(o.pair)) return false;
    if (o.pending !== null) {
        if (!o.pending || typeof o.pending !== 'object' || Array.isArray(o.pending)) return false;
        const pending = o.pending as Record<string, unknown>;
        if (!isUuidV4(pending.attemptId)) return false;
        if (!isPairingDevice(pending.peer)) return false;
        if (typeof pending.confirmed !== 'boolean') return false;
    }
    return true;
};

interface OffscreenEventPayload {
    state: Lifecycle;
    role: Role | null;
    connectionId: string | null;
    authorized: boolean;
    pairing: PairingSnapshot;
    error: ErrorKind | null;
    peerMessage?: { payloadKind: PayloadKind; text: string; requestId: string };
}

const isOffscreenEventPayload = (v: unknown): v is OffscreenEventPayload => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    if (!isLifecycle(o.state)) return false;
    if (o.role !== null && !isRole(o.role)) return false;
    if (o.connectionId !== null && (typeof o.connectionId !== 'string' || !isUuidV4(o.connectionId))) return false;
    if (typeof o.authorized !== 'boolean') return false;
    if (!isPairingSnapshot(o.pairing)) return false;
    if (o.error !== null && !isErrorKind(o.error)) return false;
    if (o.peerMessage !== undefined) {
        const pm = o.peerMessage;
        if (!pm || typeof pm !== 'object') return false;
        const pmr = pm as Record<string, unknown>;
        if (!isSyntheticPayloadKind(pmr.payloadKind)) return false;
        if (typeof pmr.text !== 'string') return false;
        if (typeof pmr.requestId !== 'string' || !isUuidV4(pmr.requestId)) return false;
    }
    return true;
};

interface OffscreenStatusResponse {
    ok: true;
    state: Lifecycle;
    role: Role | null;
    connectionId: string | null;
    authorized: boolean;
    pairing: PairingSnapshot;
    error: ErrorKind | null;
}

const isOffscreenStatusResponse = (v: unknown): v is OffscreenStatusResponse => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    return o.ok === true && isOffscreenEventPayload(o);
};

const snapshotFromPair = (pair: PairedBrowser | null): PairingSnapshot => ({
    phase: pair ? 'disconnected' : 'idle',
    code: null,
    expiresAt: null,
    pending: null,
    pair,
    error: null
});

const loadRememberedPair = async (): Promise<PairedBrowser | null> => {
    try {
        const stored = await chrome.storage.local.get(PAIRING_TRUST_STORAGE_KEY);
        const value = stored[PAIRING_TRUST_STORAGE_KEY];
        if (!isPairedBrowser(value)) return null;
        return {
            id: value.id,
            role: value.role,
            peer: { publicKey: value.peer.publicKey, label: value.peer.label },
            createdAt: value.createdAt
        };
    } catch {
        return null;
    }
};

const handlePairingStorage = async (payload: unknown): Promise<MessageMap['OFFSCREEN_PAIRING_STORAGE']['res']> => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }
    const command = payload as Record<string, unknown>;
    const expectedKeys = command.action === 'set' ? ['action', 'pair'] : ['action'];
    if (Object.keys(command).length !== expectedKeys.length || !expectedKeys.every((key) => key in command)) {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }
    try {
        switch (command.action) {
            case 'get': {
                const stored = await chrome.storage.local.get(PAIRING_TRUST_STORAGE_KEY);
                const pair = stored[PAIRING_TRUST_STORAGE_KEY];
                return { ok: true, value: isPairedBrowser(pair) ? pair : null };
            }
            case 'role': {
                const stored = await chrome.storage.local.get('role');
                return { ok: true, value: isRole(stored.role) ? stored.role : null };
            }
            case 'set': {
                if (!isPairedBrowser(command.pair)) return { ok: false, error: ERROR_KIND.MALFORMED };
                const pair = command.pair;
                await chrome.storage.local.set({
                    [PAIRING_TRUST_STORAGE_KEY]: {
                        id: pair.id,
                        role: pair.role,
                        peer: { publicKey: pair.peer.publicKey, label: pair.peer.label },
                        createdAt: pair.createdAt
                    }
                });
                return { ok: true, value: null };
            }
            case 'clear':
                await chrome.storage.local.remove(PAIRING_TRUST_STORAGE_KEY);
                return { ok: true, value: null };
            default:
                return { ok: false, error: ERROR_KIND.MALFORMED };
        }
    } catch {
        return { ok: false, error: ERROR_KIND.STORAGE_FAILURE };
    }
};

const rememberedStatus = async (error: ErrorKind | null = null): Promise<OffscreenStatusResponse> => {
    const pair = await loadRememberedPair();
    return {
        ok: true,
        state: LIFECYCLE.IDLE,
        role: pair?.role ?? null,
        connectionId: null,
        authorized: false,
        pairing: snapshotFromPair(pair),
        error
    };
};

// ---------------------------------------------------------------------------
// Outbound broadcast — worker → popup / options
// ---------------------------------------------------------------------------

const broadcastState = (payload: OffscreenEventPayload): void => {
    chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_EVENT, payload }).catch(() => {
        // no listener — fine
    });
};

let lastKnownConnectionId: string | null = null;

// ---------------------------------------------------------------------------
// Worker-bound command handlers (popup/options → worker → offscreen)
// ---------------------------------------------------------------------------

const handleGetStatus = async (): Promise<OffscreenStatusResponse> => {
    if (!(await queryOffscreenPresent())) {
        return rememberedStatus();
    }
    const res = await sendToExistingOffscreen<unknown>(MSG.OFFSCREEN_STATUS);
    if (isOffscreenStatusResponse(res)) {
        if (res.connectionId !== null) lastKnownConnectionId = res.connectionId;
        return res;
    }
    return rememberedStatus(ERROR_KIND.UNKNOWN);
};

const handleDisconnect = async (): Promise<{ ok: true }> => {
    invalidateRequest('disconnected');
    if (await queryOffscreenPresent()) {
        await sendToExistingOffscreen(MSG.OFFSCREEN_PAIRING, { action: 'cancel' });
        await sendToExistingOffscreen(MSG.OFFSCREEN_CLOSE, { reason: 'user' });
    }
    await closeOffscreenDocument();
    lastKnownConnectionId = null;
    const status = await rememberedStatus();
    broadcastState(status);
    return { ok: true };
};

const handleSendSynthetic = async (
    payload: Record<string, unknown>
): Promise<{ ok: true; requestId: string } | { ok: false; error: ErrorKind }> => {
    if (!isSyntheticPayloadKind(payload.payloadKind)) {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }
    if (typeof payload.deadlineMs !== 'number' || payload.deadlineMs <= 0) {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }
    return sendToOffscreen<{ ok: true; requestId: string } | { ok: false; error: ErrorKind }>(MSG.OFFSCREEN_SEND_PEER, {
        payloadKind: payload.payloadKind,
        text: typeof payload.text === 'string' ? payload.text : '',
        deadlineMs: payload.deadlineMs
    });
};

const asPairingResult = (res: unknown): PairingCommandResult => {
    if (!res || typeof res !== 'object' || Array.isArray(res) || !('ok' in res)) {
        return { ok: false, error: 'unavailable' };
    }
    if (res.ok === true) {
        if (!('pairing' in res) || !isPairingSnapshot(res.pairing)) {
            return { ok: false, error: 'unavailable' };
        }
        return { ok: true, pairing: res.pairing };
    }
    const error = 'error' in res ? res.error : null;
    if (error === ERROR_KIND.CREATE_DOCUMENT_FAILED) return { ok: false, error: 'unavailable' };
    if (isPairingFailure(error)) return { ok: false, error };
    return { ok: false, error: 'unavailable' };
};

const handlePairing = async (payload: unknown): Promise<PairingCommandResult> => {
    if (!isPairingCommand(payload)) return { ok: false, error: 'invalid_message' };
    if (payload.action === 'status') {
        const status = await handleGetStatus();
        return { ok: true, pairing: status.pairing };
    }
    const command: PairingCommand =
        payload.action === 'join' ? { ...payload, code: normalizePairingCode(payload.code) } : payload;
    const created = await ensureOffscreen();
    if (!created) return { ok: false, error: 'unavailable' };
    const res = await sendToExistingOffscreen<unknown>(MSG.OFFSCREEN_PAIRING, command);
    const result = asPairingResult(res);
    if (command.action === 'forget') {
        invalidateRequest('disconnected');
        lastKnownConnectionId = null;
        await closeOffscreenDocument();
    }
    return result;
};

// ---------------------------------------------------------------------------
// Slack application — worker orchestration
// ---------------------------------------------------------------------------

let hostExportBusy = false;

const isSlackFailure = (value: unknown): value is SlackFailure =>
    typeof value === 'string' && (SLACK_FAILURES as readonly string[]).includes(value);

const hasSharingApproval = async (): Promise<boolean> => {
    try {
        const stored = await chrome.storage.local.get(SLACK_SHARING_APPROVED);
        return stored[SLACK_SHARING_APPROVED] === true;
    } catch {
        return false;
    }
};

const hasSlackPermissions = async (): Promise<boolean> => {
    try {
        return await chrome.permissions.contains(SLACK_PERMISSIONS);
    } catch {
        return false;
    }
};

const requireConnected = async (
    expectedRole: Role
): Promise<{ ok: true; connectionId: string } | { ok: false; error: SlackFailure }> => {
    const status = await handleGetStatus();
    if (status.state !== LIFECYCLE.CONNECTED || !status.connectionId || status.authorized !== true) {
        return { ok: false, error: 'disconnected' };
    }
    if (status.role !== expectedRole) return { ok: false, error: 'failed' };
    return { ok: true, connectionId: status.connectionId };
};

const throwTransportError = (error: string): never => {
    if (error === ERROR_KIND.CHANNEL_CLOSED || error === ERROR_KIND.TIMEOUT || error === ERROR_KIND.ICE_FAILED) {
        throw new SlackError('disconnected');
    }
    if (
        error === ERROR_KIND.DEADLINE_EXCEEDED ||
        error === ERROR_KIND.EXPIRED ||
        error === ERROR_KIND.REQUEST_EXPIRED
    ) {
        throw new SlackError('expired');
    }
    if (isSlackFailure(error)) throw new SlackError(error);
    throw new SlackError('failed');
};

const sendSlackPeer = async (
    kind: typeof PAYLOAD_KIND.SLACK_LIST | typeof PAYLOAD_KIND.SLACK_CAPTURE | typeof PAYLOAD_KIND.SLACK_VERIFY,
    source: SlackSource | undefined,
    connectionId: string
): Promise<Record<string, unknown>> => {
    const authorized = await requireConnected(ROLE.CLIENT);
    if (!authorized.ok || authorized.connectionId !== connectionId) throw new SlackError('disconnected');
    const res: unknown = await sendToOffscreen(MSG.OFFSCREEN_APP_REQUEST, {
        kind,
        source,
        connectionId,
        deadlineMs: REQUEST_TRANSPORT_TIMEOUT_MS
    });
    if (!res || typeof res !== 'object' || Array.isArray(res) || !('ok' in res)) {
        throw new SlackError('failed');
    }
    if (res.ok !== true) {
        const error = 'error' in res && typeof res.error === 'string' ? res.error : 'failed';
        throwTransportError(error);
    }
    if (!('payload' in res) || !res.payload || typeof res.payload !== 'object' || Array.isArray(res.payload)) {
        throw new SlackError('invalid_payload');
    }
    return res.payload as Record<string, unknown>;
};

const handleSlackEnable = async (
    payload: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (payload.sharedSessionConsent !== true) {
        return { ok: false, error: 'sharing_not_approved' };
    }
    if (!(await hasSlackPermissions())) {
        return { ok: false, error: 'permission_denied' };
    }
    try {
        await chrome.storage.local.set({ [SLACK_SHARING_APPROVED]: true });
    } catch {
        return { ok: false, error: 'failed' };
    }
    return { ok: true };
};

const handleSlackList = async (): Promise<{ ok: true; sources: SlackSource[] } | { ok: false; error: string }> => {
    if (!(await hasSharingApproval())) {
        return { ok: false, error: 'sharing_not_approved' };
    }
    const status = await handleGetStatus();
    try {
        if (status.role === ROLE.CLIENT) {
            if (status.state !== LIFECYCLE.CONNECTED || !status.connectionId || status.authorized !== true) {
                return { ok: false, error: 'disconnected' };
            }
            const payload = await sendSlackPeer(PAYLOAD_KIND.SLACK_LIST, undefined, status.connectionId);
            if (payload.kind === PAYLOAD_RESPONSE_KIND.SLACK_ERROR) {
                return { ok: false, error: isSlackFailure(payload.error) ? payload.error : 'failed' };
            }
            if (payload.kind !== PAYLOAD_RESPONSE_KIND.SLACK_SOURCES || !Array.isArray(payload.sources)) {
                return { ok: false, error: 'invalid_payload' };
            }
            return { ok: true, sources: payload.sources.filter(isSlackSource) };
        }
        if (!(await hasSlackPermissions())) {
            return { ok: false, error: 'permission_denied' };
        }
        const sources = await listSlackSources(() => undefined);
        return { ok: true, sources };
    } catch (error) {
        return { ok: false, error: slackFailure(error) };
    }
};

const runSlackClient = (requestId: string, source: SlackSource): void => {
    const requestGuard = createRequestGuard(requestId);
    let boundConnection: string | null = null;
    const guard = (): void => {
        requestGuard();
        if (boundConnection && lastKnownConnectionId !== null && lastKnownConnectionId !== boundConnection)
            throw new SlackError('disconnected');
    };
    void runRequestPipeline(requestId, async () => {
        guard();
        const connected = await requireConnected(ROLE.CLIENT);
        guard();
        if (!connected.ok) throw new SlackError('disconnected');
        boundConnection = connected.connectionId;

        setRequestState(requestId, REQUEST_STATE.PREPARING_HOST);
        const destination = await prepareSlackDestination(guard);
        try {
            guard();
            attachDestination(requestId, destination);
        } catch (error) {
            await destination.dispose();
            throw error;
        }

        const exportReady = await requireConnected(ROLE.CLIENT);
        guard();
        if (!exportReady.ok) throw new SlackError('disconnected');

        const captured = await sendSlackPeer(PAYLOAD_KIND.SLACK_CAPTURE, source, boundConnection);
        guard();
        if (captured.kind === PAYLOAD_RESPONSE_KIND.SLACK_ERROR) {
            throw new SlackError(isSlackFailure(captured.error) ? captured.error : 'failed');
        }
        if (captured.kind !== PAYLOAD_RESPONSE_KIND.SLACK_SESSION || !isSlackSession(captured.session)) {
            throw new SlackError('invalid_payload');
        }
        const session = captured.session;
        if (!sameSlackSource(source, session.source)) throw new SlackError('scope_changed');

        const applyReady = await requireConnected(ROLE.CLIENT);
        guard();
        if (!applyReady.ok) throw new SlackError('disconnected');

        setRequestState(requestId, REQUEST_STATE.COMPLETING_CLIENT);
        await applySlackSession(destination, session, guard);
        guard();

        setRequestState(requestId, REQUEST_STATE.VERIFYING);
        const verifyReady = await requireConnected(ROLE.CLIENT);
        guard();
        if (!verifyReady.ok) throw new SlackError('disconnected');

        const verified = await sendSlackPeer(PAYLOAD_KIND.SLACK_VERIFY, source, boundConnection);
        guard();
        if (verified.kind === PAYLOAD_RESPONSE_KIND.SLACK_ERROR) {
            throw new SlackError(isSlackFailure(verified.error) ? verified.error : 'failed');
        }
        if (verified.kind !== PAYLOAD_RESPONSE_KIND.SLACK_VERIFIED) {
            throw new SlackError('failed');
        }

        if (!(await completeRequest(requestId))) throw new SlackError('cancelled');
    });
};

const handleRequestStart = async (
    payload: Record<string, unknown>
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> => {
    const applicationKey = typeof payload.applicationKey === 'string' ? payload.applicationKey : 'unspecified';
    if (applicationKey !== 'slack') {
        const started = startRequest({ requestId: randomUuid(), applicationKey });
        return { ok: false, error: started.ok ? 'failed' : started.error };
    }
    const connected = await requireConnected(ROLE.CLIENT);
    if (!connected.ok) return { ok: false, error: connected.error };
    if (!(await hasSharingApproval())) return { ok: false, error: 'sharing_not_approved' };
    if (!(await hasSlackPermissions())) return { ok: false, error: 'permission_denied' };
    if (payload.sharedSessionConsent !== true) return { ok: false, error: 'sharing_not_approved' };
    if (!isSlackSource(payload.source)) return { ok: false, error: 'invalid_payload' };
    const requestId = randomUuid();
    const started = startRequest({
        requestId,
        applicationKey: 'slack',
        source: payload.source,
        sharedSessionConsent: true
    });
    if (!started.ok) {
        return { ok: false, error: started.reason === 'invalid_payload' ? 'invalid_payload' : started.error };
    }
    runSlackClient(requestId, payload.source);
    return { ok: true, requestId };
};

const handleAppInbound = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const fail = (error: SlackFailure): Record<string, unknown> => ({
        kind: PAYLOAD_RESPONSE_KIND.SLACK_ERROR,
        error
    });
    if (hostExportBusy) return fail('busy');
    hostExportBusy = true;
    try {
        const connected = await requireConnected(ROLE.HOST);
        if (!connected.ok) return fail('disconnected');
        if (!(await hasSharingApproval())) return fail('sharing_not_approved');
        if (!(await hasSlackPermissions())) return fail('permission_denied');
        const kind = payload.kind;
        if (
            payload.connectionId !== connected.connectionId ||
            typeof payload.deadline !== 'number' ||
            !Number.isFinite(payload.deadline)
        )
            return fail('invalid_payload');
        const boundConnection = connected.connectionId;
        const deadline = payload.deadline;
        const guard = (): void => {
            if (Date.now() >= deadline) throw new SlackError('expired');
            if (lastKnownConnectionId !== null && lastKnownConnectionId !== boundConnection)
                throw new SlackError('disconnected');
        };
        guard();
        if (kind === PAYLOAD_KIND.SLACK_LIST) {
            const sources = await listSlackSources(guard);
            const still = await requireConnected(ROLE.HOST);
            if (!still.ok) return fail('disconnected');
            return { kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, sources };
        }
        if (kind !== PAYLOAD_KIND.SLACK_CAPTURE && kind !== PAYLOAD_KIND.SLACK_VERIFY) {
            return fail('invalid_payload');
        }
        if (!isSlackSource(payload.source)) return fail('invalid_payload');
        const exportReady = await requireConnected(ROLE.HOST);
        if (!exportReady.ok) return fail('disconnected');
        if (kind === PAYLOAD_KIND.SLACK_VERIFY) {
            await verifySlackHost(payload.source, guard);
            const still = await requireConnected(ROLE.HOST);
            if (!still.ok) return fail('disconnected');
            return { kind: PAYLOAD_RESPONSE_KIND.SLACK_VERIFIED };
        }
        const session = await captureSlackSession(payload.source, guard);
        const still = await requireConnected(ROLE.HOST);
        if (!still.ok) return fail('disconnected');
        if (!(await hasSharingApproval())) return fail('sharing_not_approved');
        guard();
        if (!(await hasSlackPermissions())) return fail('permission_denied');
        if (!isSlackSession(session)) return fail('invalid_payload');
        return { kind: PAYLOAD_RESPONSE_KIND.SLACK_SESSION, session };
    } catch (error) {
        return fail(slackFailure(error));
    } finally {
        hostExportBusy = false;
    }
};

// ---------------------------------------------------------------------------
// Offscreen-event ingestion
// ---------------------------------------------------------------------------

const handleOffscreenEvent = (payload: OffscreenEventPayload): void => {
    const changedConnection = lastKnownConnectionId !== null && payload.connectionId !== lastKnownConnectionId;
    lastKnownConnectionId = payload.connectionId;
    if (
        changedConnection ||
        payload.state === LIFECYCLE.CLOSED ||
        payload.state === LIFECYCLE.FAILED ||
        payload.authorized !== true
    ) {
        invalidateRequest('disconnected');
    }
    broadcastState(payload);
};

// ---------------------------------------------------------------------------
// Inbound message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
        return false;
    }
    const obj = msg as { type?: unknown; payload?: unknown };
    if (typeof obj.type !== 'string') {
        sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
        return false;
    }

    const fromOffscreen = isFromOffscreen(sender);
    const fromUiPage = isAllowedUiPage(sender);

    if (obj.type === MSG.OFFSCREEN_PAIRING_STORAGE) {
        if (!fromOffscreen) {
            sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
            return false;
        }
        handlePairingStorage(obj.payload).then(sendResponse);
        return true;
    }

    // Offscreen-initiated events flow through silently.
    if (obj.type === MSG.OFFSCREEN_EVENT) {
        if (!fromOffscreen) {
            sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
            return false;
        }
        if (isOffscreenEventPayload(obj.payload)) {
            handleOffscreenEvent(obj.payload);
        } else {
            logger.warn('[connection] dropping offscreen event with invalid payload');
        }
        sendResponse({ ok: true });
        return false;
    }

    if (obj.type === MSG.OFFSCREEN_APP_INBOUND) {
        if (!fromOffscreen) {
            sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
            return false;
        }
        const inbound =
            obj.payload && typeof obj.payload === 'object' && !Array.isArray(obj.payload)
                ? (obj.payload as Record<string, unknown>)
                : {};
        handleAppInbound(inbound).then(sendResponse);
        return true;
    }

    if (!fromUiPage) {
        sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
        return false;
    }

    const payload =
        obj.payload && typeof obj.payload === 'object' && !Array.isArray(obj.payload)
            ? (obj.payload as Record<string, unknown>)
            : {};

    switch (obj.type) {
        case MSG.OPTIONS_GET_STATUS: {
            handleGetStatus().then(sendResponse);
            return true;
        }
        case MSG.OPTIONS_DISCONNECT: {
            handleDisconnect().then(sendResponse);
            return true;
        }
        case MSG.OPTIONS_SEND_SYNTHETIC: {
            handleSendSynthetic(payload).then(sendResponse);
            return true;
        }
        case MSG.PAIRING: {
            handlePairing(obj.payload).then(sendResponse);
            return true;
        }
        case MSG.SLACK_ENABLE: {
            handleSlackEnable(payload).then(sendResponse);
            return true;
        }
        case MSG.SLACK_LIST: {
            handleSlackList().then(sendResponse);
            return true;
        }
        case MSG.REQUEST_START: {
            handleRequestStart(payload).then(sendResponse);
            return true;
        }
        case MSG.REQUEST_CANCEL: {
            sendResponse(cancelRequest());
            return false;
        }
        case MSG.REQUEST_STATUS: {
            sendResponse(getRequestStatus());
            return false;
        }
        default:
            sendResponse({ ok: false, error: ERROR_KIND.UNKNOWN_REQUEST });
            return false;
    }
});

logger.debug(`[connection] module loaded; offscreen target=${OFFSCREEN_TARGET}`);
