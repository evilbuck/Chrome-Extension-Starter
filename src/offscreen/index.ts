// Offscreen document — RTCPeerConnection owner and pairing controller.
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

import { createBrowserPairingDeps, PairingController } from '@/offscreen/pairing';
import {
    ERROR_KIND,
    type ErrorKind,
    LIFECYCLE,
    MSG,
    OFFSCREEN_TARGET,
    PAYLOAD_KIND,
    PAYLOAD_RESPONSE_KIND,
    type PayloadKind
} from '@/shared/constants';
import {
    isSlackRequestKind,
    type PeerEnvelope,
    type PeerPayload,
    type PeerResponsePayload
} from '@/shared/lib/envelope';
import { logger } from '@/shared/lib/logger';
import { isPairingCommand } from '@/shared/lib/pairing-protocol';
import { PEER_PAYLOAD_KIND } from '@/shared/lib/peer';
import { isSlackSource } from '@/shared/lib/slack';

const pairing = new PairingController(
    createBrowserPairingDeps({
        onChange: () => report(),
        onPeerMessage: (envelope) => handleInboundPeerMessage(envelope)
    })
);

const report = (extra?: { peerMessage?: { payloadKind: PayloadKind; text: string; requestId: string } }): void => {
    const connectionId = pairing.getConnectionId();
    const payload = {
        state: pairing.getLifecycle(),
        role: pairing.getRole(),
        connectionId,
        authorized: connectionId !== null && pairing.isAuthorized(connectionId),
        pairing: pairing.snapshot(),
        error: pairing.getLastError(),
        ...(extra ?? {})
    };
    chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_EVENT, payload }).catch(() => {
        // no listener; fine
    });
};

const handleSlackInbound = (envelope: PeerEnvelope): void => {
    const peer = pairing.getPeer();
    if (pairing.getRole() !== 'host' || !peer) return;
    if (!pairing.isAuthorized(envelope.connectionId)) return;
    if (typeof envelope.replyTo === 'string') return;
    if (!isSlackRequestKind(envelope.payload.kind)) return;
    const payload = envelope.payload;
    const respondingPeer = peer;
    const respondingConnection = envelope.connectionId;
    void (async () => {
        let reply: PeerResponsePayload = {
            kind: PAYLOAD_RESPONSE_KIND.SLACK_ERROR,
            replyTo: envelope.requestId,
            error: 'failed'
        };
        try {
            const res: unknown = await chrome.runtime.sendMessage({
                type: MSG.OFFSCREEN_APP_INBOUND,
                payload: {
                    kind: payload.kind,
                    source: 'source' in payload ? payload.source : undefined,
                    requestId: envelope.requestId,
                    connectionId: envelope.connectionId,
                    deadline: envelope.deadline
                }
            });
            if (
                res &&
                typeof res === 'object' &&
                !Array.isArray(res) &&
                'kind' in res &&
                typeof res.kind === 'string'
            ) {
                reply = { ...(res as PeerResponsePayload), replyTo: envelope.requestId };
            }
        } catch {
            // Worker revival or rejected sender: do not leak credentials; reply failed.
        }
        if (
            pairing.getPeer() !== respondingPeer ||
            pairing.getConnectionId() !== respondingConnection ||
            !pairing.isAuthorized(respondingConnection) ||
            Date.now() >= envelope.deadline
        )
            return;
        try {
            const left = envelope.deadline - Date.now();
            respondingPeer.sendReply(reply, left);
        } catch (err) {
            const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
            logger.debug('[offscreen] slack reply failed:', kind);
        }
    })();
};

const handleInboundPeerMessage = (envelope: PeerEnvelope): void => {
    if (!pairing.isAuthorized(envelope.connectionId)) return;
    if (isSlackRequestKind(envelope.payload.kind)) {
        handleSlackInbound(envelope);
        return;
    }

    const text =
        envelope.payload.kind === PEER_PAYLOAD_KIND.ECHO
            ? envelope.payload.text
            : envelope.payload.kind === PEER_PAYLOAD_KIND.PING
              ? envelope.payload.nonce
              : envelope.payload.kind === PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE
                ? envelope.payload.text
                : '';

    report({
        peerMessage: {
            payloadKind: envelope.payload.kind as PayloadKind,
            text,
            requestId: envelope.requestId
        }
    });

    const peer = pairing.getPeer();
    if (!peer || !pairing.isAuthorized(envelope.connectionId)) return;
    if (envelope.payload.kind !== PEER_PAYLOAD_KIND.ECHO) return;
    if (typeof envelope.replyTo === 'string') return;

    try {
        peer.sendReply(
            {
                kind: PAYLOAD_RESPONSE_KIND.ECHO_RESPONSE,
                replyTo: envelope.requestId,
                text: `reply:${envelope.payload.text}`
            },
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
// worker sender has no tab or document ID. Its URL may be omitted by
// Chrome; when present, it must match the exact MV3 worker script.
// ---------------------------------------------------------------------------

const isFromServiceWorker = (sender: chrome.runtime.MessageSender): boolean => {
    if (sender.id !== chrome.runtime.id) return false;
    if (sender.tab || sender.documentId !== undefined) return false;
    return sender.url === undefined || sender.url === chrome.runtime.getURL('static/js/background.js');
};

const statusPayload = () => {
    const connectionId = pairing.getConnectionId();
    return {
        ok: true as const,
        state: pairing.getLifecycle(),
        role: pairing.getRole(),
        connectionId,
        authorized: connectionId !== null && pairing.isAuthorized(connectionId),
        pairing: pairing.snapshot(),
        error: pairing.getLastError()
    };
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // runtime.sendMessage also reaches this document for worker-bound UI
    // commands. Do not answer those messages: the first response wins.
    if (!msg || typeof msg !== 'object' || !('target' in msg) || msg.target !== OFFSCREEN_TARGET) {
        return false;
    }
    if (Array.isArray(msg)) {
        sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
        return false;
    }
    const obj = msg as { type?: unknown; target?: unknown; payload?: unknown };
    if (typeof obj.type !== 'string') {
        sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
        return false;
    }
    if (!isFromServiceWorker(sender)) {
        sendResponse({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
        return false;
    }

    switch (obj.type) {
        case MSG.OFFSCREEN_PAIRING: {
            if (!isPairingCommand(obj.payload)) {
                sendResponse({ ok: false, error: 'invalid_message' });
                return false;
            }
            pairing
                .handleCommand(obj.payload)
                .then((result) => sendResponse(result))
                .catch(() => sendResponse({ ok: false, error: 'unavailable' }));
            return true;
        }

        case MSG.OFFSCREEN_SEND_PEER: {
            const peer = pairing.getPeer();
            const connectionId = pairing.getConnectionId();
            if (
                !peer ||
                !connectionId ||
                !pairing.isAuthorized(connectionId) ||
                pairing.getLifecycle() !== LIFECYCLE.CONNECTED
            ) {
                sendResponse({ ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST });
                return false;
            }
            const p = obj.payload as { payloadKind?: unknown; text?: unknown; deadlineMs?: unknown };
            if (p.payloadKind !== PAYLOAD_KIND.ECHO && p.payloadKind !== PAYLOAD_KIND.PING) {
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
                } else {
                    payload = { kind: PAYLOAD_KIND.PING, nonce: randomNonce() };
                }
                peer.sendRequest(payload, p.deadlineMs)
                    .then(() => {
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

        case MSG.OFFSCREEN_APP_REQUEST: {
            if (pairing.getRole() !== 'client') {
                sendResponse({ ok: false, error: ERROR_KIND.ROLE_MISMATCH });
                return false;
            }
            const peer = pairing.getPeer();
            const connectionId = pairing.getConnectionId();
            if (
                !peer ||
                !connectionId ||
                !pairing.isAuthorized(connectionId) ||
                pairing.getLifecycle() !== LIFECYCLE.CONNECTED
            ) {
                sendResponse({ ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST });
                return false;
            }
            const p = obj.payload;
            if (!p || typeof p !== 'object' || Array.isArray(p) || !('kind' in p) || !('deadlineMs' in p)) {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            if (typeof p.deadlineMs !== 'number' || p.deadlineMs <= 0) {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            if (!('connectionId' in p) || typeof p.connectionId !== 'string' || p.connectionId !== connectionId) {
                sendResponse({ ok: false, error: ERROR_KIND.CONNECTION_ID_MISMATCH });
                return false;
            }
            if (!pairing.isAuthorized(p.connectionId)) {
                sendResponse({ ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST });
                return false;
            }
            const kind = p.kind;
            let payload: PeerPayload;
            if (kind === PAYLOAD_KIND.SLACK_LIST) {
                payload = { kind: PAYLOAD_KIND.SLACK_LIST };
            } else if (
                (kind === PAYLOAD_KIND.SLACK_CAPTURE || kind === PAYLOAD_KIND.SLACK_VERIFY) &&
                'source' in p &&
                isSlackSource(p.source)
            ) {
                payload = { kind, source: p.source };
            } else {
                sendResponse({ ok: false, error: ERROR_KIND.MALFORMED });
                return false;
            }
            peer.sendRequest(payload, p.deadlineMs)
                .then((envelope) => {
                    sendResponse({ ok: true, payload: envelope.payload });
                })
                .catch((err: unknown) => {
                    const kind = (err as { kind?: ErrorKind }).kind ?? ERROR_KIND.UNKNOWN;
                    sendResponse({ ok: false, error: kind });
                });
            return true;
        }

        case MSG.OFFSCREEN_CLOSE: {
            pairing.disconnectTransport();
            sendResponse({ ok: true });
            return false;
        }

        case MSG.OFFSCREEN_STATUS: {
            void pairing.ready().then(() => sendResponse(statusPayload()));
            return true;
        }

        default:
            sendResponse({ ok: false, error: ERROR_KIND.UNKNOWN_REQUEST });
            return false;
    }
});

const randomNonce = (): string => {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    return Math.random().toString(36).slice(2);
};

globalThis.addEventListener('pagehide', () => {
    pairing.dispose();
});

logger.debug('[offscreen] document loaded; awaiting commands from service worker');
