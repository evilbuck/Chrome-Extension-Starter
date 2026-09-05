// Offscreen document — RTCPeerConnection owner.
//
// Owns the single RTCPeerConnection and the ordered reliable data channel.
// Communicates with the service worker via chrome.runtime messages only;
// every inbound message must carry `target: OFFSCREEN_TARGET`. Other
// extension pages (popup, options) cannot command the offscreen directly
// — they go through the worker.
//
// Bidirectional synthetic request/response: when this peer receives an
// ECHO request, it automatically sends an echo_response whose replyTo
// matches the inbound requestId, so the originating peer's pending
// Promise resolves.

import {
    ERROR_KIND,
    LIFECYCLE,
    MSG,
    OFFSCREEN_TARGET,
    PAYLOAD_KIND,
    type ErrorKind,
    type Lifecycle,
    type PayloadKind,
    type Role
} from '@/shared/constants';
import { logger } from '@/shared/lib/logger';
import { Peer, PEER_PAYLOAD_KIND, type PeerEnvelope, type PeerPayload } from '@/shared/lib/peer';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let peer: Peer | null = null;
let role: Role | null = null;
let connectionId: string | null = null;
let lifecycle: Lifecycle = LIFECYCLE.IDLE;
let lastError: ErrorKind | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const report = (
    extra?: { peerMessage?: { payloadKind: PayloadKind; text: string; requestId: string } }
): void => {
    const payload = {
        state: lifecycle,
        role,
        connectionId,
        localDescriptor: peer?.getLocalDescriptor() ?? null,
        error: lastError,
        ...(extra ?? {})
    };
    chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_EVENT, payload }).catch(() => {
        // no listener; fine
    });
};

const setLifecycle = (next: Lifecycle, err: ErrorKind | null = null): void => {
    lifecycle = next;
    lastError = err;
    report();
};

const ensurePeer = (): Peer => {
    if (!role || !connectionId) {
        throw { ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST };
    }
    if (peer) return peer;
    peer = new Peer({ role, connectionId });
    peer.subscribe((ev) => {
        if (ev.type === 'state') {
            lifecycle = ev.state;
            lastError = (ev.error as ErrorKind | null) ?? null;
            report();
        } else if (ev.type === 'response') {
            // Worker doesn't need to act on responses; they are observable
            // for future UI use.
            report();
        } else if (ev.type === 'message') {
            handleInboundPeerMessage(ev.envelope);
        } else if (ev.type === 'descriptor') {
            lifecycle = ev.state;
            report();
        } else {
            lifecycle = ev.state;
            report();
        }
    });
    return peer;
};

const handleInboundPeerMessage = (envelope: PeerEnvelope): void => {
    // Report what we received so popup/options can show it.
    const text =
        envelope.payload.kind === PEER_PAYLOAD_KIND.ECHO
            ? envelope.payload.text
            : envelope.payload.kind === PEER_PAYLOAD_KIND.PING
              ? envelope.payload.nonce
              : envelope.payload.kind === 'echo_response'
                ? envelope.payload.text
                : '';

    report({
        peerMessage: {
            payloadKind: envelope.payload.kind as PayloadKind,
            text,
            requestId: envelope.requestId
        }
    });

    // Auto-respond: only inbound ECHO requests get a correlated echo_response.
    if (!peer || lifecycle !== LIFECYCLE.CONNECTED) return;
    if (envelope.payload.kind !== PEER_PAYLOAD_KIND.ECHO) return;
    if (typeof envelope.replyTo === 'string') return; // this IS a response; don't loop

    try {
        peer.sendReply(
            { kind: 'echo_response', replyTo: envelope.requestId, text: `reply:${envelope.payload.text}` },
            5000
        );
    } catch (err) {
        const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
        logger.debug('[offscreen] auto-echo failed:', kind);
    }
};

// ---------------------------------------------------------------------------
// Sender trust
//
// The offscreen accepts commands ONLY when the message carries the
// OFFSCREEN_TARGET marker AND originates from the service worker. The
// service worker's runtime-sent messages have `sender.url` matching the
// extension's background page URL. We reject any sender with a tab (popup,
// options, content script) and any sender whose URL is not the worker URL.
// ---------------------------------------------------------------------------

const isFromServiceWorker = (sender: chrome.runtime.MessageSender): boolean => {
    if (sender.id !== chrome.runtime.id) return false;
    if (sender.tab) return false;
    // The service worker has no document URL; chrome.runtime.sendMessage
    // from the worker forwards a sender whose url is the worker's
    // background page URL.
    const workerUrl = chrome.runtime.getURL('_generated_background_page.html');
    const acceptable =
        sender.url === undefined ||
        sender.url === workerUrl ||
        sender.url.startsWith('chrome-extension://') && sender.url.includes(chrome.runtime.id);
    return Boolean(acceptable);
};

// ---------------------------------------------------------------------------
// Inbound message handling
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isFromServiceWorker(sender)) {
        sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
        return false;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
        return false;
    }
    const obj = msg as { type?: unknown; target?: unknown; payload?: unknown };
    if (typeof obj.type !== 'string') {
        sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
        return false;
    }
    if (obj.target !== OFFSCREEN_TARGET) {
        sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
        return false;
    }

    switch (obj.type) {
        case MSG.OFFSCREEN_INIT: {
            const p = obj.payload as { role?: unknown; connectionId?: unknown };
            if (typeof p.role !== 'string' || (p.role !== 'host' && p.role !== 'client')) {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            if (typeof p.connectionId !== 'string' || p.connectionId.length === 0) {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            peer?.close();
            peer = null;
            role = p.role;
            connectionId = p.connectionId;
            setLifecycle(LIFECYCLE.IDLE);
            sendResponse({ ok: true });
            return false;
        }

        case MSG.OFFSCREEN_CONNECT_HOST: {
            if (role !== 'host') {
                sendResponse({ ok: false, error: ERROR_KIND.ROLE_MISMATCH });
                return false;
            }
            const p = ensurePeer();
            p.hostCreateOffer()
                .then((descriptor) => {
                    setLifecycle(LIFECYCLE.SIGNALING);
                    sendResponse({ ok: true, descriptor });
                })
                .catch((err: unknown) => {
                    const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
                    setLifecycle(LIFECYCLE.FAILED, kind);
                    sendResponse({ ok: false, error: kind });
                });
            return true;
        }

        case MSG.OFFSCREEN_CONNECT_CLIENT: {
            if (role !== 'client') {
                sendResponse({ ok: false, error: ERROR_KIND.ROLE_MISMATCH });
                return false;
            }
            const p = obj.payload as { remoteDescriptor?: unknown };
            if (typeof p.remoteDescriptor !== 'string') {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            const peerInst = ensurePeer();
            peerInst
                .clientAcceptOffer(p.remoteDescriptor)
                .then((descriptor) => {
                    setLifecycle(LIFECYCLE.SIGNALING);
                    sendResponse({ ok: true, descriptor });
                })
                .catch((err: unknown) => {
                    const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
                    setLifecycle(LIFECYCLE.FAILED, kind);
                    sendResponse({ ok: false, error: kind });
                });
            return true;
        }

        case MSG.OFFSCREEN_APPLY_REMOTE: {
            if (role !== 'host') {
                sendResponse({ ok: false, error: ERROR_KIND.ROLE_MISMATCH });
                return false;
            }
            const p = obj.payload as { remoteDescriptor?: unknown };
            if (typeof p.remoteDescriptor !== 'string') {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            const peerInst = ensurePeer();
            peerInst
                .applyRemoteAnswer(p.remoteDescriptor)
                .then(() => {
                    sendResponse({ ok: true });
                })
                .catch((err: unknown) => {
                    const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
                    setLifecycle(LIFECYCLE.FAILED, kind);
                    sendResponse({ ok: false, error: kind });
                });
            return true;
        }

        case MSG.OFFSCREEN_SEND_PEER: {
            if (!peer || lifecycle !== LIFECYCLE.CONNECTED) {
                sendResponse({ ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST });
                return false;
            }
            const p = obj.payload as { payloadKind?: unknown; text?: unknown; deadlineMs?: unknown };
            if (!isPayloadKind(p.payloadKind)) {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            if (typeof p.deadlineMs !== 'number' || p.deadlineMs <= 0) {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            try {
                let payload: PeerPayload;
                if (p.payloadKind === PAYLOAD_KIND.ECHO) {
                    if (typeof p.text !== 'string' || p.text.length === 0) {
                        sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                        return false;
                    }
                    payload = { kind: PAYLOAD_KIND.ECHO, text: p.text };
                } else if (p.payloadKind === PAYLOAD_KIND.PING) {
                    payload = { kind: PAYLOAD_KIND.PING, nonce: randomNonce() };
                } else {
                    sendResponse({ ok: false, error: ERROR_KIND.UNSUPPORTED_VERSION });
                    return false;
                }
                // Send as a request; resolve on matching reply.
                peer
                    .sendRequest(payload, p.deadlineMs)
                    .then(() => {
                        // Resolve the caller immediately; the inbound response
                        // arrives via OFFSCREEN_EVENT.
                        sendResponse({ ok: true });
                    })
                    .catch((err: unknown) => {
                        const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
                        sendResponse({ ok: false, error: kind });
                    });
            } catch (err) {
                const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
                sendResponse({ ok: false, error: kind });
            }
            return true;
        }

        case MSG.OFFSCREEN_CLOSE: {
            peer?.close();
            peer = null;
            setLifecycle(LIFECYCLE.IDLE);
            sendResponse({ ok: true });
            return false;
        }

        case MSG.OFFSCREEN_STATUS: {
            sendResponse({
                ok: true,
                state: lifecycle,
                role,
                connectionId,
                localDescriptor: peer?.getLocalDescriptor() ?? null,
                error: lastError
            });
            return false;
        }

        default:
            sendResponse({ ok: false, error: ERROR_KIND.UNKNOWN_REQUEST });
            return false;
    }
});

const PAYLOAD_KIND_VALUES = Object.values(PAYLOAD_KIND) as string[];
const isPayloadKind = (v: unknown): v is PayloadKind =>
    typeof v === 'string' && PAYLOAD_KIND_VALUES.includes(v);

const randomNonce = (): string => {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    return Math.random().toString(36).slice(2);
};

logger.debug('[offscreen] document loaded; awaiting commands from service worker');