import { TitleContext } from "@/App";
import { useLocalStorageState } from "ahooks";
import { useState, useContext, useEffect } from "react";
import { useI18n, useToast } from "@/composables";
import {
  SettingInputItem,
  SettingOptionalItem,
  SettingSelectItem,
  SettingItemGroup,
} from "@/components/SettingItems";
import { Button } from "@/components/ui/button";
import { cacheStats, cacheClear, cacheExportManifest, cacheImportManifest, formatBytes } from "@/lib/cache";

import type { SettingSelectItemItem } from "@/shared";

export default function Settings() {
  const { t, setLang, lang } = useI18n();
  const { title, setTitle } = useContext(TitleContext);
  const [autoComplete, setAutoComplete] = useLocalStorageState(
    "use-auto-complete",
    {
      defaultValue: true,
    }
  );
  const { success, error } = useToast({
    duration: 2000,
  });

  /* setting title item */
  const titleAction = (data: FormData) => {
    if (!data || !data.get("input") || data.get("input") === title)
      return error("Settings.items.title.error");
    setTitle(data.get("input") as string);
    success("Settings.items.title.success");
  };

  /* setting lang item */
  const langItems: SettingSelectItemItem[] = [
    {
      value: "en-US",
      label: "English(US)",
    },
    {
      value: "zh-CN",
      label: "简体中文",
    },
  ];
  const langAction = (data: FormData) => {
    if (!data || !data.get("select") || data.get("select") === lang)
      return error("Settings.items.lang.error");

    setLang(data.get("select") as string);
    success("Settings.items.lang.success");
  };

  /* setting auto-complete item */
  const autoCompleteAction = (checked: boolean) => {
    setAutoComplete(checked);
    success("Settings.items.auto-complete.success");
  };

  /* 缓存管理 */
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheStat, setCacheStat] = useState<{ total_entries: number; total_size: number; expired_entries: number } | null>(null);

  const loadCacheStats = async () => {
    try {
      const stats = await cacheStats();
      setCacheStat(stats);
    } catch (e) {
      error("获取缓存统计失败: " + String(e));
    }
  };

  const clearExpiredCache = async () => {
    setCacheLoading(true);
    try {
      await cacheClear(true);
      success("已清除过期缓存");
      await loadCacheStats();
    } catch (e) {
      error("清除失败: " + String(e));
    } finally {
      setCacheLoading(false);
    }
  };

  const clearAllCache = async () => {
    setCacheLoading(true);
    try {
      await cacheClear(false);
      success("已清除全部缓存");
      await loadCacheStats();
    } catch (e) {
      error("清除失败: " + String(e));
    } finally {
      setCacheLoading(false);
    }
  };

  const exportCacheManifest = async () => {
    try {
      const json = await cacheExportManifest();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cache-manifest-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      success("已导出缓存清单");
    } catch (e) {
      error("导出失败: " + String(e));
    }
  };

  const importCacheManifest = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await cacheImportManifest(text);
        success("已导入缓存清单");
        await loadCacheStats();
      } catch (e) {
        error("导入失败: " + String(e));
      }
    };
    input.click();
  };

  // 页面加载时获取缓存统计
  useEffect(() => {
    loadCacheStats();
  }, []);

  return (
    <div className="view-settings">
      <SettingItemGroup
        title={t("Settings.groups.examples.title")}
        description={t("Settings.groups.examples.description")}
      >
        <SettingInputItem
          type="text"
          value={title ?? ""}
          placeholder="键入自定义标题"
          onItemSubmit={titleAction}
          title={t("Settings.items.title.title")}
          description={t("Settings.items.title.description")}
        />
        <SettingSelectItem
          items={langItems}
          value={langItems.find((i) => i.value === lang)}
          label={t("Settings.items.lang.label")}
          onItemSubmit={langAction}
          title={t("Settings.items.lang.title")}
          description={t("Settings.items.lang.description")}
        />
        <SettingOptionalItem
          label={t("Settings.items.auto-complete.label")}
          value={autoComplete}
          id="optional.auto-complete"
          onItemChange={autoCompleteAction}
          title={t("Settings.items.auto-complete.title")}
          description={t("Settings.items.auto-complete.description")}
        />
      </SettingItemGroup>
      <SettingItemGroup
        title={t("Settings.groups.examples.title")}
        description={t("Settings.groups.examples.description")}
      >
        <SettingInputItem
          type="text"
          value={title ?? ""}
          placeholder="键入自定义标题"
          onItemSubmit={titleAction}
          title={t("Settings.items.title.title")}
          description={t("Settings.items.title.description")}
        />
        <SettingSelectItem
          items={langItems}
          value={langItems.find((i) => i.value === lang)}
          label={t("Settings.items.lang.label")}
          onItemSubmit={langAction}
          title={t("Settings.items.lang.title")}
          description={t("Settings.items.lang.description")}
        />
        <SettingOptionalItem
          label={t("Settings.items.auto-complete.label")}
          value={autoComplete}
          id="optional.auto-complete"
          onItemChange={autoCompleteAction}
          title={t("Settings.items.auto-complete.title")}
          description={t("Settings.items.auto-complete.description")}
        />
      </SettingItemGroup>

      {/* 缓存管理 */}
      <SettingItemGroup
        title="缓存管理"
        description="管理本地离线缓存数据"
      >
        <div className="setting-cache-stats">
          <div className="cache-stat-item">
            <span className="label">总条目</span>
            <span className="value">{cacheStat?.total_entries ?? "-"}</span>
          </div>
          <div className="cache-stat-item">
            <span className="label">占用空间</span>
            <span className="value">{cacheStat ? formatBytes(cacheStat.total_size) : "-"}</span>
          </div>
          <div className="cache-stat-item">
            <span className="label">过期条目</span>
            <span className="value">{cacheStat?.expired_entries ?? "-"}</span>
          </div>
          <Button onClick={loadCacheStats} variant="outline" size="sm">
            刷新
          </Button>
        </div>
        <div className="setting-cache-actions">
          <Button
            onClick={clearExpiredCache}
            disabled={cacheLoading}
            variant="outline"
            size="sm"
          >
            清空过期
          </Button>
          <Button
            onClick={clearAllCache}
            disabled={cacheLoading}
            variant="destructive"
            size="sm"
          >
            清空全部
          </Button>
          <Button
            onClick={exportCacheManifest}
            variant="outline"
            size="sm"
          >
            导出清单
          </Button>
          <Button
            onClick={importCacheManifest}
            variant="outline"
            size="sm"
          >
            导入清单
          </Button>
        </div>
      </SettingItemGroup>
    </div>
  );
}
