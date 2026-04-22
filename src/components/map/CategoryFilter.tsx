import { useState } from 'react';
import { useMapStore } from '../../composables/useMapStore';

export default function CategoryFilter() {
  const categories = useMapStore((s) => s.categories);
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const toggleCategory = useMapStore((s) => s.toggleCategory);
  const showAll = useMapStore((s) => s.showAllCategories);
  const hideAll = useMapStore((s) => s.hideAllCategories);
  const [collapsed, setCollapsed] = useState(true);

  if (categories.length === 0) return null;

  const visibleCount = visibleCategories.size;

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 13,
        minWidth: collapsed ? 40 : 220,
        overflow: 'hidden',
      }}
    >
      {/* 头部 */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: collapsed ? 'none' : '1px solid #eee',
          userSelect: 'none',
        }}
      >
        <span>{collapsed ? '🏷' : `标点筛选 (${visibleCount}/${categories.length})`}</span>
        <span style={{ fontSize: 11 }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {/* 列表 */}
      {!collapsed && (
        <div style={{ overflow: 'auto', flex: 1 }}>
          {/* 快捷操作 */}
          <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid #eee' }}>
            <button
              onClick={showAll}
              style={btnStyle(visibleCount === categories.length)}
              disabled={visibleCount === categories.length}
            >
              全选
            </button>
            <button
              onClick={hideAll}
              style={btnStyle(visibleCount === 0)}
              disabled={visibleCount === 0}
            >
              全不选
            </button>
          </div>

          {/* 分类列表 */}
          {categories.map((cat) => (
            <label
              key={cat.categoryId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                opacity: visibleCategories.has(cat.categoryId) ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={visibleCategories.has(cat.categoryId)}
                onChange={() => toggleCategory(cat.categoryId)}
              />
              <img
                src={cat.iconUrl}
                alt=""
                style={{ width: 18, height: 18 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cat.categoryId}
              </span>
              <span style={{ color: '#999', fontSize: 11 }}>{cat.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '2px 6px',
    border: '1px solid #ddd',
    borderRadius: 4,
    background: active ? '#e0e0e0' : '#fff',
    cursor: active ? 'default' : 'pointer',
    fontSize: 11,
  };
}
