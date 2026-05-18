import { ChevronDown } from "lucide-react";
import { useMapStore } from "@/composables/useMapStore";
import { CATEGORY_NAMES } from "@/lib/map/constants";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CategoryFilter() {
  const groups = useMapStore((s) => s.groups);
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const collapsedGroups = useMapStore((s) => s.collapsedGroups);
  const toggleCategory = useMapStore((s) => s.toggleCategory);
  const toggleGroup = useMapStore((s) => s.toggleGroup);
  const toggleGroupCollapse = useMapStore((s) => s.toggleGroupCollapse);
  const getIconUrl = useMapStore((s) => s.getIconUrl);

  function isGroupAllChecked(key: string) { const g = groups.find((g) => g.key === key); if (!g || g.subCategories.length === 0) return false; return g.subCategories.every((sc) => visibleCategories.has(sc.categoryId)); }
  function isGroupPartialChecked(key: string) { const g = groups.find((g) => g.key === key); if (!g || g.subCategories.length === 0) return false; const n = g.subCategories.filter((sc) => visibleCategories.has(sc.categoryId)).length; return n > 0 && n < g.subCategories.length; }

  if (groups.length === 0) return null;

  return (
    <div className="filter-root">
      <ScrollArea className="filter-scroll">
        <div className="filter-scroll-inner">
          {groups.map((group) => {
            const allChecked = isGroupAllChecked(group.key);
            const partialChecked = isGroupPartialChecked(group.key);
            const isCollapsed = collapsedGroups.has(group.key);
            return (
              <Collapsible key={group.key} className="group-collapsible" open={!isCollapsed} onOpenChange={() => toggleGroupCollapse(group.key)}>
                <CollapsibleTrigger className="group-trigger">
                  <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = partialChecked; }} onChange={() => toggleGroup(group.key)} onClick={(e) => e.stopPropagation()} className="group-checkbox" />
                  <span className="group-label">{group.label}</span>
                  <span className="group-count">{group.count}</span>
                  <ChevronDown className="group-chevron" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="group-content">
                    <div className="group-subcats">
                      {group.subCategories.map((sc) => {
                        const checked = visibleCategories.has(sc.categoryId);
                        return (
                          <button key={sc.categoryId} onClick={() => toggleCategory(sc.categoryId)} className="subcat-btn subcat-btn--md" data-checked={checked} title={CATEGORY_NAMES[sc.categoryId] ?? sc.categoryId.toString()}>
                            <img src={getIconUrl(sc.categoryId)} alt="" className="subcat-icon" />
                            <span className="subcat-name">{CATEGORY_NAMES[sc.categoryId] ?? sc.categoryId.toString()}</span>
                            <span className="subcat-count">{sc.count}</span>
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
