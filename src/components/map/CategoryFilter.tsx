import {
  ChevronDown,
  Package,
  Flower2,
  Apple,
  Gem,
  Sparkles,
  MapPin,
  ScrollText,
  HelpCircle,
  X,
} from "lucide-react";
import { useMapStore } from "../../composables/useMapStore";
import { getCategoryIconUrl, CATEGORY_NAMES } from "../../lib/map/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

// 8 分组的 lucide 图标映射
const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  collect: Package,
  grass: Flower2,
  fruit: Apple,
  ore: Gem,
  sprite: Sparkles,
  location: MapPin,
  quest: ScrollText,
  other: HelpCircle,
};

export default function CategoryFilter() {
  const groups = useMapStore((s) => s.groups);
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const toggleCategory = useMapStore((s) => s.toggleCategory);
  const toggleGroup = useMapStore((s) => s.toggleGroup);

  if (groups.length === 0) return null;

  const allCids = new Set(
    groups.flatMap((g) => g.subCategories.map((sc) => sc.categoryId)),
  );
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

  return (
    <div className="category-panel">
      {/* 标题 */}
      <div className="category-panel-header">
        <h2 className="font-semibold text-sm">分类筛选</h2>
        <span className="text-xs text-muted-foreground">
          {visibleCount}/{allCids.size}
        </span>
      </div>

      {/* 清空按钮 */}
      <div className="px-3 py-2 border-b shrink-0">
        <button
          onClick={() => toggleGroup("__all__")}
          disabled={visibleCount === 0}
          title="清空已选"
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <X className="w-3 h-3" />
          清空已选
        </button>
      </div>

      {/* 分组列表：默认全部展开 */}
      <ScrollArea className="category-scroll-area">
        <div className="category-scroll-inner">
          {groups.map((group) => {
            const allChecked = isGroupAllChecked(group.key);
            const partialChecked = isGroupPartialChecked(group.key);
            const IconComponent = GROUP_ICONS[group.key];

            return (
              <Collapsible
                key={group.key}
                className="border-b last:border-b-0"
                defaultOpen={true}
              >
                {/* 分组行 */}
                <CollapsibleTrigger
                  className="
                    flex items-center gap-2 px-3 py-2.5 w-full
                    cursor-pointer hover:bg-muted/50 select-none
                    data-[state=open]:bg-muted/30
                  "
                >
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = partialChecked;
                    }}
                    onChange={() => toggleGroup(group.key)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  {IconComponent && (
                    <IconComponent className="w-4 h-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 font-medium text-sm text-left truncate">
                    {group.label}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums shrink-0">
                    {group.count}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60 transition-transform data-[state=open]:rotate-180" />
                </CollapsibleTrigger>

                {/* 子分类列表：inline 按钮行 */}
                <CollapsibleContent>
                  <div className="pb-2 pt-1 px-3">
                    <div className="flex flex-wrap gap-1.5">
                      {group.subCategories.map((sc) => {
                        const checked = visibleCategories.has(sc.categoryId);
                        return (
                          <button
                            key={sc.categoryId}
                            onClick={() => toggleCategory(sc.categoryId)}
                            className={`
                              inline-flex items-center gap-1.5 h-7 px-2 rounded-full
                              text-xs font-medium transition-colors select-none
                              ${checked
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted hover:bg-muted/80 text-muted-foreground"
                              }
                            `}
                            title={CATEGORY_NAMES[sc.categoryId] ?? sc.categoryId.toString()}
                          >
                            <img
                              src={getCategoryIconUrl(sc.categoryId)}
                              alt=""
                              className="w-3.5 h-3.5 shrink-0 object-contain"
                            />
                            <span className="truncate max-w-[80px]">
                              {CATEGORY_NAMES[sc.categoryId] ?? sc.categoryId.toString()}
                            </span>
                            <span
                              className={`tabular-nums shrink-0 ${
                                checked ? "text-primary-foreground/70" : "text-muted-foreground/60"
                              }`}
                            >
                              {sc.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
