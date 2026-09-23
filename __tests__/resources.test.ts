import { describe, expect, it } from 'vitest';
import {
    cookieIdentityKey,
    localStorageIdentityKey,
    resourcePermission,
    uniqueHttpOriginsFromTabs
} from '@/shared/lib/resources';

describe('resource identities', () => {
    it('keys a cookie by name, domain, path, partitionKey, and storeId', () => {
        const a = cookieIdentityKey({
            name: 'syn-name',
            domain: 'example.com',
            path: '/',
            storeId: '0'
        });
        const b = cookieIdentityKey({
            name: 'syn-name',
            domain: 'example.com',
            path: '/',
            partitionKey: { topLevelSite: 'https://example.com' },
            storeId: '0'
        });
        expect(a).not.toBe(b);
        expect(
            cookieIdentityKey({
                name: 'syn-name',
                domain: 'example.com',
                path: '/',
                storeId: '0'
            })
        ).toBe(a);
    });

    it('keys localStorage by origin and key', () => {
        expect(localStorageIdentityKey('https://example.com', 'syn-key')).toBe(
            localStorageIdentityKey('https://example.com', 'syn-key')
        );
        expect(localStorageIdentityKey('https://example.com', 'syn-key')).not.toBe(
            localStorageIdentityKey('https://example.com', 'other')
        );
    });

    it('builds a per-origin optional permission object', () => {
        expect(resourcePermission('https://example.com')).toEqual({
            permissions: ['cookies', 'scripting'],
            origins: ['https://example.com/*']
        });
    });
});

describe('uniqueHttpOriginsFromTabs', () => {
    it('keeps unique http(s) origins and skips restricted, non-http, and incognito tabs', () => {
        expect(
            uniqueHttpOriginsFromTabs([
                { url: 'https://a.example/', incognito: false },
                { url: 'https://a.example/path', incognito: false },
                { url: 'http://b.example/', incognito: false },
                { url: 'https://secret.example/', incognito: true },
                { url: 'chrome://extensions', incognito: false },
                { url: 'chrome-extension://abc/options.html', incognito: false },
                { url: 'ftp://files.example/', incognito: false },
                { url: 'https://chrome.google.com/webstore/detail/x', incognito: false }
            ])
        ).toEqual(['https://a.example', 'http://b.example']);
    });
});
