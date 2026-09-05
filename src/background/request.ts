// Phase 4 request state machine.
//
// One active request at a time. The state progression follows the plan:
//
//   idle → checking_host → preparing_host → completing_client → verifying → succeeded
//
// With `waiting_for_user` as an orthogonal pause and a small set of terminal
// non-success outcomes. Cancellation, duplicate, expiry, navigation/scope
// change, and disconnect invalidate later results and cause no application
// action.
//
// Application controllers (Phase 6/7/8) plug into the verify → preparing_host
// transition. Until those phases ship and the compatibility verdicts leave
// `unresolved`, every controller call returns REQUEST_NOT_SUPPORTED — never a
// stub.

import {
    ERROR_KIND,
    REQUEST_DEADLINE_MS,
    REQUEST_OUTCOME,
    REQUEST_STATE,
    type ErrorKind,
    type RequestOutcome,
    type RequestState
} from '@/shared/constants';
import { logger } from '@/shared/lib/logger';

interface ActiveRequest {
    requestId: string;
    applicationKey: string;
    intendedAccount: string;
    intendedOriginTab: number;
    allowedReturnOrigins: readonly string[];
    deadlineAt: number;
    transportTimeoutTimer: ReturnType<typeof setTimeout> | null;
    deadlineTimer: ReturnType<typeof setTimeout> | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    outcomeReason: string | null;
    startedAt: number;
    waitingSince: number | null;
    listeners: Set<() => void>;
}

let active: ActiveRequest | null = null;
const listeners = new Set<() => void>();

const broadcast = (): void => {
    for (const fn of listeners) fn();
};

const clearTimers = (req: ActiveRequest): void => {
    if (req.transportTimeoutTimer) clearTimeout(req.transportTimeoutTimer);
    if (req.deadlineTimer) clearTimeout(req.deadlineTimer);
    req.transportTimeoutTimer = null;
    req.deadlineTimer = null;
};

const finalizeWith = (req: ActiveRequest, outcome: RequestOutcome, reason: string | null): void => {
    clearTimers(req);
    req.state = 'idle';
    req.outcome = outcome;
    req.outcomeReason = reason;
    // Do NOT null `active` — keep the snapshot so getRequestStatus can
    // return the most-recent terminalized outcome until a new request starts.
};

const isTerminal = (req: ActiveRequest | null): req is ActiveRequest =>
    req !== null && req.state === 'idle' && req.outcome !== null;

const buildActive = (params: {
    requestId: string;
    applicationKey: string;
    intendedAccount: string;
    intendedOriginTab: number;
    allowedReturnOrigins: readonly string[];
    state: RequestState;
    outcome: RequestOutcome | null;
    outcomeReason: string | null;
}): ActiveRequest => ({
    requestId: params.requestId,
    applicationKey: params.applicationKey,
    intendedAccount: params.intendedAccount,
    intendedOriginTab: params.intendedOriginTab,
    allowedReturnOrigins: params.allowedReturnOrigins,
    deadlineAt: Date.now() + REQUEST_DEADLINE_MS,
    transportTimeoutTimer: null,
    deadlineTimer: null,
    state: params.state,
    outcome: params.outcome,
    outcomeReason: params.outcomeReason,
    startedAt: Date.now(),
    waitingSince: null,
    listeners: new Set()
});

/** Begin a new request. Returns the new state, or rejects with the error kind. */
export const startRequest = (params: {
    requestId: string;
    applicationKey: string;
    intendedAccount: string;
    intendedOriginTab: number;
    allowedReturnOrigins: readonly string[];
}): { ok: true; state: RequestState } | { ok: false; error: ErrorKind; reason?: string } => {
    if (active && !isTerminal(active)) {
        return { ok: false, error: ERROR_KIND.DUPLICATE_REQUEST, reason: 'a request is already active' };
    }

    // Application-key phase gate: until Phase 6/7/8 ships a supported
    // contract for a given application, every controller returns
    // REQUEST_NOT_SUPPORTED. This is the explicit Phase 4 contract:
    // no generic credential/blob adapter, no stub controllers.
    if (params.applicationKey === 'unspecified') {
        active = buildActive({
            requestId: params.requestId,
            applicationKey: params.applicationKey,
            intendedAccount: params.intendedAccount,
            intendedOriginTab: params.intendedOriginTab,
            allowedReturnOrigins: params.allowedReturnOrigins,
            state: 'idle',
            outcome: REQUEST_OUTCOME.UNSUPPORTED,
            outcomeReason: 'no application controller registered yet'
        });
        broadcast();
        return {
            ok: false,
            error: ERROR_KIND.REQUEST_NOT_SUPPORTED,
            reason: 'no controller for applicationKey=unspecified'
        };
    }

    active = buildActive({
        requestId: params.requestId,
        applicationKey: params.applicationKey,
        intendedAccount: params.intendedAccount,
        intendedOriginTab: params.intendedOriginTab,
        allowedReturnOrigins: params.allowedReturnOrigins,
        state: REQUEST_STATE.CHECKING_HOST,
        outcome: null,
        outcomeReason: null
    });
    broadcast();
    return { ok: true, state: active.state };
};

/** Cancel the active request. Idempotent on already-cancelled. */
export const cancelRequest = (): { ok: true; outcome: 'cancelled' } | { ok: false; error: ErrorKind } => {
    if (!active) {
        return { ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST };
    }
    if (active.outcome === REQUEST_OUTCOME.CANCELLED) {
        return { ok: true, outcome: 'cancelled' };
    }
    if (isTerminal(active)) {
        return { ok: false, error: ERROR_KIND.NO_ACTIVE_REQUEST };
    }
    finalizeWith(active, REQUEST_OUTCOME.CANCELLED, null);
    broadcast();
    return { ok: true, outcome: 'cancelled' };
};

/** Invalidate the active request from outside (transport loss, navigation, expiry). */
export const invalidateRequest = (
    reason: 'disconnected' | 'expired' | 'host_unavailable' | 'navigation',
    detail?: string
): void => {
    if (!active || isTerminal(active)) {
        return;
    }
    const map: Record<typeof reason, RequestOutcome> = {
        disconnected: REQUEST_OUTCOME.DISCONNECTED,
        expired: REQUEST_OUTCOME.EXPIRED,
        host_unavailable: REQUEST_OUTCOME.HOST_UNAVAILABLE,
        navigation: REQUEST_OUTCOME.CANCELLED
    };
    finalizeWith(active, map[reason], detail ?? null);
    broadcast();
};

/** Query current request status. Returns the most-recent terminal outcome if no active request is in flight. */
export const getRequestStatus = (): {
    ok: true;
    requestId: string | null;
    state: RequestState;
    outcome: RequestOutcome | null;
    since: number | null;
    error: ErrorKind | null;
    reason: string | null;
} => {
    if (!active) {
        return {
            ok: true,
            requestId: null,
            state: 'idle',
            outcome: null,
            since: null,
            error: null,
            reason: null
        };
    }
    return {
        ok: true,
        requestId: active.requestId,
        state: active.state,
        outcome: active.outcome,
        since: active.startedAt,
        error: null,
        reason: active.outcomeReason
    };
};

export const subscribe = (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
};

/** Visible for tests. */
export const _resetForTest = (): void => {
    if (active) clearTimers(active);
    active = null;
    listeners.clear();
};

logger.debug('[request] module loaded');