import {
    isSlackSession,
    isSlackSource,
    SLACK_ORIGIN,
    SLACK_PERMISSIONS,
    SLACK_STAGING_URL,
    SlackError,
    type SlackGuard,
    type SlackSession,
    type SlackSource,
    type SlackTeam,
    sameSlackSource
} from '@/shared/lib/slack';

const AUTH_COOKIE_NAMES = ['d', 'd-s', 'ui'];
const PENDING_KEY = 'slackPendingDestination';
interface DestinationOwnership {
    cookies: Record<string, string>;
    teams: Record<string, { userId: string; tokenHash: string }>;
}
interface PendingDestination {
    tabId: number;
    nonce: string;
    cookiesTouched: boolean;
    configTouched: boolean;
    ownership: DestinationOwnership | null;
}
let recovery: Promise<void> | null = null;

const fingerprint = async (nonce: string, value: string): Promise<string> => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${nonce}\0${value}`));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

// Serialized by executeScript; do not reference worker-scope helpers here.
const cleanOwnedConfig = async (
    nonce: string,
    expected: DestinationOwnership['teams'],
    remove: boolean
): Promise<boolean> => {
    if (location.origin !== 'https://app.slack.com') return false;
    const raw = localStorage.getItem('localConfig_v2');
    if (raw === null) {
        if (remove && localStorage.getItem('beam_slack_handoff') === nonce)
            localStorage.removeItem('beam_slack_handoff');
        return true;
    }
    if (localStorage.getItem('beam_slack_handoff') !== nonce) return false;
    try {
        const teams = JSON.parse(raw).teams as Record<string, SlackTeam>;
        if (!teams || Object.keys(teams).length !== Object.keys(expected).length) return false;
        for (const [id, identity] of Object.entries(expected)) {
            const team = teams[id];
            if (!team || team.id !== id || team.user_id !== identity.userId || typeof team.token !== 'string')
                return false;
            const bytes = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(`${nonce}\0${JSON.stringify([team.token, team.enterprise_api_token ?? null])}`)
            );
            const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
            if (hash !== identity.tokenHash) return false;
        }
        // Hashing yields: a later login must still win before any deletion.
        if (localStorage.getItem('localConfig_v2') !== raw || localStorage.getItem('beam_slack_handoff') !== nonce)
            return false;
        if (remove) {
            localStorage.removeItem('localConfig_v2');
            localStorage.removeItem('beam_slack_handoff');
        }
        return true;
    } catch {
        return false;
    }
};

const ownedCookies = async (
    pending: Pick<PendingDestination, 'nonce' | 'ownership'>
): Promise<chrome.cookies.Cookie[]> => {
    const cookies = (await chrome.cookies.getAll({ url: SLACK_ORIGIN })).filter(
        (cookie) => cookie.name === 'd' || cookie.name === 'd-s'
    );
    for (const cookie of cookies) {
        if (
            cookie.domain !== '.slack.com' ||
            cookie.path !== '/' ||
            cookie.partitionKey ||
            (await fingerprint(pending.nonce, cookie.value)) !== pending.ownership?.cookies[cookie.name]
        )
            throw new SlackError('cleanup_required');
    }
    return cookies;
};

const cleanupPending = async (pending: PendingDestination): Promise<void> => {
    let cleanupTabId: number | undefined;
    let current: chrome.tabs.Tab | undefined;
    try {
        if (
            (pending.cookiesTouched || pending.configTouched) &&
            (!pending.ownership || !(await chrome.permissions.contains(SLACK_PERMISSIONS)))
        )
            throw new SlackError('cleanup_required');
        try {
            current = await chrome.tabs.get(pending.tabId);
        } catch {
            /* Closed by the user. */
        }
        // Prove all ownership before touching either cookies or app storage.
        if (pending.cookiesTouched) await ownedCookies(pending);
        let configTabId: number | undefined;
        if (pending.configTouched || pending.cookiesTouched) {
            configTabId = current?.url?.startsWith(`${SLACK_ORIGIN}/`) ? pending.tabId : undefined;
            if (configTabId === undefined) {
                const tab = await chrome.tabs.create({ url: SLACK_STAGING_URL, active: false });
                cleanupTabId = tab.id;
                configTabId = tab.id;
                if (configTabId === undefined) throw new SlackError('cleanup_required');
                const until = Date.now() + 10000;
                let ready = false;
                while (Date.now() < until) {
                    const loaded = await chrome.tabs.get(configTabId);
                    if (loaded.url === SLACK_STAGING_URL && loaded.status === 'complete') {
                        ready = true;
                        break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                if (!ready) throw new SlackError('cleanup_required');
            }
        }
        const checkConfig = async (remove: boolean): Promise<void> => {
            if (configTabId === undefined || !pending.ownership) return;
            const results = await chrome.scripting.executeScript({
                target: { tabId: configTabId },
                func: cleanOwnedConfig,
                args: [pending.nonce, pending.configTouched ? pending.ownership.teams : {}, remove]
            });
            if (results[0]?.result !== true) throw new SlackError('cleanup_required');
        };
        await checkConfig(false);
        if (pending.cookiesTouched) {
            // Recheck immediately before each removal; never remove the unowned ui cookie.
            for (const name of Object.keys(pending.ownership?.cookies || {})) {
                if ((await ownedCookies(pending)).some((cookie) => cookie.name === name))
                    await chrome.cookies.remove({ url: SLACK_ORIGIN, name });
            }
        }
        await checkConfig(true);
        if (current?.url?.startsWith(`${SLACK_ORIGIN}/`)) {
            try {
                const latest = await chrome.tabs.get(pending.tabId);
                if (latest.url === current.url) await chrome.tabs.remove(pending.tabId);
            } catch {
                /* Already closed; do not close a tab navigated elsewhere. */
            }
        }
        await chrome.storage.session.remove(PENDING_KEY);
    } catch {
        recovery = null;
        throw new SlackError('cleanup_required');
    } finally {
        if (cleanupTabId !== undefined) {
            try {
                await chrome.tabs.remove(cleanupTabId);
            } catch {
                /* Already closed. */
            }
        }
    }
};

const recoverPending = (): Promise<void> => {
    if (recovery) return recovery;
    recovery = (async () => {
        const stored = await chrome.storage.session.get(PENDING_KEY);
        const pending = stored[PENDING_KEY] as PendingDestination | undefined;
        if (!pending) return;
        if (
            !Number.isSafeInteger(pending.tabId) ||
            typeof pending.nonce !== 'string' ||
            typeof pending.cookiesTouched !== 'boolean' ||
            typeof pending.configTouched !== 'boolean' ||
            (pending.cookiesTouched && !pending.ownership)
        )
            throw new SlackError('cleanup_required');
        await cleanupPending(pending);
    })().catch((error) => {
        recovery = null;
        throw error;
    });
    return recovery;
};

const requirePermission = async (guard: SlackGuard): Promise<void> => {
    guard();
    const granted = await chrome.permissions.contains(SLACK_PERMISSIONS);
    guard();
    if (!granted) throw new SlackError('permission_denied');
    await recoverPending();
    guard();
};

// Serialized by executeScript: keep all browser-page dependencies inside this function.
const inspectPage = async (operation: 'inspect' | 'capture', sourceTabId: number) => {
    const fail = (error: 'unsupported_scope' | 'auth_required' | 'scope_changed') => ({ ok: false as const, error });
    if (location.origin !== 'https://app.slack.com') return fail('scope_changed');
    const scopeId = location.pathname.match(/^\/client\/(E[A-Z0-9]{8,20})(?:\/|$)/)?.[1];
    if (!scopeId) return fail('unsupported_scope');
    let config: { teams?: Record<string, SlackTeam>; orderedTeamIds?: string[]; lastActiveTeamId?: string };
    try {
        config = JSON.parse(localStorage.getItem('localConfig_v2') || '{}');
    } catch {
        return fail('unsupported_scope');
    }
    const enterprise = config.teams?.[scopeId];
    if (!enterprise?.token) return fail('auth_required');
    const entries = Object.values(config.teams || {}) as SlackTeam[];
    const members = entries.filter((team) => team.id?.startsWith('T') && team.enterprise_id === scopeId);
    if (
        entries.length !== 2 ||
        members.length !== 1 ||
        config.orderedTeamIds?.length !== 1 ||
        config.orderedTeamIds[0] !== scopeId
    )
        return fail('unsupported_scope');
    const workspace = members[0];
    if (workspace.user_id !== enterprise.user_id || workspace.enterprise_api_token !== enterprise.token)
        return fail('unsupported_scope');
    if (
        !document.querySelector('.p-client_workspace, [data-qa="workspace_switcher"], [data-qa="team-menu"]') ||
        document.querySelector('input[type="password"], input[autocomplete="one-time-code"]')
    )
        return fail('auth_required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch('/api/auth.test', {
            method: 'POST',
            credentials: 'include',
            signal: controller.signal,
            body: new URLSearchParams({ token: workspace.token })
        });
        const identity = await response.json();
        if (identity.ok !== true) return fail('auth_required');
        if (identity.team_id !== workspace.id || identity.user_id !== workspace.user_id) return fail('scope_changed');
    } catch {
        return fail('auth_required');
    } finally {
        clearTimeout(timer);
    }
    if (
        location.pathname.match(/^\/client\/(E[A-Z0-9]{8,20})(?:\/|$)/)?.[1] !== scopeId ||
        JSON.parse(localStorage.getItem('localConfig_v2') || '{}').lastActiveTeamId !== scopeId
    )
        return fail('scope_changed');
    const source: SlackSource = {
        sourceTabId,
        scopeId,
        workspaceId: workspace.id,
        userId: workspace.user_id,
        enterpriseOrigin: new URL(enterprise.url).origin,
        workspaceOrigin: new URL(workspace.url).origin,
        workspaceName: workspace.name
    };
    if (operation === 'inspect') return { ok: true as const, source };
    const fields = [
        'id',
        'name',
        'url',
        'domain',
        'token',
        'user_id',
        'user_locale',
        'is_unified_user_client_enabled',
        'enterprise_api_token',
        'enterprise_id',
        'enterprise_name'
    ] as const;
    const teams = [enterprise, workspace].map((team) =>
        Object.fromEntries(fields.filter((key) => Object.hasOwn(team, key)).map((key) => [key, team[key]]))
    );
    return { ok: true as const, source, teams };
};

const readSource = async (tabId: number, operation: 'inspect' | 'capture', guard: SlackGuard) => {
    guard();
    const tab = await chrome.tabs.get(tabId);
    guard();
    if (tab.incognito || !tab.url?.startsWith(`${SLACK_ORIGIN}/client/`)) throw new SlackError('scope_changed');
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: inspectPage,
        args: [operation, tabId]
    });
    guard();
    const result = results[0]?.result;
    if (!result) throw new SlackError('failed');
    if (!result.ok) throw new SlackError(result.error);
    if (!isSlackSource(result.source)) throw new SlackError('unsupported_scope');
    return result;
};

export const listSlackSources = async (guard: SlackGuard): Promise<SlackSource[]> => {
    await requirePermission(guard);
    const tabs = await chrome.tabs.query({ url: `${SLACK_ORIGIN}/client/*` });
    const sources: SlackSource[] = [];
    let failure: SlackError | null = null;
    for (const tab of tabs) {
        guard();
        if (tab.id === undefined || tab.incognito) continue;
        try {
            sources.push((await readSource(tab.id, 'inspect', guard)).source);
        } catch (error) {
            guard();
            failure = error instanceof SlackError ? error : new SlackError('failed');
        }
    }
    guard();
    if (sources.length === 0 && failure) throw failure;
    return sources;
};

export const verifySlackHost = async (source: SlackSource, guard: SlackGuard): Promise<void> => {
    if (!isSlackSource(source)) throw new SlackError('invalid_payload');
    await requirePermission(guard);
    const actual = (await readSource(source.sourceTabId, 'inspect', guard)).source;
    if (!sameSlackSource(source, actual)) throw new SlackError('scope_changed');
};

export const captureSlackSession = async (source: SlackSource, guard: SlackGuard): Promise<SlackSession> => {
    if (!isSlackSource(source)) throw new SlackError('invalid_payload');
    await requirePermission(guard);
    const result = await readSource(source.sourceTabId, 'capture', guard);
    if (!sameSlackSource(source, result.source) || !('teams' in result)) throw new SlackError('scope_changed');
    const cookies = await chrome.cookies.getAll({ url: SLACK_ORIGIN });
    guard();
    const session = {
        source,
        teams: result.teams,
        cookies: cookies
            .filter(
                (cookie) =>
                    (cookie.name === 'd' || cookie.name === 'd-s') &&
                    cookie.domain === '.slack.com' &&
                    cookie.path === '/' &&
                    cookie.httpOnly &&
                    cookie.secure &&
                    !cookie.partitionKey
            )
            .map((cookie) => ({
                name: cookie.name,
                value: cookie.value,
                ...(!cookie.session ? { expirationDate: cookie.expirationDate } : {})
            }))
    };
    if (!isSlackSession(session)) throw new SlackError('unsupported_scope');
    await verifySlackHost(source, guard);
    return session;
};

export interface SlackDestination {
    tabId: number;
    dispose(): Promise<void>;
    finish(): Promise<void>;
}

interface DestinationState {
    guard: SlackGuard;
    nonce: string;
    failure: SlackError | null;
    targetUrl: string | null;
    reachedTarget: boolean;
    cookiesTouched: boolean;
    configTouched: boolean;
    ownership: DestinationOwnership | null;
    done: boolean;
    removeListeners(): void;
}
const destinations = new WeakMap<SlackDestination, DestinationState>();

const checkDestination = async (destination: SlackDestination): Promise<chrome.tabs.Tab> => {
    const state = destinations.get(destination);
    if (!state || state.done) throw new SlackError('cancelled');
    state.guard();
    if (state.failure) throw state.failure;
    const tab = await chrome.tabs.get(destination.tabId);
    state.guard();
    if (state.failure) throw state.failure;
    const target = state.targetUrl;
    const isTarget = target !== null && (tab.url === target || tab.url?.startsWith(`${target}/`));
    const isStaging = !state.reachedTarget && tab.url === SLACK_STAGING_URL;
    const isPendingStaging =
        !state.reachedTarget && tab.pendingUrl === SLACK_STAGING_URL && (!tab.url || tab.url === 'about:blank');
    if (!isStaging && !isTarget && !isPendingStaging) throw new SlackError('scope_changed');
    if (isTarget) state.reachedTarget = true;
    return tab;
};

const waitForDocument = async (
    destination: SlackDestination,
    ready: () => boolean,
    previousDocumentId?: string
): Promise<void> => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
        const tab = await checkDestination(destination);
        if (tab.status === 'complete' && ready()) {
            if (!previousDocumentId) return;
            const documents = await chrome.scripting.executeScript({
                target: { tabId: destination.tabId },
                func: () => true
            });
            await checkDestination(destination);
            if (documents[0]?.documentId && documents[0].documentId !== previousDocumentId) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new SlackError('expired');
};

const assertEmptyClient = async (guard: SlackGuard, exceptTabId?: number): Promise<void> => {
    guard();
    const cookies = await chrome.cookies.getAll({ url: SLACK_ORIGIN });
    const tabs = await chrome.tabs.query({ url: `${SLACK_ORIGIN}/client/*` });
    guard();
    if (cookies.some((cookie) => AUTH_COOKIE_NAMES.includes(cookie.name)) || tabs.some((tab) => tab.id !== exceptTabId))
        throw new SlackError('client_not_empty');
};

export const prepareSlackDestination = async (guard: SlackGuard): Promise<SlackDestination> => {
    await requirePermission(guard);
    await assertEmptyClient(guard);
    guard();
    const tab = await chrome.tabs.create({ url: SLACK_STAGING_URL, active: false });
    if (tab.id === undefined) throw new SlackError('failed');
    const tabId = tab.id;
    const state: DestinationState = {
        guard,
        nonce: crypto.randomUUID(),
        failure: null,
        targetUrl: null,
        reachedTarget: false,
        cookiesTouched: false,
        configTouched: false,
        ownership: null,
        done: false,
        removeListeners: () => {}
    };
    let disposing: Promise<void> | null = null;
    const destination: SlackDestination = {
        tabId,
        dispose: () => {
            if (disposing) return disposing;
            if (state.done) return Promise.resolve();
            state.done = true;
            state.removeListeners();
            disposing = cleanupPending({
                tabId,
                nonce: state.nonce,
                cookiesTouched: state.cookiesTouched,
                configTouched: state.configTouched,
                ownership: state.ownership
            });
            return disposing;
        },
        finish: async () => {
            state.guard();
            if (state.failure || state.done) throw state.failure || new SlackError('cancelled');
            await chrome.storage.session.remove(PENDING_KEY);
            state.guard();
            if (state.failure) throw state.failure;
            state.done = true;
            state.removeListeners();
        }
    };
    const onUpdated = (changedId: number, change: chrome.tabs.OnUpdatedInfo): void => {
        if (changedId !== tabId || !change.url || state.done) return;
        const target = state.targetUrl;
        if (target && (change.url === target || change.url.startsWith(`${target}/`))) {
            state.reachedTarget = true;
            return;
        }
        if (!state.reachedTarget && change.url === SLACK_STAGING_URL) return;
        state.failure = new SlackError(
            /sign.?in|login|sso|mfa|device/i.test(change.url) ? 'auth_required' : 'scope_changed'
        );
    };
    const onRemoved = (removedId: number): void => {
        if (removedId === tabId) state.failure = new SlackError('scope_changed');
    };
    state.removeListeners = () => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    destinations.set(destination, state);
    try {
        guard();
        await waitForDocument(destination, () => true);
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({
                inert:
                    location.href === 'https://app.slack.com/robots.txt' &&
                    document.contentType.startsWith('text/plain'),
                empty: localStorage.getItem('localConfig_v2') === null
            })
        });
        guard();
        if (!results[0]?.result?.inert) throw new SlackError('scope_changed');
        if (!results[0].result.empty) throw new SlackError('client_not_empty');
        return destination;
    } catch (error) {
        await destination.dispose();
        throw error;
    }
};

const verifyClient = async (destination: SlackDestination, source: SlackSource): Promise<void> => {
    await checkDestination(destination);
    const state = destinations.get(destination);
    if (!state) throw new SlackError('cancelled');
    const result = await readSource(destination.tabId, 'inspect', state.guard);
    await checkDestination(destination);
    if (!sameSlackSource(source, { ...result.source, sourceTabId: source.sourceTabId }))
        throw new SlackError('scope_changed');
};

const waitForClient = async (destination: SlackDestination, source: SlackSource): Promise<void> => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
        await checkDestination(destination);
        const results = await chrome.scripting.executeScript({
            target: { tabId: destination.tabId },
            func: () => ({
                shell: !!document.querySelector(
                    '.p-client_workspace, [data-qa="workspace_switcher"], [data-qa="team-menu"]'
                ),
                challenge: !!document.querySelector(
                    'input[type="password"], input[autocomplete="one-time-code"], [data-qa="signin_form"], [data-qa="sign_in_button"]'
                )
            })
        });
        await checkDestination(destination);
        if (results[0]?.result?.challenge) throw new SlackError('auth_required');
        if (results[0]?.result?.shell) {
            await verifyClient(destination, source);
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new SlackError('auth_required');
};

export const applySlackSession = async (
    destination: SlackDestination,
    session: SlackSession,
    guard: SlackGuard
): Promise<void> => {
    if (!isSlackSession(session)) throw new SlackError('invalid_payload');
    await requirePermission(guard);
    const state = destinations.get(destination);
    if (!state) throw new SlackError('cancelled');
    await checkDestination(destination);
    await assertEmptyClient(guard, destination.tabId);
    state.ownership = {
        cookies: Object.fromEntries(
            await Promise.all(
                session.cookies.map(async (cookie) => [cookie.name, await fingerprint(state.nonce, cookie.value)])
            )
        ),
        teams: Object.fromEntries(
            await Promise.all(
                session.teams.map(async (team) => [
                    team.id,
                    {
                        userId: team.user_id,
                        tokenHash: await fingerprint(
                            state.nonce,
                            JSON.stringify([team.token, team.enterprise_api_token ?? null])
                        )
                    }
                ])
            )
        )
    };
    await checkDestination(destination);
    state.cookiesTouched = true;
    await chrome.storage.session.set({
        [PENDING_KEY]: {
            tabId: destination.tabId,
            nonce: state.nonce,
            cookiesTouched: true,
            configTouched: false,
            ownership: state.ownership
        }
    });
    guard();
    for (const cookie of session.cookies) {
        await checkDestination(destination);
        await ownedCookies(state);
        await checkDestination(destination);
        const installed = await chrome.cookies.set({
            url: SLACK_ORIGIN,
            domain: '.slack.com',
            path: '/',
            name: cookie.name,
            value: cookie.value,
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            ...(cookie.expirationDate !== undefined ? { expirationDate: cookie.expirationDate } : {})
        });
        guard();
        if (!installed) throw new SlackError('permission_denied');
    }
    const config = {
        teams: Object.fromEntries(session.teams.map((team) => [team.id, team])),
        prevTeams: {},
        orderedTeamIds: [session.source.scopeId],
        pendingAuthTeams: {},
        lastActiveTeamId: session.source.scopeId,
        canAccessClientV2: true
    };
    await checkDestination(destination);
    state.configTouched = true;
    await chrome.storage.session.set({
        [PENDING_KEY]: {
            tabId: destination.tabId,
            nonce: state.nonce,
            cookiesTouched: true,
            configTouched: true,
            ownership: state.ownership
        }
    });
    guard();
    const results = await chrome.scripting.executeScript({
        target: { tabId: destination.tabId },
        func: (serialized, nonce) => {
            if (location.href !== 'https://app.slack.com/robots.txt' || localStorage.getItem('localConfig_v2') !== null)
                return false;
            localStorage.setItem('beam_slack_handoff', nonce);
            localStorage.setItem('localConfig_v2', serialized);
            return true;
        },
        args: [JSON.stringify(config), state.nonce]
    });
    guard();
    if (results[0]?.result !== true) throw new SlackError('client_not_empty');
    state.targetUrl = `${SLACK_ORIGIN}/client/${session.source.scopeId}`;
    await checkDestination(destination);
    await chrome.tabs.update(destination.tabId, { url: state.targetUrl });
    await waitForDocument(destination, () => state.reachedTarget);
    await waitForClient(destination, session.source);
    await checkDestination(destination);
    const previous = await chrome.scripting.executeScript({ target: { tabId: destination.tabId }, func: () => true });
    await checkDestination(destination);
    const previousDocumentId = previous[0]?.documentId;
    if (!previousDocumentId) throw new SlackError('failed');
    await chrome.tabs.reload(destination.tabId);
    await waitForDocument(destination, () => state.reachedTarget, previousDocumentId);
    await waitForClient(destination, session.source);
    await checkDestination(destination);
};
