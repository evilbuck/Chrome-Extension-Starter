import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MSG, OFFSCREEN_TARGET, PAYLOAD_KIND, PAYLOAD_RESPONSE_KIND } from '@/shared/constants';
import type { SlackSession } from '@/shared/lib/slack';
import { SLACK_SHARING_APPROVED } from '@/shared/lib/slack';

const slack = vi.hoisted(() => ({
    listSlackSources: vi.fn(),
    verifySlackHost: vi.fn(),
    captureSlackSession: vi.fn(),
    prepareSlackDestination: vi.fn(),
    applySlackSession: vi.fn()
}));

vi.mock('@/background/apps/slack', () => slack);

type Listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
) => boolean | undefined;

const extensionId = 'test-extension';
const url = (path: string) => `chrome-extension://${extensionId}/${path}`;
const optionsSender = { id: extensionId, url: url('options.html'), tab: { id: 1 } } as chrome.runtime.MessageSender;
const offscreenSender = { id: extensionId, url: url('offscreen.html') };
const connectionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const slackSource = {
    sourceTabId: 1,
    scopeId: 'E01234567',
    workspaceId: 'T01234567',
    userId: 'U01234567',
    enterpriseOrigin: 'https://acme.enterprise.slack.com',
    workspaceOrigin: 'https://acme.slack.com',
    workspaceName: 'Acme'
};
const session = (): SlackSession => ({
    source: slackSource,
    cookies: [
        { name: 'd', value: 'synthetic-cookie' },
        { name: 'd-s', value: 'synthetic-session-cookie' }
    ],
    teams: [
        {
            id: 'E01234567',
            name: 'Acme Grid',
            url: 'https://acme.enterprise.slack.com/',
            domain: 'acme-grid',
            token: 'synthetic-enterprise-token',
            user_id: 'U01234567'
        },
        {
            id: 'T01234567',
            name: 'Acme',
            url: 'https://acme.slack.com/',
            domain: 'acme',
            token: 'synthetic-workspace-token',
            user_id: 'U01234567',
            enterprise_id: 'E01234567',
            enterprise_api_token: 'synthetic-enterprise-token'
        }
    ]
});

let background: Listener;
let offscreenReply: ((message: { type?: string; payload?: unknown }) => unknown) | null;

const deliver = (message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> => {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const pending = background(message, sender, resolve);
    if (pending !== true) resolve(undefined);
    return promise;
};

const connectedStatus = (role: 'host' | 'client') => ({
    ok: true,
    state: 'connected',
    role,
    connectionId,
    authorized: true,
    pairing: {
        phase: 'connected',
        code: null,
        expiresAt: null,
        pending: null,
        pair: {
            id: connectionId,
            role,
            peer: { publicKey: 'AAAA', label: 'Other' },
            createdAt: 1
        },
        error: null
    },
    error: null
});

beforeEach(async () => {
    vi.resetModules();
    offscreenReply = null;
    slack.listSlackSources.mockReset();
    slack.verifySlackHost.mockReset();
    slack.captureSlackSession.mockReset();
    slack.prepareSlackDestination.mockReset();
    slack.applySlackSession.mockReset();
    slack.listSlackSources.mockResolvedValue([slackSource]);
    slack.verifySlackHost.mockResolvedValue(undefined);
    slack.captureSlackSession.mockResolvedValue(session());
    slack.applySlackSession.mockResolvedValue(undefined);
    slack.prepareSlackDestination.mockResolvedValue({
        tabId: 9,
        dispose: vi.fn(async () => undefined),
        finish: vi.fn(async () => undefined)
    });
    const addListener = vi.fn();
    const local: Record<string, unknown> = { [SLACK_SHARING_APPROVED]: true };
    vi.stubGlobal('chrome', {
        runtime: {
            id: extensionId,
            getURL: url,
            ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
            getContexts: vi.fn().mockResolvedValue([{}]),
            onMessage: { addListener },
            sendMessage: (message: { type?: string; target?: string; payload?: unknown }) => {
                if (message.target === OFFSCREEN_TARGET && offscreenReply) {
                    return Promise.resolve(offscreenReply(message));
                }
                return Promise.resolve(undefined);
            }
        },
        offscreen: {
            Reason: { WEB_RTC: 'WEB_RTC' },
            createDocument: vi.fn(),
            closeDocument: vi.fn()
        },
        storage: {
            local: {
                get: vi.fn(async (key: string) => ({ [key]: local[key] })),
                set: vi.fn(async (values: Record<string, unknown>) => {
                    Object.assign(local, values);
                }),
                remove: vi.fn()
            }
        },
        permissions: {
            contains: vi.fn().mockResolvedValue(true)
        }
    });
    await import('@/background/connection');
    background = addListener.mock.calls[0][0];
});

afterEach(() => vi.unstubAllGlobals());

describe('host Slack inbound', () => {
    beforeEach(() => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus('host');
            return { ok: false, error: 'disconnected' };
        };
    });

    it('lists host sources over OFFSCREEN_APP_INBOUND', async () => {
        expect(
            await deliver(
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: {
                        kind: PAYLOAD_KIND.SLACK_LIST,
                        connectionId,
                        deadline: Date.now() + 5000
                    }
                },
                offscreenSender
            )
        ).toEqual({ kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, sources: [slackSource] });
        expect(slack.listSlackSources).toHaveBeenCalled();
    });

    it('captures a host session and verifies the same source', async () => {
        expect(
            await deliver(
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: {
                        kind: PAYLOAD_KIND.SLACK_CAPTURE,
                        source: slackSource,
                        connectionId,
                        deadline: Date.now() + 5000
                    }
                },
                offscreenSender
            )
        ).toEqual({ kind: PAYLOAD_RESPONSE_KIND.SLACK_SESSION, session: session() });
        expect(
            await deliver(
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: {
                        kind: PAYLOAD_KIND.SLACK_VERIFY,
                        source: slackSource,
                        connectionId,
                        deadline: Date.now() + 5000
                    }
                },
                offscreenSender
            )
        ).toEqual({ kind: PAYLOAD_RESPONSE_KIND.SLACK_VERIFIED });
    });

    it('maps a host capture throw to slack_error', async () => {
        slack.captureSlackSession.mockRejectedValueOnce(new Error('nope'));
        expect(
            await deliver(
                {
                    type: MSG.OFFSCREEN_APP_INBOUND,
                    payload: {
                        kind: PAYLOAD_KIND.SLACK_CAPTURE,
                        source: slackSource,
                        connectionId,
                        deadline: Date.now() + 5000
                    }
                },
                offscreenSender
            )
        ).toEqual({ kind: PAYLOAD_RESPONSE_KIND.SLACK_ERROR, error: 'failed' });
    });
});

describe('client Slack request pipeline', () => {
    it('captures, applies and verifies a Slack session on the client', async () => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus('client');
            if (message.type === MSG.OFFSCREEN_APP_REQUEST) {
                const kind = (message.payload as { kind?: string } | undefined)?.kind;
                if (kind === PAYLOAD_KIND.SLACK_CAPTURE) {
                    return { ok: true, payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_SESSION, session: session() } };
                }
                if (kind === PAYLOAD_KIND.SLACK_VERIFY) {
                    return { ok: true, payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_VERIFIED } };
                }
            }
            return { ok: false, error: 'disconnected' };
        };
        const started = await deliver(
            {
                type: MSG.REQUEST_START,
                payload: { applicationKey: 'slack', sharedSessionConsent: true, source: slackSource }
            },
            optionsSender
        );
        expect(started).toMatchObject({ ok: true, requestId: expect.any(String) });
        await vi.waitFor(async () => {
            const status = await deliver({ type: MSG.REQUEST_STATUS }, optionsSender);
            expect(status).toMatchObject({ ok: true, state: 'succeeded', destinationTabId: 9 });
        });
        expect(slack.prepareSlackDestination).toHaveBeenCalled();
        expect(slack.applySlackSession).toHaveBeenCalled();
    });

    it('fails the request when the capture payload is not a session', async () => {
        offscreenReply = (message) => {
            if (message.type === MSG.OFFSCREEN_STATUS) return connectedStatus('client');
            if (message.type === MSG.OFFSCREEN_APP_REQUEST) {
                return { ok: true, payload: { kind: PAYLOAD_RESPONSE_KIND.SLACK_SOURCES, sources: [] } };
            }
            return { ok: false, error: 'disconnected' };
        };
        const started = await deliver(
            {
                type: MSG.REQUEST_START,
                payload: { applicationKey: 'slack', sharedSessionConsent: true, source: slackSource }
            },
            optionsSender
        );
        expect(started).toMatchObject({ ok: true });
        await vi.waitFor(async () => {
            const status = await deliver({ type: MSG.REQUEST_STATUS }, optionsSender);
            expect(status).toMatchObject({ ok: true, outcome: 'failed' });
        });
    });
});
