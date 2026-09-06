export const SLACK_ORIGIN = 'https://app.slack.com';
export const SLACK_STAGING_URL = `${SLACK_ORIGIN}/robots.txt`;
export const SLACK_PERMISSIONS: chrome.permissions.Permissions = {
    permissions: ['cookies', 'scripting'],
    origins: ['https://slack.com/*', 'https://app.slack.com/*']
};
export const SLACK_SHARING_APPROVED = 'slackSharedSessionApproved';
export const SLACK_MAX_BYTES = 64 * 1024;

export interface SlackSource {
    sourceTabId: number;
    scopeId: string;
    workspaceId: string;
    userId: string;
    enterpriseOrigin: string;
    workspaceOrigin: string;
    workspaceName: string;
}

export interface SlackTeam {
    id: string;
    name: string;
    url: string;
    domain: string;
    token: string;
    user_id: string;
    user_locale?: string;
    is_unified_user_client_enabled?: boolean;
    enterprise_api_token?: string;
    enterprise_id?: string;
    enterprise_name?: string;
}

export interface SlackCookie {
    name: 'd' | 'd-s';
    value: string;
    expirationDate?: number;
}

export interface SlackSession {
    source: SlackSource;
    cookies: SlackCookie[];
    teams: SlackTeam[];
}

export type SlackFailure =
    | 'permission_denied'
    | 'sharing_not_approved'
    | 'no_source'
    | 'unsupported_scope'
    | 'auth_required'
    | 'client_not_empty'
    | 'scope_changed'
    | 'invalid_payload'
    | 'cancelled'
    | 'expired'
    | 'disconnected'
    | 'busy'
    | 'cleanup_required'
    | 'failed';

export const SLACK_FAILURES: readonly SlackFailure[] = [
    'permission_denied',
    'sharing_not_approved',
    'no_source',
    'unsupported_scope',
    'auth_required',
    'client_not_empty',
    'scope_changed',
    'invalid_payload',
    'cancelled',
    'expired',
    'disconnected',
    'busy',
    'cleanup_required',
    'failed'
];

export class SlackError extends Error {
    constructor(readonly code: SlackFailure) {
        super(code);
        this.name = 'SlackError';
    }
}

export const slackFailure = (error: unknown): SlackFailure => (error instanceof SlackError ? error.code : 'failed');
export type SlackGuard = () => void;

const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 256): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= max;
const id = (value: unknown, prefix: string): value is string =>
    typeof value === 'string' && /^[A-Z][A-Z0-9]{8,20}$/.test(value) && prefix.includes(value[0]);
const only = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
    Object.keys(value).every((key) => keys.includes(key));
const slackOrigin = (value: unknown, enterprise: boolean): value is string => {
    if (!text(value)) return false;
    try {
        const url = new URL(value);
        return (
            url.origin === value &&
            url.protocol === 'https:' &&
            !url.port &&
            (enterprise
                ? /^[a-z0-9-]+\.enterprise\.slack\.com$/.test(url.hostname)
                : /^[a-z0-9-]+\.slack\.com$/.test(url.hostname))
        );
    } catch {
        return false;
    }
};

export const isSlackSource = (value: unknown): value is SlackSource =>
    record(value) &&
    only(value, [
        'sourceTabId',
        'scopeId',
        'workspaceId',
        'userId',
        'enterpriseOrigin',
        'workspaceOrigin',
        'workspaceName'
    ]) &&
    Number.isSafeInteger(value.sourceTabId) &&
    (value.sourceTabId as number) >= 0 &&
    id(value.scopeId, 'E') &&
    id(value.workspaceId, 'T') &&
    id(value.userId, 'UW') &&
    slackOrigin(value.enterpriseOrigin, true) &&
    slackOrigin(value.workspaceOrigin, false) &&
    text(value.workspaceName);

export const sameSlackSource = (a: SlackSource, b: SlackSource): boolean =>
    a.sourceTabId === b.sourceTabId &&
    a.scopeId === b.scopeId &&
    a.workspaceId === b.workspaceId &&
    a.userId === b.userId &&
    a.enterpriseOrigin === b.enterpriseOrigin &&
    a.workspaceOrigin === b.workspaceOrigin;

const isSlackTeam = (value: unknown): value is SlackTeam => {
    if (
        !record(value) ||
        !only(value, [
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
        ])
    )
        return false;
    if (
        !id(value.id, 'ET') ||
        !text(value.name) ||
        !text(value.url) ||
        !text(value.domain) ||
        !text(value.token, 24000) ||
        !id(value.user_id, 'UW')
    )
        return false;
    if (!/^[a-z0-9][a-z0-9.-]{0,127}$/.test(value.domain)) return false;
    if (value.user_locale !== undefined && !text(value.user_locale, 32)) return false;
    if (value.is_unified_user_client_enabled !== undefined && typeof value.is_unified_user_client_enabled !== 'boolean')
        return false;
    if (value.enterprise_api_token !== undefined && !text(value.enterprise_api_token, 24000)) return false;
    if (value.enterprise_id !== undefined && !id(value.enterprise_id, 'E')) return false;
    return value.enterprise_name === undefined || text(value.enterprise_name);
};

export const isSlackSession = (value: unknown): value is SlackSession => {
    if (!record(value) || !only(value, ['source', 'cookies', 'teams']) || !isSlackSource(value.source)) return false;
    const source = value.source;
    if (
        !Array.isArray(value.cookies) ||
        value.cookies.length < 1 ||
        value.cookies.length > 2 ||
        !Array.isArray(value.teams) ||
        value.teams.length !== 2
    )
        return false;
    const names = new Set<string>();
    for (const cookie of value.cookies) {
        if (
            !record(cookie) ||
            !only(cookie, ['name', 'value', 'expirationDate']) ||
            (cookie.name !== 'd' && cookie.name !== 'd-s') ||
            names.has(cookie.name) ||
            !text(cookie.value, 16000)
        )
            return false;
        if (
            cookie.expirationDate !== undefined &&
            (typeof cookie.expirationDate !== 'number' ||
                !Number.isFinite(cookie.expirationDate) ||
                cookie.expirationDate <= Date.now() / 1000)
        )
            return false;
        names.add(cookie.name);
    }
    if (!names.has('d') || !value.teams.every(isSlackTeam)) return false;
    const enterprise = value.teams.find((team) => team.id === source.scopeId);
    const workspace = value.teams.find((team) => team.id === source.workspaceId);
    if (
        !enterprise ||
        !workspace ||
        enterprise.user_id !== value.source.userId ||
        workspace.user_id !== value.source.userId ||
        workspace.enterprise_id !== enterprise.id ||
        workspace.enterprise_api_token !== enterprise.token
    )
        return false;
    try {
        if (
            new URL(enterprise.url).origin !== value.source.enterpriseOrigin ||
            new URL(workspace.url).origin !== value.source.workspaceOrigin
        )
            return false;
        for (const team of value.teams) {
            const url = new URL(team.url);
            if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return false;
        }
    } catch {
        return false;
    }
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= SLACK_MAX_BYTES;
};
