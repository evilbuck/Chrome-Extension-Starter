import { render } from 'preact';
import { Button } from '@/components/tailgrids/core/button';
import { PairingPanel, pairingLocksRole, useTransportStatus } from '@/pages/pairing/pairing-panel';
import { SlackRequestPanel } from '@/pages/slack/request-panel';
import { t } from '@/shared/lib/i18n';
import '@/shared/styles.css';

const RoleConfigCard = ({ transport }: { transport: ReturnType<typeof useTransportStatus> }) => {
    const { status, localRole, busy, setLocalRole } = transport;
    const locked = pairingLocksRole(status.pairing);
    const role = status.pairing.pair?.role ?? localRole ?? status.role;

    return (
        <section
            className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
            aria-labelledby="role-title">
            <div>
                <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                    01 / Choose this profile’s role
                </p>
                <h2 id="role-title" className="text-xl font-semibold">
                    {t('roleTitle')}
                </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-gray-600">{t('roleDescription')}</p>
            {locked && <p className="text-sm text-gray-600">{t('pairingRoleLocked')}</p>}
            <fieldset className="flex flex-wrap gap-3" aria-labelledby="role-title">
                <Button
                    size="sm"
                    appearance={role === 'host' ? 'fill' : 'outline'}
                    aria-pressed={role === 'host'}
                    disabled={busy || locked}
                    onClick={() => void setLocalRole('host')}>
                    {t('roleHost')}
                </Button>
                <Button
                    size="sm"
                    appearance={role === 'client' ? 'fill' : 'outline'}
                    aria-pressed={role === 'client'}
                    disabled={busy || locked}
                    onClick={() => void setLocalRole('client')}>
                    {t('roleClient')}
                </Button>
            </fieldset>
            <p className="text-sm text-gray-600" role="status">
                Saved role:{' '}
                <span className="font-mono font-semibold text-gray-900" data-testid="local-role">
                    {role ?? '—'}
                </span>
            </p>
        </section>
    );
};

const Options = () => {
    const transport = useTransportStatus();
    return (
        <main className="mx-auto max-w-4xl space-y-6 py-4 sm:py-8">
            <header className="mb-8 border-b border-gray-200 pb-6">
                <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-primary-600">
                    Profile connection / Development preview
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('extName')}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">{t('pairingPageHelp')}</p>
            </header>
            <RoleConfigCard transport={transport} />
            <PairingPanel transport={transport} />
            <SlackRequestPanel />
        </main>
    );
};

const root = document.getElementById('root');
if (root) render(<Options />, root);
