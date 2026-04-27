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
  Zap,
  Check,
  X,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
} from "lucide-react";
import { useMapStore } from "../../composables/useMapStore";
import { CATEGORY_NAMES } from "../../lib/map/constants";
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
  const collapsedGroups = useMapStore((s) => s.collapsedGroups);
  const toggleCategory = useMapStore((s) => s.toggleCategory);
  const toggleGroup = useMapStore((s) => s.toggleGroup);
  const toggleGroupCollapse = useMapStore((s) => s.toggleGroupCollapse);
  const expandAllGroups = useMapStore((s) => s.expandAllGroups);
  const collapseAllGroups = useMapStore((s) => s.collapseAllGroups);
  const getIconUrl = useMapStore((s) => s.getIconUrl);

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

  // 全选 / 全不选
  function handleSelectAll() {
    const all = [...allCids];
    useMapStore.setState({ visibleCategories: new Set(all) });
  }

  function handleDeselectAll() {
    useMapStore.setState({ visibleCategories: new Set() });
  }

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

      {/* 快捷操作 + 设置 */}
      <div className="category-toolbar">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="toolbar-action-btn">
              <Zap className="toolbar-action-icon" />
              <span className="toolbar-action-label">快捷操作</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="config-popover-content"
          >
            {/* 选择操作 */}
            <div className="quick-actions-section">
              <p className="config-label">选择</p>
              <div className="quick-actions-row">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAll}
                  className="config-action-btn"
                >
                  <Check className="config-action-icon" />
                  全选
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDeselectAll}
                  className="config-action-btn"
                >
                  <X className="config-action-icon" />
                  全不选
                </Button>
              </div>
            </div>

            <Separator className="my-2" />

            {/* 折叠操作 */}
            <div className="quick-actions-section">
              <p className="config-label">折叠</p>
              <div className="quick-actions-row">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={expandAllGroups}
                  className="config-action-btn"
                >
                  <ArrowDownWideNarrow className="config-action-icon" />
                  展开全部
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={collapseAllGroups}
                  className="config-action-btn"
                >
                  <ArrowUpNarrowWide className="config-action-icon" />
                  折叠全部
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <ConfigPanel />
      </div>

      {/* 分组列表：受控折叠状态 */}
      <ScrollArea className="category-scroll-area">
        <div className="category-scroll-inner">
          {groups.map((group) => {
            const allChecked = isGroupAllChecked(group.key);
            const partialChecked = isGroupPartialChecked(group.key);
            const IconComponent = GROUP_ICONS[group.key];
            const isCollapsed = collapsedGroups.has(group.key);

            return (
              <Collapsible
                key={group.key}
                className="group-collapsible"
                open={!isCollapsed}
                onOpenChange={() => toggleGroupCollapse(group.key)}
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
                              src={getIconUrl(sc.categoryId)}
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
