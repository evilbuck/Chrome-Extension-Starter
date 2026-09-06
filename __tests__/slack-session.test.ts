import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySlackSession, prepareSlackDestination } from '@/background/apps/slack';
import { isSlackSession, SLACK_STAGING_URL, SlackError, type SlackSession } from '@/shared/lib/slack';

const bundle = (): SlackSession => ({
    source: {
        sourceTabId: 4,
        scopeId: 'E1234567890',
        workspaceId: 'T1234567890',
        userId: 'U1234567890',
        enterpriseOrigin: 'https://grid-example.enterprise.slack.com',
        workspaceOrigin: 'https://example.slack.com',
        workspaceName: 'Example'
    },
    cookies: [
        { name: 'd', value: 'synthetic-cookie' },
        { name: 'd-s', value: 'synthetic-session-cookie' }
    ],
    teams: [
        {
            id: 'E1234567890',
            name: 'Example Grid',
            url: 'https://grid-example.enterprise.slack.com/',
            domain: 'grid-example',
            token: 'synthetic-enterprise-token',
            user_id: 'U1234567890'
        },
        {
            id: 'T1234567890',
            name: 'Example',
            url: 'https://example.slack.com/',
            domain: 'example',
            token: 'synthetic-workspace-token',
            user_id: 'U1234567890',
            enterprise_id: 'E1234567890',
            enterprise_api_token: 'synthetic-enterprise-token'
        }
    ]
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Slack session boundary', () => {
    it('requires the workspace, enterprise and account to agree', () => {
        const session = bundle();
        expect(isSlackSession(session)).toBe(true);
        session.teams[1].user_id = 'U9999999999';
        expect(isSlackSession(session)).toBe(false);
        session.teams[1].user_id = session.source.userId;
        session.teams[1].enterprise_api_token = 'different-enterprise-token';
        expect(isSlackSession(session)).toBe(false);
    });

    it('rejects foreign origins and hidden extra state', () => {
        const session = bundle();
        session.source.workspaceOrigin = 'https://example.slack.com.attacker.test';
        session.teams[1].url = `${session.source.workspaceOrigin}/`;
        expect(isSlackSession(session)).toBe(false);
        expect(isSlackSession({ ...bundle(), refreshToken: 'not-permitted' })).toBe(false);
    });

    it('rejects expired or duplicated authentication cookies', () => {
        const session = bundle();
        session.cookies[0].expirationDate = Date.now() / 1000 - 1;
        expect(isSlackSession(session)).toBe(false);
        delete session.cookies[0].expirationDate;
        session.cookies[1] = { ...session.cookies[0] };
        expect(isSlackSession(session)).toBe(false);
    });
});

const browserFixture = (existing = false) => {
    vi.stubGlobal('crypto', webcrypto);
    const appStorage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => appStorage.get(key) ?? null,
        setItem: (key: string, value: string) => {
            appStorage.set(key, value);
        },
        removeItem: (key: string) => {
            appStorage.delete(key);
        }
    });
    vi.stubGlobal('location', { origin: 'https://app.slack.com', href: SLACK_STAGING_URL });
    vi.stubGlobal('document', { contentType: 'text/plain' });
    const cookieJar = new Map<string, string>(existing ? [['d', 'existing-client-session']] : []);
    const openTabs = new Set<number>();
    const tabs = {
        query: vi.fn(async () => []),
        create: vi.fn(async () => {
            openTabs.add(7);
            return { id: 7, url: SLACK_STAGING_URL };
        }),
        get: vi.fn(async () => ({ id: 7, url: SLACK_STAGING_URL, status: 'complete' })),
        remove: vi.fn(async (id: number) => {
            openTabs.delete(id);
        }),
        update: vi.fn(),
        reload: vi.fn(),
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() }
    };
    const cookies = {
        getAll: vi.fn(async () =>
            [...cookieJar].map(([name, value]) => ({ name, value, domain: '.slack.com', path: '/' }))
        ),
        set: vi.fn(async (cookie: { name: string; value: string }) => {
            cookieJar.set(cookie.name, cookie.value);
            return cookie;
        }),
        remove: vi.fn(async ({ name }: { name: string }) => {
            cookieJar.delete(name);
            return {};
        })
    };
    const scripting = {
        executeScript: vi.fn(
            async ({
                func,
                args = []
            }: {
                func: (...args: unknown[]) => unknown;
                args?: unknown[];
            }): Promise<Array<{ result: unknown }>> => [{ result: await func(...args) }]
        )
    };
    const journal: Record<string, unknown> = {};
    const storage = {
        session: {
            get: vi.fn(async (key: string) => ({ [key]: journal[key] })),
            set: vi.fn(async (values: Record<string, unknown>) => {
                Object.assign(journal, values);
            }),
            remove: vi.fn(async (key: string) => {
                delete journal[key];
            })
        }
    };
    vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => true) }, tabs, cookies, scripting, storage });
    return { cookieJar, openTabs, cookies, tabs, scripting, storage };
};

const interruptAfterConfigWrite = async () => {
    const browser = browserFixture();
    let cancelled = false;
    const guard = () => {
        if (cancelled) throw new SlackError('cancelled');
    };
    const destination = await prepareSlackDestination(guard);
    browser.scripting.executeScript.mockImplementation(async ({ func, args = [] }) => {
        const result = await func(...args);
        cancelled = true;
        return [{ result }];
    });
    await expect(applySlackSession(destination, bundle(), guard)).rejects.toMatchObject({ code: 'cancelled' });
    return { browser, destination };
};

describe('Slack destination ownership', () => {
    it('does not overwrite an existing client session', async () => {
        const browser = browserFixture(true);
        await expect(prepareSlackDestination(() => {})).rejects.toMatchObject({ code: 'client_not_empty' });
        expect(browser.cookieJar.get('d')).toBe('existing-client-session');
        expect(browser.openTabs.size).toBe(0);
    });

    it('does not create a destination when cancelled during preflight', async () => {
        const browser = browserFixture();
        let cancelled = false;
        browser.cookies.getAll.mockImplementationOnce(async () => {
            cancelled = true;
            return [];
        });
        await expect(
            prepareSlackDestination(() => {
                if (cancelled) throw new SlackError('cancelled');
            })
        ).rejects.toMatchObject({ code: 'cancelled' });
        expect(browser.openTabs.size).toBe(0);
        expect(browser.cookieJar.size).toBe(0);
    });

    it('removes a cookie whose asynchronous write finishes after cancellation', async () => {
        const browser = browserFixture();
        let cancelled = false;
        const guard = () => {
            if (cancelled) throw new SlackError('cancelled');
        };
        const destination = await prepareSlackDestination(guard);
        let release: () => void = () => {
            throw new Error('write not started');
        };
        let began: () => void = () => {};
        const started = new Promise<void>((resolve) => {
            began = resolve;
        });
        browser.cookies.set.mockImplementationOnce(async (cookie) => {
            await new Promise<void>((resolve) => {
                release = resolve;
                began();
            });
            browser.cookieJar.set(cookie.name, cookie.value);
            return cookie;
        });
        const applying = applySlackSession(destination, bundle(), guard);
        await started;
        cancelled = true;
        release();
        await expect(applying).rejects.toMatchObject({ code: 'cancelled' });
        await destination.dispose();
        expect(browser.cookieJar.size).toBe(0);
        expect(browser.openTabs.size).toBe(0);
        expect(browser.tabs.update).not.toHaveBeenCalled();
    });

    it('preserves a replacement login when cancelling an interrupted install', async () => {
        const browser = browserFixture();
        let cancelled = false;
        const guard = () => {
            if (cancelled) throw new SlackError('cancelled');
        };
        const destination = await prepareSlackDestination(guard);
        browser.cookies.set.mockImplementationOnce(async (cookie) => {
            browser.cookieJar.set(cookie.name, cookie.value);
            cancelled = true;
            return cookie;
        });
        await expect(applySlackSession(destination, bundle(), guard)).rejects.toMatchObject({ code: 'cancelled' });
        browser.cookieJar.set('d', 'new-independent-login');
        await expect(destination.dispose()).rejects.toMatchObject({ code: 'cleanup_required' });
        expect(browser.cookieJar.get('d')).toBe('new-independent-login');
        expect(browser.openTabs.has(destination.tabId)).toBe(true);
    });

    it('removes only the owned app cache and cookies after cancellation', async () => {
        const { browser, destination } = await interruptAfterConfigWrite();
        await destination.dispose();
        expect(localStorage.getItem('localConfig_v2')).toBeNull();
        expect(localStorage.getItem('beam_slack_handoff')).toBeNull();
        expect(browser.cookieJar.size).toBe(0);
        expect(browser.openTabs.size).toBe(0);
    });

    it('preserves a newer app login even if its ownership marker and cookies are unchanged', async () => {
        const { browser, destination } = await interruptAfterConfigWrite();
        const config = JSON.parse(localStorage.getItem('localConfig_v2') || '{}');
        config.teams[bundle().source.workspaceId].token = 'new-independent-login';
        const newer = JSON.stringify(config);
        localStorage.setItem('localConfig_v2', newer);
        await expect(destination.dispose()).rejects.toMatchObject({ code: 'cleanup_required' });
        expect(localStorage.getItem('localConfig_v2')).toBe(newer);
        expect(browser.cookieJar.get('d')).toBe(bundle().cookies[0].value);
        expect(browser.openTabs.has(destination.tabId)).toBe(true);
    });

    it('cleans an interrupted install before accepting work after worker revival', async () => {
        const browser = browserFixture();
        let cancelled = false;
        const guard = () => {
            if (cancelled) throw new SlackError('cancelled');
        };
        const interrupted = await prepareSlackDestination(guard);
        browser.cookies.set.mockImplementationOnce(async (cookie) => {
            browser.cookieJar.set(cookie.name, cookie.value);
            cancelled = true;
            return cookie;
        });
        await expect(applySlackSession(interrupted, bundle(), guard)).rejects.toMatchObject({ code: 'cancelled' });
        vi.resetModules();
        const revived = await import('@/background/apps/slack');
        const destination = await revived.prepareSlackDestination(() => {});
        expect(browser.cookieJar.size).toBe(0);
        expect(browser.openTabs.has(destination.tabId)).toBe(true);
        await destination.dispose();
    });
});
