import { useState, useMemo } from "react";
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
  Filter,
  Search,
  Check,
  X,
} from "lucide-react";
import { useMapStore } from "../../composables/useMapStore";
import { getCategoryIconUrl, CATEGORY_NAMES } from "../../lib/map/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ConfigPanel } from "./ConfigPanel";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// 8 分组的 lucide 图标映射
const GROUP_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
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

  // 过滤 Popover 状态
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const allCids = new Set(
    groups.flatMap((g) => g.subCategories.map((sc) => sc.categoryId)),
  );
  const visibleCount = [...visibleCategories].filter((c) =>
    allCids.has(c),
  ).length;

  function isGroupAllChecked(key: string): boolean {
    const g = groups.find((g) => g.key === key);
    if (!g || g.subCategories.length === 0) return false;
    return g.subCategories.every((sc) => visibleCategories.has(sc.categoryId));
  }

  function isGroupPartialChecked(key: string): boolean {
    const g = groups.find((g) => g.key === key);
    if (!g || g.subCategories.length === 0) return false;
    const checked = g.subCategories.filter((sc) =>
      visibleCategories.has(sc.categoryId),
    ).length;
    return checked > 0 && checked < g.subCategories.length;
  }

  // 全选 / 全不选 / 反选
  function handleSelectAll() {
    const all = [...allCids];
    useMapStore.setState({ visibleCategories: new Set(all) });
  }

  function handleDeselectAll() {
    useMapStore.setState({ visibleCategories: new Set() });
  }

  function handleInvert() {
    const next = new Set<number>();
    for (const cid of allCids) {
      if (!visibleCategories.has(cid)) next.add(cid);
    }
    useMapStore.setState({ visibleCategories: next });
  }

  // 搜索过滤后的子分类
  const filteredSubCategories = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    const result: Array<{
      groupId: string;
      groupLabel: string;
      categoryId: number;
      name: string;
      count: number;
    }> = [];
    for (const group of groups) {
      for (const sc of group.subCategories) {
        const name = CATEGORY_NAMES[sc.categoryId] ?? sc.categoryId.toString();
        if (name.toLowerCase().includes(query)) {
          result.push({
            groupId: group.key,
            groupLabel: group.label,
            categoryId: sc.categoryId,
            name,
            count: sc.count,
          });
        }
      }
    }
    return result;
  }, [groups, searchQuery]);

  if (groups.length === 0) return null;

  return (
    <div className="category-panel">
      {/* 标题 */}
      <div className="category-panel-header">
        <h2 className="category-panel-header-title">分类筛选</h2>
        <span className="category-panel-header-count">
          {visibleCount}/{allCids.size}
        </span>
      </div>

      {/* 过滤按钮 + 设置 */}
      <div className="category-toolbar">
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="toolbar-filter-btn">
              <Filter className="filter-icon" />
              <span className="filter-label">过滤</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="config-popover-content"
          >
            {/* 搜索框 */}
            <div className="filter-search">
              <Search className="search-icon" />
              <input
                type="text"
                placeholder="搜索分类名称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            <Separator className="my-2" />

            {/* 快捷操作 */}
            <div className="filter-actions">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSelectAll}
                className="filter-action-btn"
              >
                <Check className="action-icon" />
                全选
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDeselectAll}
                className="filter-action-btn"
              >
                <X className="action-icon" />
                全不选
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleInvert}
              className="filter-invert-btn"
            >
              反选
            </Button>

            <Separator className="my-2" />

            {/* 搜索结果 */}
            {filteredSubCategories ? (
              <div className="filter-results">
                {filteredSubCategories.length === 0 ? (
                  <p className="filter-empty">
                    无匹配结果
                  </p>
                ) : (
                  <div className="filter-list">
                    {filteredSubCategories.map((sc) => {
                      const checked = visibleCategories.has(sc.categoryId);
                      return (
                        <button
                          key={sc.categoryId}
                          onClick={() => toggleCategory(sc.categoryId)}
                          className={`subcat-btn subcat-btn--sm`}
                          data-checked={checked}
                          title={`${sc.groupLabel} - ${sc.name}`}
                        >
                          <img
                            src={getCategoryIconUrl(sc.categoryId)}
                            alt=""
                            className="subcat-icon"
                          />
                          <span className="subcat-name">
                            {sc.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="filter-empty">
                输入关键词搜索分类
              </p>
            )}
          </PopoverContent>
        </Popover>
        <ConfigPanel />
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
                className="group-collapsible"
                defaultOpen={true}
              >
                {/* 分组行 */}
                <CollapsibleTrigger className="group-trigger">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = partialChecked;
                    }}
                    onChange={() => toggleGroup(group.key)}
                    onClick={(e) => e.stopPropagation()}
                    className="group-checkbox"
                  />
                  {IconComponent && (
                    <IconComponent className="group-icon" />
                  )}
                  <span className="group-label">
                    {group.label}
                  </span>
                  <span className="group-count">
                    {group.count}
                  </span>
                  <ChevronDown className="group-chevron" />
                </CollapsibleTrigger>

                {/* 子分类列表 */}
                <CollapsibleContent>
                  <div className="group-content">
                    <div className="group-subcats">
                      {group.subCategories.map((sc) => {
                        const checked = visibleCategories.has(sc.categoryId);
                        return (
                          <button
                            key={sc.categoryId}
                            onClick={() => toggleCategory(sc.categoryId)}
                            className="subcat-btn subcat-btn--md"
                            data-checked={checked}
                            title={
                              CATEGORY_NAMES[sc.categoryId] ??
                              sc.categoryId.toString()
                            }
                          >
                            <img
                              src={getCategoryIconUrl(sc.categoryId)}
                              alt=""
                              className="subcat-icon"
                            />
                            <span className="subcat-name">
                              {CATEGORY_NAMES[sc.categoryId] ??
                                sc.categoryId.toString()}
                            </span>
                            <span className="subcat-count">
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
