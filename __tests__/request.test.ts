import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    _resetForTest,
    cancelRequest,
    getRequestStatus,
    invalidateRequest,
    startRequest,
    subscribe
} from '@/background/request';
import { ERROR_KIND, REQUEST_OUTCOME, REQUEST_STATE } from '@/shared/constants';

const makeRequestId = (n: number): string =>
    `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const params = (n: number) => ({
    requestId: makeRequestId(n),
    applicationKey: 'outlook-web',
    intendedAccount: 'test@example.com',
    intendedOriginTab: 1,
    allowedReturnOrigins: ['https://outlook.office.com'] as const
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
});

describe('startRequest', () => {
    it('enters checking_host for a registered application', () => {
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
            expect(r.reason).toMatch(/no controller/i);
        }
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