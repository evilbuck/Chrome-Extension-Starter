import { render } from 'preact';
import { PairingPanel, useTransportStatus } from '@/pages/pairing/pairing-panel';
import { SlackRequestPanel } from '@/pages/slack/request-panel';
import '@/shared/styles.css';

const Popup = () => {
    const transport = useTransportStatus();
    return (
        <main className="min-w-[24rem] max-w-[24rem] space-y-4 p-4">
            <PairingPanel compact transport={transport} />
            <SlackRequestPanel compact />
        </main>
    );
};

const root = document.getElementById('root');
if (root) render(<Popup />, root);
