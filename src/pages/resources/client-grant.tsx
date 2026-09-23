import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '@/components/tailgrids/core/button';
import { MSG } from '@/shared/constants';
import { t } from '@/shared/lib/i18n';
import { resourcePermission } from '@/shared/lib/resources';

const send = async (type: MSG, payload?: unknown): Promise<unknown> =>
    chrome.runtime.sendMessage(payload === undefined ? { type } : { type, payload });

const pendingOrigins = async (): Promise<string[]> => {
    const response: unknown = await send(MSG.RESOURCE_CLIENT_PENDING);
    if (!response || typeof response !== 'object' || Array.isArray(response)) return [];
    const origins = 'origins' in response ? response.origins : null;
    return Array.isArray(origins) && origins.every((origin) => typeof origin === 'string') ? origins : [];
};

export const ClientGrantPanel = () => {
    const [origins, setOrigins] = useState<string[]>([]);
    const [busyOrigin, setBusyOrigin] = useState<string | null>(null);
    const requestId = useRef(0);
    const load = (): void => {
        const id = ++requestId.current;
        void pendingOrigins().then((next) => {
            if (id === requestId.current) setOrigins(next);
        });
    };
    useEffect(() => {
        load();
        const timer = window.setInterval(load, 1000);
        return () => {
            requestId.current += 1;
            window.clearInterval(timer);
        };
    }, []);

    if (origins.length === 0) return null;

    const grant = async (origin: string): Promise<void> => {
        setBusyOrigin(origin);
        try {
            const granted = await chrome.permissions.request(resourcePermission(origin));
            if (!granted) return;
            await send(MSG.RESOURCE_CLIENT_RETRY, { origin });
            load();
        } finally {
            setBusyOrigin(null);
        }
    };

    return (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <div>
                <h2 className="text-xl font-semibold">{t('resourceClientGrantTitle')}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{t('resourceClientGrantHelp')}</p>
            </div>
            <ul className="space-y-3">
                {origins.map((origin) => (
                    <li key={origin} className="flex items-center justify-between gap-3">
                        <span className="truncate font-mono text-sm">{origin}</span>
                        <Button type="button" disabled={busyOrigin === origin} onClick={() => void grant(origin)}>
                            {t('resourceClientGrantAction')}
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    );
};
