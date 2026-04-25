import { useState } from 'react';
import { useMapStore } from '../../composables/useMapStore';
import { getCategoryIconUrl, CATEGORY_NAMES } from '../../lib/map/constants';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';

export default function CategoryFilter() {
  const groups = useMapStore((s) => s.groups);
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const toggleCategory = useMapStore((s) => s.toggleCategory);
  const toggleGroup = useMapStore((s) => s.toggleGroup);
  const showAll = useMapStore((s) => s.showAllGroups);
  const hideAll = useMapStore((s) => s.hideAllGroups);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;

  const allCids = new Set(groups.flatMap((g) => g.subCategories.map((sc) => sc.categoryId)));
  const visibleCount = [...visibleCategories].filter((c) => allCids.has(c)).length;

  function isGroupAllChecked(key: string): boolean {
    const g = groups.find((g) => g.key === key);
    if (!g || g.subCategories.length === 0) return false;
    return g.subCategories.every((sc) => visibleCategories.has(sc.categoryId));
  }

  function isGroupPartialChecked(key: string): boolean {
    const g = groups.find((g) => g.key === key);
    if (!g || g.subCategories.length === 0) return false;
    const checked = g.subCategories.filter((sc) => visibleCategories.has(sc.categoryId)).length;
    return checked > 0 && checked < g.subCategories.length;
  }

  function toggleExpand(key: string) {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0">
          <Filter className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b">
          <SheetTitle>分类筛选</SheetTitle>
          <SheetDescription>
            {visibleCount}/{allCids.size} 个分类可见
          </SheetDescription>
        </SheetHeader>

        {/* 快捷操作 */}
        <div className="flex gap-2 px-4 py-2 border-b">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={showAll}
            disabled={visibleCount === allCids.size}
          >
            全选
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={hideAll}
            disabled={visibleCount === 0}
          >
            全不选
          </Button>
        </div>

        {/* 分组列表 */}
        <div className="category-scroll-area">
          {groups.map((group) => {
            const expanded = expandedGroups.has(group.key);
            const allChecked = isGroupAllChecked(group.key);
            const partialChecked = isGroupPartialChecked(group.key);

            return (
              <div key={group.key} className="border-b last:border-b-0">
                {/* 分组行 */}
                <div
                  className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => toggleExpand(group.key)}
                >
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = partialChecked; }}
                    onChange={(e) => { e.stopPropagation(); toggleGroup(group.key); }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <span className="flex-1 font-medium text-sm truncate">
                    {group.label}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums shrink-0">
                    {group.count}
                  </span>
                  <span className="text-muted-foreground/60 text-[10px] shrink-0">
                    {expanded ? '▼' : '▶'}
                  </span>
                </div>

                {/* 子分类列表 */}
                {expanded && (
                  <div className="bg-muted/30 pb-1">
                    {group.subCategories.map((sc) => (
                      <label
                        key={sc.categoryId}
                        className="flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-muted/60"
                      >
                        <input
                          type="checkbox"
                          checked={visibleCategories.has(sc.categoryId)}
                          onChange={() => toggleCategory(sc.categoryId)}
                          className="shrink-0"
                        />
                        <img
                          src={getCategoryIconUrl(sc.categoryId)}
                          alt={sc.name}
                          className="w-4 h-4 shrink-0 object-contain category-icon"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="flex-1 text-xs text-muted-foreground truncate">
                          {CATEGORY_NAMES[sc.categoryId] ?? sc.categoryId.toString()}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                          {sc.count}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
