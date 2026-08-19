import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { HiddenList } from '@/components/hidden-list';
import { Badge } from '@/components/tailgrids/core/badge';
import { Button } from '@/components/tailgrids/core/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from '@/components/tailgrids/core/card';
import { Toggle } from '@/components/tailgrids/core/toggle';
import { type Settings, settingsManager } from '@/shared/config';
import { isEbayHost } from '@/shared/ebay';
import { listHiddenItems, loadHiddenItems, unhideItem, watchHiddenItems } from '@/shared/hidden-items';
import { t } from '@/shared/lib/i18n';
import { logger } from '@/shared/lib/logger';
import type { HiddenItem } from '@/shared/types';
import '@/shared/styles.css';
import '../shell.css';

const Popup = () => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [items, setItems] = useState<HiddenItem[]>([]);
    const [hiddenCount, setHiddenCount] = useState(0);
    const [onEbay, setOnEbay] = useState(false);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        const [loadedSettings, hidden] = await Promise.all([settingsManager.load(), loadHiddenItems()]);
        const listed = listHiddenItems(hidden);
        setSettings(loadedSettings);
        setHiddenCount(listed.length);
        setItems(listed.slice(0, 8));
    };

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            try {
                const host = tabs[0]?.url ? new URL(tabs[0].url).hostname : '';
                setOnEbay(isEbayHost(host));
            } catch {
                setOnEbay(false);
            }
        });

        refresh()
            .catch((error) => logger.error('Failed to load popup state', error))
            .finally(() => setLoading(false));

        return watchHiddenItems(() => {
            void refresh();
        });
    }, []);
    const saveSettings = async (next: Settings) => {
        setSettings(next);
        await settingsManager.save(next);
    };

    if (loading || !settings) {
        return (
            <div className="ee-shell min-w-[22rem] p-4">
                <Card className="border border-[#d7ccbc] bg-[#fffaf3] shadow-none">
                    <CardContent className="py-8 text-center text-sm">{t('loadingSettings')}</CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="ee-shell min-w-[22rem] max-w-[24rem] p-4">
            <Card className="border border-[#d7ccbc] bg-[#fffaf3] shadow-none">
                <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="mb-3 flex items-center gap-2">
                                <span className="ee-mark">×</span>
                                <Badge color="error">{t('popupTitle')}</Badge>
                            </div>
                            <CardTitle className="text-xl">{t('popupTitle')}</CardTitle>
                            <CardDescription className="mt-1 text-sm">
                                {onEbay ? t('onEbayHint') : t('notOnEbayHint')}
                            </CardDescription>
                        </div>
                        <Badge color="gray" size="md">
                            {String(hiddenCount)}
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4 pb-2">
                    <div className="rounded-2xl border border-[#d7ccbc] bg-[#f3ecdf] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-medium">{t('hideModeRemove')}</div>
                                <div className="mt-1 text-xs text-[#6b6258]">{t('hideModeRemoveHint')}</div>
                            </div>
                            <Toggle
                                checked={settings.hideMode === 'remove'}
                                onChange={(event) =>
                                    void saveSettings({
                                        ...settings,
                                        hideMode: event.currentTarget.checked ? 'remove' : 'dim'
                                    })
                                }
                                label={settings.hideMode === 'remove' ? t('enabled') : t('disabled')}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[#6b6258]">
                            {t('recentHidden')}
                        </div>
                        <HiddenList
                            items={items}
                            onRestore={(id) => void unhideItem(id).then(refresh)}
                            emptyLabel={t('noHiddenItems')}
                        />
                    </div>
                </CardContent>

                <CardFooter className="flex items-center justify-end gap-3 pt-2">
                    <Button type="button" appearance="outline" onClick={() => chrome.runtime.openOptionsPage()}>
                        {t('manageAll')}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

const root = document.getElementById('root');
if (root) render(<Popup />, root);
