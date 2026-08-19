import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
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
import { TabContent, TabList, TabRoot, TabTrigger } from '@/components/tailgrids/core/tabs';
import { Toggle } from '@/components/tailgrids/core/toggle';
import { type Settings, settingsManager } from '@/shared/config';
import { listHiddenItems, loadHiddenItems, unhideAll, unhideItem, watchHiddenItems } from '@/shared/hidden-items';
import { t } from '@/shared/lib/i18n';
import { logger } from '@/shared/lib/logger';
import type { HiddenItem } from '@/shared/types';
import '@/shared/styles.css';
import '../shell.css';

type SaveStatus = 'idle' | 'success' | 'error';

const Options = () => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [items, setItems] = useState<HiddenItem[]>([]);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<SaveStatus>('idle');
    const [loading, setLoading] = useState(true);
    const [confirmClear, setConfirmClear] = useState(false);

    const refreshHidden = async () => {
        setItems(listHiddenItems(await loadHiddenItems()));
    };

    useEffect(() => {
        (async () => {
            try {
                setSettings(await settingsManager.load());
                await refreshHidden();
            } catch (error) {
                logger.error('Failed to load options', error);
                setStatus('error');
            } finally {
                setLoading(false);
            }
        })();

        return watchHiddenItems(() => {
            void refreshHidden();
        });
    }, []);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return items;
        return items.filter((item) => `${item.title} ${item.id}`.toLowerCase().includes(needle));
    }, [items, query]);

    const saveOptions = async () => {
        if (!settings) return;
        try {
            await settingsManager.save(settings);
            setStatus('success');
            window.setTimeout(() => setStatus('idle'), 1200);
        } catch (error) {
            logger.error('Failed to save settings', error);
            setStatus('error');
        }
    };

    if (loading) {
        return (
            <div className="ee-shell min-h-screen p-6">
                <div className="mx-auto max-w-2xl py-16 text-center text-sm">{t('loadingSettings')}</div>
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="ee-shell min-h-screen p-6">
                <div className="mx-auto max-w-xl py-16 text-center">
                    <Badge color="error">{t('failedToLoad')}</Badge>
                </div>
            </div>
        );
    }

    return (
        <div className="ee-shell min-h-screen p-6">
            <div className="mx-auto max-w-2xl">
                <Card className="border border-[#d7ccbc] bg-[#fffaf3] shadow-none">
                    <CardHeader className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <span className="ee-mark">×</span>
                                    <Badge color="error">{t('optionsTitle')}</Badge>
                                </div>
                                <CardTitle>{t('optionsTitle')}</CardTitle>
                                <CardDescription className="mt-2 text-sm">{t('optionsDescription')}</CardDescription>
                            </div>
                            {status !== 'idle' && (
                                <Badge color={status === 'success' ? 'success' : 'error'} size="md">
                                    {status === 'success' ? t('saved') : t('failedToSave')}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="pb-2">
                        <TabRoot defaultValue="hidden" className="overflow-visible bg-transparent shadow-none">
                            <TabList>
                                <TabTrigger value="hidden" badge={items.length}>
                                    {t('hiddenTab')}
                                </TabTrigger>
                                <TabTrigger value="settings" badge={2}>
                                    {t('settingsTab')}
                                </TabTrigger>
                            </TabList>

                            <TabContent value="hidden" className="space-y-4">
                                <input
                                    className="w-full rounded-xl border border-[#d7ccbc] bg-[#fffaf3] px-3 py-2 text-sm"
                                    type="search"
                                    value={query}
                                    placeholder={t('searchHidden')}
                                    onInput={(event) => setQuery(event.currentTarget.value)}
                                />
                                <HiddenList
                                    items={filtered}
                                    onRestore={(id) => void unhideItem(id).then(refreshHidden)}
                                    emptyLabel={t('emptyHidden')}
                                />
                            </TabContent>

                            <TabContent value="settings" className="space-y-4">
                                <div className="rounded-2xl border border-[#d7ccbc] bg-[#f3ecdf] p-5">
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-medium">{t('hideModeRemove')}</div>
                                            <div className="mt-1 text-sm text-[#6b6258]">{t('hideModeRemoveHint')}</div>
                                        </div>
                                        <Toggle
                                            size="md"
                                            checked={settings.hideMode === 'remove'}
                                            onChange={(event) =>
                                                setSettings({
                                                    ...settings,
                                                    hideMode: event.currentTarget.checked ? 'remove' : 'dim'
                                                })
                                            }
                                            label={settings.hideMode === 'remove' ? t('enabled') : t('disabled')}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-[#d7ccbc] bg-[#f3ecdf] p-5">
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-medium">{t('showHideButtons')}</div>
                                            <div className="mt-1 text-sm text-[#6b6258]">
                                                {t('showHideButtonsHint')}
                                            </div>
                                        </div>
                                        <Toggle
                                            size="md"
                                            checked={settings.showHideButtons}
                                            onChange={(event) =>
                                                setSettings({
                                                    ...settings,
                                                    showHideButtons: event.currentTarget.checked
                                                })
                                            }
                                            label={settings.showHideButtons ? t('enabled') : t('disabled')}
                                        />
                                    </div>
                                </div>
                            </TabContent>
                        </TabRoot>
                    </CardContent>

                    <CardFooter className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <Button
                            type="button"
                            variant="danger"
                            appearance="outline"
                            onClick={() => {
                                if (!confirmClear) {
                                    setConfirmClear(true);
                                    return;
                                }
                                void unhideAll().then(() => {
                                    setConfirmClear(false);
                                    return refreshHidden();
                                });
                            }}>
                            {confirmClear ? t('confirmClear') : t('restoreAll')}
                        </Button>
                        <Button type="button" onClick={() => void saveOptions()}>
                            {t('save')}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

const root = document.getElementById('root');
if (root) render(<Options />, root);
