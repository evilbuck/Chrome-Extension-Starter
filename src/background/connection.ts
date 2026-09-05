import type { DescriptorEnvelope } from '@/shared/lib/envelope';
import { parseDescriptorAdopt } from '@/shared/lib/envelope';

// Phase 2 worker-side bridge.
//
// Owns the offscreen-document lifecycle (one per profile) and routes
// OFFSCREEN_* messages between the popup/options UI and the offscreen.
// Runtime-validates inbound senders by extension ID and exact document URL.
// Status queries are answered from the offscreen (the authoritative state
// owner) — NEVER from worker module-level globals, which would be lost on
// MV3 worker revival.
//
// Sender trust is restricted to the EXACT popup.html or options.html URL
// (no other extension page — including the offscreen — can drive these
// commands). The offscreen and content-script pages are rejected.
//
// Trusted extension pages (popup, options) drive the connection through
// these worker-bound commands:
//
//   OPTIONS_GET_STATUS      → query offscreen state
//   OPTIONS_DISCONNECT      → close peer + tear down offscreen document
//   OPTIONS_START_HOST      → init host session + create offer
//   OPTIONS_START_CLIENT    → adopt host descriptor's connectionId, accept offer, return answer
//   OPTIONS_APPLY_ANSWER    → host: apply remote answer
//   OPTIONS_SEND_SYNTHETIC  → send echo / ping over the data channel
//
// Each command has a runtime payload validator. The worker forwards the
// command to the offscreen by tagging it with `target: OFFSCREEN_TARGET`.

import {
    ERROR_KIND,
    type ErrorKind,
    LIFECYCLE,
    type Lifecycle,
    MSG,
    OFFSCREEN_TARGET,
    PAYLOAD_KIND,
    type PayloadKind,
    ROLE,
    type Role
} from '@/shared/constants';
import { logger } from '@/shared/lib/logger';
import { isUuidV4, randomUuid } from '@/shared/lib/uuid';

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

const ensureOffscreen = (): Promise<boolean> => {
    if (ensureInFlight) return ensureInFlight;
    ensureInFlight = (async () => {
        try {
            const contexts = await chrome.runtime.getContexts({
                contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
                documentUrls: [OFFSCREEN_URL]
            });
            if (contexts.length > 0) return true;
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

// ---------------------------------------------------------------------------
// Runtime validators
// ---------------------------------------------------------------------------

const LIFECYCLE_VALUES = Object.values(LIFECYCLE) as Lifecycle[];
const ERROR_KIND_VALUES = Object.values(ERROR_KIND) as ErrorKind[];
const PAYLOAD_KIND_VALUES = Object.values(PAYLOAD_KIND) as PayloadKind[];
const ROLE_VALUES = Object.values(ROLE) as Role[];

const isLifecycle = (v: unknown): v is Lifecycle => typeof v === 'string' && LIFECYCLE_VALUES.includes(v as Lifecycle);
const isRole = (v: unknown): v is Role => typeof v === 'string' && ROLE_VALUES.includes(v as Role);
const isErrorKind = (v: unknown): v is ErrorKind => typeof v === 'string' && ERROR_KIND_VALUES.includes(v as ErrorKind);
const isPayloadKind = (v: unknown): v is PayloadKind =>
    typeof v === 'string' && PAYLOAD_KIND_VALUES.includes(v as PayloadKind);

interface OffscreenEventPayload {
    state: Lifecycle;
    role: Role | null;
    connectionId: string | null;
    localDescriptor: string | null;
    error: ErrorKind | null;
    peerMessage?: { payloadKind: PayloadKind; text: string; requestId: string };
}

const isOffscreenEventPayload = (v: unknown): v is OffscreenEventPayload => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    if (!isLifecycle(o.state)) return false;
    if (o.role !== null && !isRole(o.role)) return false;
    if (o.connectionId !== null && (typeof o.connectionId !== 'string' || !isUuidV4(o.connectionId))) return false;
    if (o.localDescriptor !== null && typeof o.localDescriptor !== 'string') return false;
    if (o.error !== null && !isErrorKind(o.error)) return false;
    if (o.peerMessage !== undefined) {
        const pm = o.peerMessage;
        if (!pm || typeof pm !== 'object') return false;
        const pmr = pm as Record<string, unknown>;
        if (!isPayloadKind(pmr.payloadKind)) return false;
        if (typeof pmr.text !== 'string') return false;
        if (typeof pmr.requestId !== 'string' || !isUuidV4(pmr.requestId)) return false;
    }
    return true;
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

interface OffscreenStatusResponse {
    ok: true;
    state: Lifecycle;
    role: Role | null;
    connectionId: string | null;
    localDescriptor: string | null;
    error: ErrorKind | null;
}

const handleGetStatus = async (): Promise<OffscreenStatusResponse> => {
    const ok = await ensureOffscreen();
    if (!ok) {
        return {
            ok: true,
            state: LIFECYCLE.IDLE,
            role: null,
            connectionId: null,
            localDescriptor: null,
            error: ERROR_KIND.CREATE_DOCUMENT_FAILED
        };
    }
    const res = await sendToOffscreen<OffscreenStatusResponse>(MSG.OFFSCREEN_STATUS);
    if (res.ok === true) return res;
    return {
        ok: true,
        state: LIFECYCLE.IDLE,
        role: null,
        connectionId: null,
        localDescriptor: null,
        error: ERROR_KIND.UNKNOWN
    };
};

const handleDisconnect = async (): Promise<{ ok: true }> => {
    await sendToOffscreen(MSG.OFFSCREEN_CLOSE, { reason: 'user' });
    await closeOffscreenDocument();
    lastKnownConnectionId = null;
    broadcastState({
        state: LIFECYCLE.IDLE,
        role: null,
        connectionId: null,
        localDescriptor: null,
        error: null
    });
    return { ok: true };
};

const handleStartHost = async (): Promise<unknown> => {
    const connectionId = randomUuid();
    lastKnownConnectionId = connectionId;
    await sendToOffscreen(MSG.OFFSCREEN_INIT, { role: 'host', connectionId });
    return sendToOffscreen<{ ok: true; descriptor: string } | { ok: false; error: ErrorKind }>(
        MSG.OFFSCREEN_CONNECT_HOST
    );
};

/**
 * Client-init flow:
 *   1. Parse + validate the inbound host descriptor (size, version,
 *      role, expiry) BEFORE doing any RTC work.
 *   2. Adopt the host descriptor's connectionId so the whole session
 *      shares one ID.
 *   3. Hand the SDP to the offscreen as a single combined init+offer so
 *      it can construct the Peer with the matching connectionId.
 */
const handleStartClient = async (payload: {
    remoteDescriptor: unknown;
}): Promise<{ ok: true; descriptor: string } | { ok: false; error: ErrorKind }> => {
    if (typeof payload.remoteDescriptor !== 'string') {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }

    // Validate the inbound descriptor before any RTC work.
    let adopted: DescriptorEnvelope;
    try {
        adopted = parseDescriptorAdopt(payload.remoteDescriptor, { role: 'host' });
    } catch (err) {
        const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.MALFORMED;
        return { ok: false, error: kind };
    }

    lastKnownConnectionId = adopted.connectionId;
    await sendToOffscreen(MSG.OFFSCREEN_INIT, { role: 'client', connectionId: adopted.connectionId });

    return sendToOffscreen<{ ok: true; descriptor: string } | { ok: false; error: ErrorKind }>(
        MSG.OFFSCREEN_CONNECT_CLIENT,
        { remoteDescriptor: payload.remoteDescriptor }
    );
};

const handleApplyAnswer = async (payload: {
    remoteDescriptor: unknown;
}): Promise<{ ok: true } | { ok: false; error: ErrorKind }> => {
    if (typeof payload.remoteDescriptor !== 'string') {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }
    return sendToOffscreen<{ ok: true } | { ok: false; error: ErrorKind }>(MSG.OFFSCREEN_APPLY_REMOTE, {
        remoteDescriptor: payload.remoteDescriptor
    });
};

const handleSendSynthetic = async (payload: {
    payloadKind: unknown;
    text?: unknown;
    deadlineMs?: unknown;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: ErrorKind }> => {
    if (!isPayloadKind(payload.payloadKind)) {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }
    if (typeof payload.deadlineMs !== 'number' || payload.deadlineMs <= 0) {
        return { ok: false, error: ERROR_KIND.MALFORMED };
    }
    return sendToOffscreen<{ ok: true; requestId: string } | { ok: false; error: ErrorKind }>(MSG.OFFSCREEN_SEND_PEER, {
        payloadKind: payload.payloadKind,
        text: payload.text ?? '',
        deadlineMs: payload.deadlineMs
    });
};

// ---------------------------------------------------------------------------
// Offscreen-event ingestion
// ---------------------------------------------------------------------------

const handleOffscreenEvent = (payload: OffscreenEventPayload): void => {
    if (
        lastKnownConnectionId !== null &&
        payload.connectionId !== null &&
        payload.connectionId !== lastKnownConnectionId
    ) {
        logger.warn('[connection] dropping offscreen event with stale connectionId');
        return;
    }
    if (payload.connectionId !== null) {
        lastKnownConnectionId = payload.connectionId;
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

    if (obj.type === MSG.OFFSCREEN_INIT) {
        if (!fromOffscreen) {
            sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
            return false;
        }
        sendResponse({ ok: true });
        return false;
    }

    if (!fromUiPage) {
        sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
        return false;
    }

    const payload = (obj.payload ?? {}) as Record<string, unknown>;

    switch (obj.type) {
        case MSG.OPTIONS_GET_STATUS: {
            handleGetStatus().then(sendResponse);
            return true;
        }
        case MSG.OPTIONS_DISCONNECT: {
            handleDisconnect().then(sendResponse);
            return true;
        }
        case MSG.OPTIONS_START_HOST: {
            handleStartHost().then(sendResponse);
            return true;
        }
        case MSG.OPTIONS_START_CLIENT: {
            handleStartClient(payload as { remoteDescriptor: unknown }).then(sendResponse);
            return true;
        }
        case MSG.OPTIONS_APPLY_ANSWER: {
            handleApplyAnswer(payload as { remoteDescriptor: unknown }).then(sendResponse);
            return true;
        }
        case MSG.OPTIONS_SEND_SYNTHETIC: {
            handleSendSynthetic(payload as { payloadKind: unknown; text?: unknown; deadlineMs?: unknown }).then(
                sendResponse
            );
            return true;
        }
        default:
            sendResponse({ ok: false, error: ERROR_KIND.UNKNOWN_REQUEST });
            return false;
    }
});

logger.debug(`[connection] module loaded; offscreen target=${OFFSCREEN_TARGET}`);
