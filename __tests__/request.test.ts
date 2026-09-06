import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    _resetForTest,
    attachDestination,
    cancelRequest,
    completeRequest,
    createRequestGuard,
    getRequestStatus,
    invalidateRequest,
    isRequestCurrent,
    runRequestPipeline,
    setRequestState,
    startRequest,
    subscribe
} from '@/background/request';
import { ERROR_KIND, REQUEST_DEADLINE_MS, REQUEST_OUTCOME, REQUEST_STATE } from '@/shared/constants';
import { SlackError } from '@/shared/lib/slack';

const makeRequestId = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const slackSource = {
    sourceTabId: 1,
    scopeId: 'E01234567',
    workspaceId: 'T01234567',
    userId: 'U01234567',
    enterpriseOrigin: 'https://acme.enterprise.slack.com',
    workspaceOrigin: 'https://acme.slack.com',
    workspaceName: 'Acme'
};

const params = (n: number) => ({
    requestId: makeRequestId(n),
    applicationKey: 'slack',
    source: slackSource,
    sharedSessionConsent: true as const
});

let notified = 0;
const onNotify = (): void => {
    notified += 1;
};

beforeEach(() => {
    _resetForTest();
    notified = 0;
    subscribe(onNotify);
});

afterEach(() => {
    _resetForTest();
    vi.useRealTimers();
});

describe('startRequest', () => {
    it('enters checking_host for slack', () => {
        const r = startRequest(params(1));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.state).toBe(REQUEST_STATE.CHECKING_HOST);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.CHECKING_HOST);
    });

    it('rejects a duplicate request', () => {
        startRequest(params(2));
        const r = startRequest(params(3));
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toBe(ERROR_KIND.DUPLICATE_REQUEST);
        }
    });

    it('rejects applicationKey="unspecified" with REQUEST_NOT_SUPPORTED', () => {
        const r = startRequest({ ...params(4), applicationKey: 'unspecified' });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toBe(ERROR_KIND.REQUEST_NOT_SUPPORTED);
        }
    });

    it('rejects unsupported applications explicitly', () => {
        const r = startRequest({ ...params(14), applicationKey: 'outlook-web' });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toBe(ERROR_KIND.REQUEST_NOT_SUPPORTED);
        }
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.UNSUPPORTED);
    });

    it('rejects slack without an explicit source', () => {
        const r = startRequest({
            requestId: makeRequestId(15),
            applicationKey: 'slack',
            sharedSessionConsent: true
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(ERROR_KIND.MALFORMED);
    });

    it('emits a notification on state change', () => {
        startRequest(params(5));
        expect(notified).toBeGreaterThan(0);
    });
});

describe('cancelRequest', () => {
    it('cancels the active request and reports cancelled', () => {
        startRequest(params(6));
        const r = cancelRequest();
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.outcome).toBe('cancelled');
        const status = getRequestStatus();
        expect(status.state).toBe('idle');
        expect(status.outcome).toBe(REQUEST_OUTCOME.CANCELLED);
    });

    it('returns NO_ACTIVE_REQUEST when none', () => {
        const r = cancelRequest();
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(ERROR_KIND.NO_ACTIVE_REQUEST);
    });
});

describe('invalidateRequest', () => {
    it('disconnected → DISCONNECTED outcome', () => {
        startRequest(params(7));
        invalidateRequest('disconnected');
        const s = getRequestStatus();
        expect(s.outcome).toBe(REQUEST_OUTCOME.DISCONNECTED);
    });

    it('expired → EXPIRED outcome', () => {
        startRequest(params(8));
        invalidateRequest('expired');
        const s = getRequestStatus();
        expect(s.outcome).toBe(REQUEST_OUTCOME.EXPIRED);
    });

    it('host_unavailable → HOST_UNAVAILABLE outcome', () => {
        startRequest(params(9));
        invalidateRequest('host_unavailable');
        const s = getRequestStatus();
        expect(s.outcome).toBe(REQUEST_OUTCOME.HOST_UNAVAILABLE);
    });

    it('navigation → CANCELLED outcome', () => {
        startRequest(params(10));
        invalidateRequest('navigation');
        const s = getRequestStatus();
        expect(s.outcome).toBe(REQUEST_OUTCOME.CANCELLED);
    });

    it('is a no-op when no request is active', () => {
        const before = notified;
        invalidateRequest('disconnected');
        expect(notified).toBe(before);
    });

    it('attaches a reason when provided', () => {
        startRequest(params(11));
        invalidateRequest('disconnected', 'host peer connection closed');
        const s = getRequestStatus();
        expect(s.reason).toBe('host peer connection closed');
    });
});

describe('subscribe/notify', () => {
    it('notifies on transitions', () => {
        const initial = notified;
        startRequest(params(12));
        const afterStart = notified;
        cancelRequest();
        const afterCancel = notified;
        expect(afterStart).toBeGreaterThan(initial);
        expect(afterCancel).toBeGreaterThan(afterStart);
    });

    it('unsubscribe stops further notifications', () => {
        let local = 0;
        const off = subscribe(() => {
            local += 1;
        });
        off();
        startRequest(params(13));
        expect(local).toBe(0);
    });
});

describe('late cancel and cleanup', () => {
    it('does not succeed after cancel', async () => {
        startRequest(params(20));
        const dest = { tabId: 9, dispose: vi.fn(async () => undefined), finish: vi.fn() };
        attachDestination(makeRequestId(20), dest);
        cancelRequest();
        expect(await completeRequest(makeRequestId(20))).toBe(false);
        expect(getRequestStatus().state).not.toBe(REQUEST_STATE.SUCCEEDED);
        expect(dest.finish).not.toHaveBeenCalled();
    });

    it('ignores completeRequest for an unknown request', async () => {
        expect(await completeRequest(makeRequestId(99))).toBe(false);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.IDLE);
    });

    it('disposes destination when cancel has no in-flight pipeline', async () => {
        startRequest(params(21));
        const dest = { tabId: 4, dispose: vi.fn(async () => undefined), finish: vi.fn() };
        attachDestination(makeRequestId(21), dest);
        cancelRequest();
        await vi.waitFor(() => expect(dest.dispose).toHaveBeenCalled());
        expect(dest.finish).not.toHaveBeenCalled();
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.CANCELLED);
    });

    it('keeps busy and defers dispose while a provider pipeline is in flight', async () => {
        startRequest(params(22));
        const dest = { tabId: 5, dispose: vi.fn(async () => undefined), finish: vi.fn() };
        attachDestination(makeRequestId(22), dest);
        let release: () => void = () => undefined;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const pipeline = runRequestPipeline(makeRequestId(22), async () => {
            await blocked;
            createRequestGuard(makeRequestId(22))();
        });
        cancelRequest();
        expect(dest.dispose).not.toHaveBeenCalled();
        expect(getRequestStatus().state).not.toBe(REQUEST_STATE.IDLE);
        release();
        await pipeline;
        expect(dest.dispose).toHaveBeenCalled();
        expect(dest.finish).not.toHaveBeenCalled();
        expect(getRequestStatus().state).toBe(REQUEST_STATE.IDLE);
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.CANCELLED);
    });

    it('publishes cleanup_required when destination.dispose throws', async () => {
        startRequest(params(23));
        const dest = {
            tabId: 6,
            dispose: vi.fn(async () => {
                throw new Error('cookie remove failed');
            }),
            finish: vi.fn()
        };
        attachDestination(makeRequestId(23), dest);
        cancelRequest();
        await vi.waitFor(() => expect(getRequestStatus().reason).toBe('cleanup_required'));
        expect(getRequestStatus().state).toBe(REQUEST_STATE.IDLE);
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.FAILED);
        expect(getRequestStatus().reason).not.toBe('cancelled');
    });
});

describe('cancelRequest terminal states', () => {
    it('is idempotent once the request already ended cancelled', () => {
        startRequest(params(30));
        expect(cancelRequest()).toEqual({ ok: true, outcome: 'cancelled' });
        expect(cancelRequest()).toEqual({ ok: true, outcome: 'cancelled' });
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.CANCELLED);
    });

    it('returns NO_ACTIVE_REQUEST after a successful complete', async () => {
        startRequest(params(31));
        expect(await completeRequest(makeRequestId(31))).toBe(true);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.SUCCEEDED);
        const r = cancelRequest();
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(ERROR_KIND.NO_ACTIVE_REQUEST);
    });
});

describe('deadline', () => {
    it('expires the request when the armed deadline timer fires', () => {
        vi.useFakeTimers();
        startRequest(params(32));
        vi.advanceTimersByTime(REQUEST_DEADLINE_MS);
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.EXPIRED);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.IDLE);
    });

    it('createRequestGuard throws expired once the deadline has passed', () => {
        vi.useFakeTimers();
        const started = Date.now();
        startRequest(params(33));
        vi.setSystemTime(started + REQUEST_DEADLINE_MS + 1);
        expect(() => createRequestGuard(makeRequestId(33))()).toThrow(SlackError);
        try {
            createRequestGuard(makeRequestId(33))();
        } catch (err) {
            expect(err).toBeInstanceOf(SlackError);
            expect((err as SlackError).code).toBe('expired');
        }
    });
});

describe('attachDestination', () => {
    it('disposes a destination attached after cancel and does not keep it', async () => {
        startRequest(params(34));
        cancelRequest();
        const dest = { tabId: 11, dispose: vi.fn(async () => undefined), finish: vi.fn() };
        attachDestination(makeRequestId(34), dest);
        await vi.waitFor(() => expect(dest.dispose).toHaveBeenCalled());
        expect(getRequestStatus().destinationTabId).toBeNull();
        expect(dest.finish).not.toHaveBeenCalled();
    });
});

describe('completeRequest', () => {
    it('succeeds without a destination', async () => {
        startRequest(params(35));
        expect(await completeRequest(makeRequestId(35))).toBe(true);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.SUCCEEDED);
        expect(getRequestStatus().outcome).toBeNull();
    });

    it('returns false when destination.finish throws and does not succeed', async () => {
        startRequest(params(36));
        const dest = {
            tabId: 12,
            dispose: vi.fn(async () => undefined),
            finish: vi.fn(() => {
                throw new Error('finish failed');
            })
        };
        attachDestination(makeRequestId(36), dest);
        expect(await completeRequest(makeRequestId(36))).toBe(false);
        expect(getRequestStatus().state).not.toBe(REQUEST_STATE.SUCCEEDED);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.CHECKING_HOST);
    });

    it('succeeds when destination.finish resolves', async () => {
        startRequest(params(37));
        const dest = { tabId: 13, dispose: vi.fn(async () => undefined), finish: vi.fn() };
        attachDestination(makeRequestId(37), dest);
        expect(await completeRequest(makeRequestId(37))).toBe(true);
        expect(dest.finish).toHaveBeenCalled();
        expect(getRequestStatus().state).toBe(REQUEST_STATE.SUCCEEDED);
        expect(getRequestStatus().destinationTabId).toBe(13);
    });
});

describe('runRequestPipeline', () => {
    it('resolves immediately when no request is active', async () => {
        const work = vi.fn(async () => undefined);
        await expect(runRequestPipeline(makeRequestId(38), work)).resolves.toBeUndefined();
        expect(work).not.toHaveBeenCalled();
    });

    it('fails the request when work returns without completing', async () => {
        startRequest(params(39));
        await runRequestPipeline(makeRequestId(39), async () => undefined);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.IDLE);
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.FAILED);
    });

    it.each([
        ['disconnected', REQUEST_OUTCOME.DISCONNECTED],
        ['expired', REQUEST_OUTCOME.EXPIRED],
        ['no_source', REQUEST_OUTCOME.HOST_UNAVAILABLE],
        ['client_not_empty', REQUEST_OUTCOME.ACCOUNT_MISMATCH],
        ['failed', REQUEST_OUTCOME.FAILED]
    ] as const)('maps SlackError(%s) to outcome %s', async (code, outcome) => {
        const n = 40 + ['disconnected', 'expired', 'no_source', 'client_not_empty', 'failed'].indexOf(code);
        startRequest(params(n));
        await runRequestPipeline(makeRequestId(n), async () => {
            throw new SlackError(code);
        });
        expect(getRequestStatus().outcome).toBe(outcome);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.IDLE);
    });
});

describe('setRequestState', () => {
    it('records waiting_for_user', () => {
        startRequest(params(50));
        setRequestState(makeRequestId(50), REQUEST_STATE.WAITING_FOR_USER);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.WAITING_FOR_USER);
    });

    it('ignores SUCCEEDED and IDLE targets while the request is active', () => {
        startRequest(params(51));
        setRequestState(makeRequestId(51), REQUEST_STATE.SUCCEEDED);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.CHECKING_HOST);
        setRequestState(makeRequestId(51), REQUEST_STATE.IDLE);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.CHECKING_HOST);
    });

    it('ignores updates after cancel', () => {
        startRequest(params(52));
        cancelRequest();
        setRequestState(makeRequestId(52), REQUEST_STATE.WAITING_FOR_USER);
        expect(getRequestStatus().state).toBe(REQUEST_STATE.IDLE);
        expect(getRequestStatus().outcome).toBe(REQUEST_OUTCOME.CANCELLED);
    });
});

describe('isRequestCurrent', () => {
    it('is false after cancel even while cleanup is still in flight', async () => {
        startRequest(params(53));
        expect(isRequestCurrent(makeRequestId(53))).toBe(true);
        let release: () => void = () => undefined;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const pipeline = runRequestPipeline(makeRequestId(53), async () => {
            await blocked;
        });
        cancelRequest();
        expect(isRequestCurrent(makeRequestId(53))).toBe(false);
        expect(getRequestStatus().state).not.toBe(REQUEST_STATE.IDLE);
        release();
        await pipeline;
    });
});
