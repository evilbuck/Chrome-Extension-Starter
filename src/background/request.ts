// Phase 4/7 request state machine.
//
// One active request at a time. The state progression follows the plan:
//
//   idle → checking_host → preparing_host → completing_client → verifying → succeeded
//
// With `waiting_for_user` as an orthogonal pause and a small set of terminal
// non-success outcomes. Cancellation, duplicate, expiry, navigation/scope
// change, and disconnect invalidate later results and cause no application
// action. Success is `state === succeeded` (no success outcome).
//
// Cancellation marks the guard invalid immediately. Dispose waits for the
// in-flight provider promise, then runs in catch/finally so cookie writes
// cannot complete after cleanup. The request stays busy until cleanup ends.

import {
    ERROR_KIND,
    type ErrorKind,
    REQUEST_DEADLINE_MS,
    REQUEST_OUTCOME,
    REQUEST_STATE,
    type RequestOutcome,
    type RequestState
} from '@/shared/constants';
import { logger } from '@/shared/lib/logger';
import {
    isSlackSource,
    SlackError,
    type SlackFailure,
    type SlackGuard,
    type SlackSource,
    slackFailure
} from '@/shared/lib/slack';

export interface RequestDestination {
    tabId: number;
    dispose(): Promise<void>;
    finish(): void | Promise<void>;
}

interface ActiveRequest {
    requestId: string;
    applicationKey: string;
    source: SlackSource | null;
    deadlineAt: number;
    deadlineTimer: ReturnType<typeof setTimeout> | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    outcomeReason: string | null;
    startedAt: number;
    waitingSince: number | null;
    destination: RequestDestination | null;
    destinationTabId: number | null;
    cancelled: boolean;
    invalidFailure: SlackFailure | null;
    pendingOutcome: RequestOutcome | null;
    pipeline: Promise<void> | null;
    disposing: boolean;
}

let active: ActiveRequest | null = null;
const listeners = new Set<() => void>();

const broadcast = (): void => {
    for (const fn of listeners) fn();
};

const clearTimers = (req: ActiveRequest): void => {
    if (req.deadlineTimer) {
        clearTimeout(req.deadlineTimer);
        req.deadlineTimer = null;
    }
};

const requestIsTerminal = (req: ActiveRequest | null): boolean =>
    req !== null &&
    (req.state === REQUEST_STATE.SUCCEEDED || (req.state === REQUEST_STATE.IDLE && req.outcome !== null));

const finalizeWith = (
    req: ActiveRequest,
    outcome: RequestOutcome | null,
    reason: string | null,
    state: RequestState
): void => {
    clearTimers(req);
    req.state = state;
    req.outcome = outcome;
    req.outcomeReason = reason;
    req.pipeline = null;
    req.disposing = false;
};

const buildActive = (params: {
    requestId: string;
    applicationKey: string;
    source: SlackSource | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    outcomeReason: string | null;
}): ActiveRequest => ({
    requestId: params.requestId,
    applicationKey: params.applicationKey,
    source: params.source,
    deadlineAt: Date.now() + REQUEST_DEADLINE_MS,
    deadlineTimer: null,
    state: params.state,
    outcome: params.outcome,
    outcomeReason: params.outcomeReason,
    startedAt: Date.now(),
    waitingSince: null,
    destination: null,
    destinationTabId: null,
    cancelled: false,
    invalidFailure: null,
    pendingOutcome: null,
    pipeline: null,
    disposing: false
});

const armDeadline = (req: ActiveRequest): void => {
    req.deadlineTimer = setTimeout(() => {
        invalidateRequest('expired');
    }, REQUEST_DEADLINE_MS);
};

const failureFromInvalid = (req: ActiveRequest): SlackFailure => {
    if (req.invalidFailure) return req.invalidFailure;
    if (req.cancelled) return 'cancelled';
    if (Date.now() > req.deadlineAt) return 'expired';
    return 'cancelled';
};

const outcomeForFailure = (failure: SlackFailure): RequestOutcome => {
    if (failure === 'cancelled') return REQUEST_OUTCOME.CANCELLED;
    if (failure === 'expired') return REQUEST_OUTCOME.EXPIRED;
    if (failure === 'disconnected') return REQUEST_OUTCOME.DISCONNECTED;
    if (failure === 'no_source' || failure === 'auth_required' || failure === 'sharing_not_approved') {
        return REQUEST_OUTCOME.HOST_UNAVAILABLE;
    }
    if (failure === 'client_not_empty' || failure === 'scope_changed' || failure === 'unsupported_scope') {
        return REQUEST_OUTCOME.ACCOUNT_MISMATCH;
    }
    return REQUEST_OUTCOME.FAILED;
};

const disposeAndFail = async (requestId: string, error: unknown): Promise<void> => {
    const req = active;
    if (!req || req.requestId !== requestId || req.state === REQUEST_STATE.SUCCEEDED || req.disposing) return;
    req.disposing = true;
    const dest = req.destination;
    req.destination = null;
    let cleanupFailed = false;
    try {
        if (dest) await dest.dispose();
    } catch {
        cleanupFailed = true;
    }
    if (active !== req || req.requestId !== requestId || requestIsTerminal(req)) return;
    if (cleanupFailed) {
        finalizeWith(req, REQUEST_OUTCOME.FAILED, 'cleanup_required', REQUEST_STATE.IDLE);
        broadcast();
        return;
    }
    const failure = slackFailure(error);
    finalizeWith(
        req,
        req.pendingOutcome ?? outcomeForFailure(failure),
        req.outcomeReason ?? failure,
        REQUEST_STATE.IDLE
    );
    broadcast();
};

const markInvalid = (
    req: ActiveRequest,
    failure: SlackFailure,
    outcome: RequestOutcome,
    reason: string | null
): void => {
    req.cancelled = true;
    req.invalidFailure = failure;
    req.pendingOutcome = outcome;
    req.outcomeReason = reason;
    if (!req.pipeline && !req.destination) {
        finalizeWith(req, outcome, reason, REQUEST_STATE.IDLE);
        broadcast();
        return;
    }
    if (!req.pipeline) {
        void disposeAndFail(req.requestId, new SlackError(failure));
    }
};

/** Begin a new request. Returns the new state, or rejects with the error kind. */
export const startRequest = (params: {
    requestId: string;
    applicationKey: string;
    source?: unknown;
    sharedSessionConsent?: unknown;
}): { ok: true; state: RequestState } | { ok: false; error: ErrorKind; reason?: string } => {
    if (active !== null && !requestIsTerminal(active)) {
        return { ok: false, error: ERROR_KIND.DUPLICATE_REQUEST, reason: 'a request is already active' };
    }

    if (params.applicationKey !== 'slack') {
        const reason =
            params.applicationKey === 'unspecified'
                ? 'no application controller registered yet'
                : 'unsupported application';
        active = buildActive({
            requestId: params.requestId,
            applicationKey: params.applicationKey,
            source: null,
            state: REQUEST_STATE.IDLE,
            outcome: REQUEST_OUTCOME.UNSUPPORTED,
            outcomeReason: reason
        });
        broadcast();
        return {
            ok: false,
            error: ERROR_KIND.REQUEST_NOT_SUPPORTED,
            reason
        };
    }

    if (params.sharedSessionConsent !== true || !isSlackSource(params.source)) {
        return { ok: false, error: ERROR_KIND.MALFORMED, reason: 'invalid_payload' };
    }

    active = buildActive({
        requestId: params.requestId,
        applicationKey: params.applicationKey,
        source: params.source,
        state: REQUEST_STATE.CHECKING_HOST,
        outcome: null,
        outcomeReason: null
    });
    armDeadline(active);
    broadcast();
    return { ok: true, state: active.state };
};

/** Cancel the active request. Idempotent on already-cancelled. */
export const cancelRequest = (): { ok: true; outcome: 'cancelled' } | { ok: false; error: ErrorKind } => {
    if (!active) {
        return { ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST };
    }
    if (active.outcome === REQUEST_OUTCOME.CANCELLED && requestIsTerminal(active)) {
        return { ok: true, outcome: 'cancelled' };
    }
    if (requestIsTerminal(active)) {
        return { ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST };
    }
    markInvalid(active, 'cancelled', REQUEST_OUTCOME.CANCELLED, null);
    return { ok: true, outcome: 'cancelled' };
};

/** Invalidate the active request from outside (transport loss, navigation, expiry). */
export const invalidateRequest = (
    reason: 'disconnected' | 'expired' | 'host_unavailable' | 'navigation',
    detail?: string
): void => {
    if (!active || requestIsTerminal(active)) {
        return;
    }
    const map: Record<typeof reason, RequestOutcome> = {
        disconnected: REQUEST_OUTCOME.DISCONNECTED,
        expired: REQUEST_OUTCOME.EXPIRED,
        host_unavailable: REQUEST_OUTCOME.HOST_UNAVAILABLE,
        navigation: REQUEST_OUTCOME.CANCELLED
    };
    const failure: SlackFailure =
        reason === 'disconnected' ? 'disconnected' : reason === 'expired' ? 'expired' : 'cancelled';
    markInvalid(active, failure, map[reason], detail ?? null);
};

export const getRequestStatus = (): {
    ok: true;
    requestId: string | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    since: number | null;
    error: ErrorKind | null;
    reason: string | null;
    destinationTabId: number | null;
} => {
    if (!active) {
        return {
            ok: true,
            requestId: null,
            state: REQUEST_STATE.IDLE,
            outcome: null,
            since: null,
            error: null,
            reason: null,
            destinationTabId: null
        };
    }
    return {
        ok: true,
        requestId: active.requestId,
        state: active.state,
        outcome: active.outcome,
        since: active.startedAt,
        error: null,
        reason: active.outcomeReason,
        destinationTabId: active.destinationTabId
    };
};

export const subscribe = (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
};

export const isRequestCurrent = (requestId: string): boolean =>
    active !== null && active.requestId === requestId && !requestIsTerminal(active) && !active.cancelled;

export const createRequestGuard =
    (requestId: string): SlackGuard =>
    () => {
        const req = active;
        if (!req || req.requestId !== requestId || requestIsTerminal(req) || req.cancelled) {
            throw new SlackError(req && req.requestId === requestId ? failureFromInvalid(req) : 'cancelled');
        }
        if (Date.now() > req.deadlineAt) {
            req.cancelled = true;
            req.invalidFailure = 'expired';
            throw new SlackError('expired');
        }
    };

export const setRequestState = (requestId: string, state: RequestState): void => {
    if (!active || active.requestId !== requestId || requestIsTerminal(active) || active.cancelled) return;
    if (state === REQUEST_STATE.SUCCEEDED || state === REQUEST_STATE.IDLE) return;
    active.state = state;
    if (state === REQUEST_STATE.WAITING_FOR_USER) {
        active.waitingSince = Date.now();
    }
    broadcast();
};

export const attachDestination = (requestId: string, destination: RequestDestination): void => {
    if (!active || active.requestId !== requestId || requestIsTerminal(active) || active.cancelled) {
        void destination.dispose();
        return;
    }
    active.destination = destination;
    active.destinationTabId = destination.tabId;
    broadcast();
};

export const completeRequest = async (requestId: string): Promise<boolean> => {
    const req = active;
    if (!req || req.requestId !== requestId || requestIsTerminal(req) || req.cancelled) return false;
    const dest = req.destination;
    try {
        if (dest) await dest.finish();
    } catch {
        return false;
    }
    if (active !== req || req.requestId !== requestId || requestIsTerminal(req) || req.cancelled) return false;
    req.destination = null;
    if (dest) req.destinationTabId = dest.tabId;
    finalizeWith(req, null, null, REQUEST_STATE.SUCCEEDED);
    broadcast();
    return true;
};

export const runRequestPipeline = (requestId: string, work: () => Promise<void>): Promise<void> => {
    const req = active;
    if (!req || req.requestId !== requestId || requestIsTerminal(req)) {
        return Promise.resolve();
    }
    const pipeline = (async () => {
        try {
            await work();
            if (
                isRequestCurrent(requestId) &&
                active !== null &&
                active.requestId === requestId &&
                !requestIsTerminal(active)
            ) {
                await disposeAndFail(requestId, new SlackError('failed'));
            }
        } catch (error) {
            await disposeAndFail(requestId, error);
        }
    })();
    req.pipeline = pipeline;
    return pipeline;
};

/** Visible for tests. */
export const _resetForTest = (): void => {
    if (active) clearTimers(active);
    active = null;
    listeners.clear();
};

logger.debug('[request] module loaded');
