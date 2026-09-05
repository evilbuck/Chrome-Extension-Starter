import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_KIND, MSG, OFFSCREEN_TARGET } from '@/shared/constants';

// Chrome's bundled typings omit the boolean that keeps sendResponse alive.
type Listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
) => boolean | undefined;
const extensionId = 'test-extension';
const url = (path: string) => `chrome-extension://${extensionId}/${path}`;
const optionsSender = { id: extensionId, url: url('options.html'), tab: { id: 1 } } as chrome.runtime.MessageSender;
const workerSender = { id: extensionId, url: url('static/js/background.js') };
let background: Listener;
let offscreen: Listener;

const deliver = (listener: Listener, message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> => {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const pending = listener(message, sender, resolve);
    if (pending !== true) resolve(undefined);
    return promise;
};

beforeEach(async () => {
    vi.resetModules();
    const addListener = vi.fn();
    vi.stubGlobal('chrome', {
        runtime: {
            id: extensionId,
            getURL: url,
            ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
            getContexts: vi.fn().mockResolvedValue([{}]),
            onMessage: { addListener },
            sendMessage: (message: { target?: string }) =>
                message.target === OFFSCREEN_TARGET
                    ? deliver(offscreen, message, workerSender)
                    : Promise.resolve(undefined)
        }
    });
    // These entry modules register listeners at import time; load only after installing each test's Chrome context.
    await import('@/background/connection');
    background = addListener.mock.calls[0][0];
    await import('@/offscreen/index');
    offscreen = addListener.mock.calls[1][0];
});

afterEach(() => vi.unstubAllGlobals());

describe('extension message sender boundaries', () => {
    it('lets an Options tab read the authoritative offscreen status', async () => {
        const status = await deliver(background, { type: MSG.OPTIONS_GET_STATUS }, optionsSender);
        expect(status).toMatchObject({ ok: true, state: 'idle', error: null });
    });

    it('lets the popup read status without tab metadata', async () => {
        const status = await deliver(
            background,
            { type: MSG.OPTIONS_GET_STATUS },
            {
                id: extensionId,
                url: url('popup.html')
            }
        );
        expect(status).toMatchObject({ ok: true, state: 'idle', error: null });
    });

    it.each([
        { id: 'another-extension', url: url('options.html') },
        { id: extensionId, url: 'https://example.com', tab: { id: 1 } },
        { id: extensionId, url: url('offscreen.html') },
        { id: extensionId, url: url('other.html') }
    ])('rejects an unauthorized UI sender: $url / $id', async (sender) => {
        expect(
            await deliver(background, { type: MSG.OPTIONS_START_HOST }, sender as chrome.runtime.MessageSender)
        ).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('does not let an offscreen listener race the worker response to an Options command', async () => {
        const response = vi.fn();
        const command = { type: MSG.OPTIONS_GET_STATUS };
        offscreen(command, optionsSender, response);
        background(command, optionsSender, response);
        await vi.waitFor(() => expect(response).toHaveBeenCalledOnce());
        expect(response).toHaveBeenCalledWith(expect.objectContaining({ ok: true, state: 'idle', error: null }));
    });

    it.each([
        'options.html',
        'popup.html',
        'other.html',
        '_generated_background_page.html'
    ])('rejects a direct offscreen command from an extension document: %s', async (page) => {
        const response = await deliver(
            offscreen,
            { type: MSG.OFFSCREEN_STATUS, target: OFFSCREEN_TARGET },
            {
                id: extensionId,
                url: url(page)
            }
        );
        expect(response).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });

    it('accepts worker messages when Chrome omits the worker URL', async () => {
        const response = await deliver(
            offscreen,
            { type: MSG.OFFSCREEN_STATUS, target: OFFSCREEN_TARGET },
            {
                id: extensionId
            }
        );
        expect(response).toMatchObject({ ok: true, state: 'idle' });
    });

    it('rejects an unidentified document even if its URL is omitted', async () => {
        const response = await deliver(
            offscreen,
            { type: MSG.OFFSCREEN_STATUS, target: OFFSCREEN_TARGET },
            {
                id: extensionId,
                documentId: 'document-id'
            }
        );
        expect(response).toEqual({ ok: false, error: ERROR_KIND.INVALID_SENDER_CONTEXT });
    });
});
