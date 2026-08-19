import { Button } from '@/components/tailgrids/core/button';
import { t } from '@/shared/lib/i18n';
import type { HiddenItem } from '@/shared/types';

export function HiddenList({
    items,
    onRestore,
    emptyLabel
}: {
    items: HiddenItem[];
    onRestore: (id: string) => void;
    emptyLabel: string;
}) {
    if (items.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-[#d7ccbc] px-3 py-6 text-center text-sm">
                {emptyLabel}
            </p>
        );
    }

    return (
        <ul className="flex flex-col gap-2">
            {items.map((item) => (
                <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-[#d7ccbc] bg-[#fffaf3] p-2">
                    {item.thumbnail ? (
                        <img className="ee-thumb" src={item.thumbnail} alt="" width={44} height={44} />
                    ) : (
                        <div className="ee-thumb" />
                    )}
                    <div className="min-w-0 flex-1">
                        <a
                            className="ee-clamp text-sm font-medium text-[#1c1612] no-underline"
                            href={item.url}
                            target="_blank"
                            rel="noreferrer">
                            {item.title || item.id}
                        </a>
                        <div className="mt-0.5 text-xs text-[#6b6258]">{item.id}</div>
                    </div>
                    <Button type="button" appearance="outline" size="xs" onClick={() => onRestore(item.id)}>
                        {t('restore') || 'Restore'}
                    </Button>
                </li>
            ))}
        </ul>
    );
}
