import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applySlackSession,
    captureSlackSession,
    listSlackSources,
    prepareSlackDestination,
    verifySlackHost
} from '@/background/apps/slack';
import {
    isSlackSession,
    isSlackSource,
    SLACK_ORIGIN,
    SLACK_STAGING_URL,
    SlackError,
    type SlackSession,
    type SlackSource,
    sameSlackSource
} from '@/shared/lib/slack';

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

    it('rejects enterprise and workspace origins that are not parseable URLs', () => {
        const source = bundle().source;
        expect(isSlackSource({ ...source, enterpriseOrigin: 'https://[' })).toBe(false);
        expect(isSlackSource({ ...source, workspaceOrigin: 'https://[' })).toBe(false);
    });

    it('treats sources as the same only when the host tab also matches', () => {
        const source = bundle().source;
        expect(sameSlackSource(source, { ...source })).toBe(true);
        expect(sameSlackSource(source, { ...source, sourceTabId: source.sourceTabId + 1 })).toBe(false);
    });

    it('rejects teams with extra keys, missing identity, or a non-boolean unified-client flag', () => {
        const extra = bundle();
        Object.assign(extra.teams[0], { extra: 'nope' });
        expect(isSlackSession(extra)).toBe(false);
        const missing = bundle();
        delete (missing.teams[0] as { name?: string }).name;
        expect(isSlackSession(missing)).toBe(false);
        const emptyName = bundle();
        emptyName.teams[0].name = '';
        expect(isSlackSession(emptyName)).toBe(false);
        const emptyToken = bundle();
        emptyToken.teams[0].token = '';
        expect(isSlackSession(emptyToken)).toBe(false);
        const flag = bundle();
        Object.assign(flag.teams[0], { is_unified_user_client_enabled: 'yes' });
        expect(isSlackSession(flag)).toBe(false);
    });

    it('rejects team URLs that do not match the declared origins or cannot be parsed', () => {
        const mismatched = bundle();
        mismatched.teams[1].url = 'https://other.slack.com/';
        expect(isSlackSession(mismatched)).toBe(false);
        const unparseable = bundle();
        unparseable.teams[0].url = 'not a url';
        expect(isSlackSession(unparseable)).toBe(false);
    });
});

type TabStub = {
    id?: number;
    url?: string;
    status?: string;
    incognito?: boolean;
};

type CookieStub = {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    session?: boolean;
};

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
        query: vi.fn(async (): Promise<TabStub[]> => []),
        create: vi.fn(async (): Promise<TabStub> => {
            openTabs.add(7);
            return { id: 7, url: SLACK_STAGING_URL };
        }),
        get: vi.fn(
            async (_id: number): Promise<TabStub> => ({
                id: 7,
                url: SLACK_STAGING_URL,
                status: 'complete'
            })
        ),
        remove: vi.fn(async (id: number) => {
            openTabs.delete(id);
        }),
        update: vi.fn(),
        reload: vi.fn(),
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() }
    };
    const cookies = {
        getAll: vi.fn(
            async (): Promise<CookieStub[]> =>
                [...cookieJar].map(([name, value]) => ({ name, value, domain: '.slack.com', path: '/' }))
        ),
        set: vi.fn(async (cookie: { name: string; value: string }): Promise<CookieStub | undefined> => {
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
    const permissions = { contains: vi.fn(async () => true) };
    vi.stubGlobal('chrome', { permissions, tabs, cookies, scripting, storage });
    return { cookieJar, openTabs, cookies, tabs, scripting, storage, permissions };
};

const hostTab = (source: SlackSource = bundle().source) => ({
    id: source.sourceTabId,
    url: `${SLACK_ORIGIN}/client/${source.scopeId}`,
    incognito: false
});

const installHostPage = (session: SlackSession = bundle()) => {
    vi.stubGlobal('location', {
        origin: SLACK_ORIGIN,
        href: `${SLACK_ORIGIN}/client/${session.source.scopeId}`,
        pathname: `/client/${session.source.scopeId}`
    });
    vi.stubGlobal('document', {
        contentType: 'text/html',
        querySelector: (selector: string) => {
            if (selector.includes('password') || selector.includes('one-time-code') || selector.includes('signin')) {
                return null;
            }
            return selector.includes('p-client_workspace') ||
                selector.includes('workspace_switcher') ||
                selector.includes('team-menu')
                ? {}
                : null;
        }
    });
    localStorage.setItem(
        'localConfig_v2',
        JSON.stringify({
            teams: Object.fromEntries(session.teams.map((team) => [team.id, team])),
            orderedTeamIds: [session.source.scopeId],
            lastActiveTeamId: session.source.scopeId
        })
    );
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            json: async () => ({ ok: true, team_id: session.source.workspaceId, user_id: session.source.userId })
        }))
    );
};

const authCookies = (session: SlackSession = bundle()) =>
    session.cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: '.slack.com',
        path: '/',
        httpOnly: true,
        secure: true,
        session: true
    }));

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

describe('Slack source listing and capture', () => {
    it('returns no sources when no Slack client tabs are open', async () => {
        browserFixture();
        await expect(listSlackSources(() => {})).resolves.toEqual([]);
    });

    it('refuses to inspect Slack when the permission is missing', async () => {
        const browser = browserFixture();
        browser.permissions.contains.mockResolvedValue(false);
        await expect(listSlackSources(() => {})).rejects.toMatchObject({ code: 'permission_denied' });
        await expect(verifySlackHost(bundle().source, () => {})).rejects.toMatchObject({
            code: 'permission_denied'
        });
        await expect(captureSlackSession(bundle().source, () => {})).rejects.toMatchObject({
            code: 'permission_denied'
        });
    });

    it('lists a signed-in Slack client tab and skips tabs that cannot be inspected', async () => {
        const browser = browserFixture();
        const session = bundle();
        installHostPage(session);
        const tab = hostTab(session.source);
        browser.tabs.query.mockResolvedValue([
            { url: tab.url },
            { id: 9, url: tab.url, incognito: true },
            tab,
            { id: 8, url: tab.url, incognito: false }
        ]);
        browser.tabs.get.mockImplementation(async (id: number) => ({ ...tab, id }));
        browser.scripting.executeScript.mockImplementation(async ({ args = [] }) => {
            if (args[1] === tab.id) return [{ result: { ok: true, source: session.source } }];
            if (args[1] === 8) return [{ result: null }];
            return [{ result: { ok: true, source: { sourceTabId: args[1] } } }];
        });
        await expect(listSlackSources(() => {})).resolves.toEqual([session.source]);
    });

    it('surfaces auth_required when every Slack tab fails inspection', async () => {
        const browser = browserFixture();
        const tab = hostTab();
        browser.tabs.query.mockResolvedValue([tab]);
        browser.tabs.get.mockResolvedValue(tab);
        browser.scripting.executeScript.mockResolvedValue([{ result: { ok: false, error: 'auth_required' } }]);
        await expect(listSlackSources(() => {})).rejects.toMatchObject({ code: 'auth_required' });
    });

    it('reads a live grid client as a source without mocking the inspect script', async () => {
        const browser = browserFixture();
        const session = bundle();
        installHostPage(session);
        const tab = hostTab(session.source);
        browser.tabs.query.mockResolvedValue([tab]);
        browser.tabs.get.mockResolvedValue(tab);
        await expect(listSlackSources(() => {})).resolves.toEqual([session.source]);
        await expect(verifySlackHost(session.source, () => {})).resolves.toBeUndefined();
    });

    it('rejects a host whose workspace or user no longer matches the source', async () => {
        const browser = browserFixture();
        const session = bundle();
        installHostPage(session);
        browser.tabs.get.mockResolvedValue(hostTab(session.source));
        await expect(
            verifySlackHost({ ...session.source, workspaceId: 'T9999999999', userId: 'U9999999999' }, () => {})
        ).rejects.toMatchObject({ code: 'scope_changed' });
    });

    it('rejects a missing or non-Slack source tab', async () => {
        const browser = browserFixture();
        browser.tabs.get.mockRejectedValue(new Error('No tab with id'));
        await expect(verifySlackHost(bundle().source, () => {})).rejects.toThrow('No tab with id');
        browser.tabs.get.mockResolvedValue({ id: 4, url: 'https://example.com', incognito: false });
        await expect(verifySlackHost(bundle().source, () => {})).rejects.toMatchObject({ code: 'scope_changed' });
        await expect(verifySlackHost({} as SlackSource, () => {})).rejects.toMatchObject({
            code: 'invalid_payload'
        });
    });

    it('captures cookies and teams from a signed-in Slack tab', async () => {
        const browser = browserFixture();
        const session = bundle();
        installHostPage(session);
        browser.tabs.get.mockResolvedValue(hostTab(session.source));
        browser.cookies.getAll.mockResolvedValue(authCookies(session));
        await expect(captureSlackSession(session.source, () => {})).resolves.toEqual({
            source: session.source,
            teams: session.teams,
            cookies: session.cookies
        });
    });

    it('does not capture a session when Slack still requires authentication', async () => {
        const browser = browserFixture();
        const session = bundle();
        installHostPage(session);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ json: async () => ({ ok: false }) }))
        );
        browser.tabs.get.mockResolvedValue(hostTab(session.source));
        await expect(captureSlackSession(session.source, () => {})).rejects.toMatchObject({
            code: 'auth_required'
        });
    });

    it('rejects a capture whose cookies are not a Slack session', async () => {
        const browser = browserFixture();
        const session = bundle();
        installHostPage(session);
        browser.tabs.get.mockResolvedValue(hostTab(session.source));
        browser.cookies.getAll.mockResolvedValue([
            {
                name: 'd',
                value: 'synthetic-cookie',
                domain: 'evil.example',
                path: '/',
                httpOnly: true,
                secure: true,
                session: true
            }
        ]);
        await expect(captureSlackSession(session.source, () => {})).rejects.toMatchObject({
            code: 'unsupported_scope'
        });
    });
});

describe('Slack destination failure recovery', () => {
    it('aborts install when Slack refuses the cookie write', async () => {
        const browser = browserFixture();
        const destination = await prepareSlackDestination(() => {});
        browser.cookies.set.mockResolvedValue(undefined);
        await expect(applySlackSession(destination, bundle(), () => {})).rejects.toMatchObject({
            code: 'permission_denied'
        });
        await destination.dispose();
        expect(browser.openTabs.size).toBe(0);
    });

    it('aborts install when the destination tab is closed after prepare', async () => {
        const browser = browserFixture();
        const destination = await prepareSlackDestination(() => {});
        const onRemoved = browser.tabs.onRemoved.addListener.mock.calls[0][0] as (id: number) => void;
        onRemoved(destination.tabId);
        await expect(applySlackSession(destination, bundle(), () => {})).rejects.toMatchObject({
            code: 'scope_changed'
        });
        await destination.dispose();
    });

    it('refuses new work when a crashed destination journal cannot be cleaned', async () => {
        const browser = browserFixture();
        await browser.storage.session.set({
            slackPendingDestination: {
                tabId: 3,
                nonce: 'dead-nonce',
                cookiesTouched: true,
                configTouched: false,
                ownership: null
            }
        });
        vi.resetModules();
        const slack = await import('@/background/apps/slack');
        await expect(slack.prepareSlackDestination(() => {})).rejects.toMatchObject({
            code: 'cleanup_required'
        });
        expect(browser.openTabs.size).toBe(0);
    });
});
