import { useState, useEffect } from "react";
import { Settings, Download, Upload, Trash2, Save } from "lucide-react";
import { useMapStore } from "../../composables/useMapStore";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";

/** 当前本地存储中的所有档案 */
interface Profile {
  name: string;
  visibleCategories: number[];
  collapsedGroups: string[];
  savedAt: string; // ISO
}

const STORAGE_KEY = "rocom-map:profiles";
const LAST_PROFILE_KEY = "rocom-map:last-profile";

function loadProfiles(): Profile[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function ConfigPanel() {
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const locations = useMapStore((s) => s.locations);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [saveName, setSaveName] = useState("");
  const [openPopover, setOpenPopover] = useState(false);

  // 启动时恢复上次选中的档案（含折叠状态）
  useEffect(() => {
    const loaded = loadProfiles();
    setProfiles(loaded);
    const lastProfile = localStorage.getItem(LAST_PROFILE_KEY);
    if (lastProfile && loaded.some((p) => p.name === lastProfile)) {
      setSelectedProfile(lastProfile);
      setSaveName(lastProfile); // 同步到输入框
      const prof = loaded.find((p) => p.name === lastProfile);
      if (prof) {
        const allCids = getValidCids();
        const validCids = prof.visibleCategories.filter((c) => allCids.has(c));
        useMapStore.setState({
          visibleCategories: new Set(validCids),
          collapsedGroups: new Set(prof.collapsedGroups ?? []),
        });
      }
    }
  }, []);

  /** 获取当前地图所有合法 category_id 集合 */
  function getValidCids(): Set<number> {
    return new Set(locations.map((loc) => loc.category_id));
  }

  /** 切换到指定档案（用户主动操作才触发） */
  function handleSelect(name: string) {
    setSelectedProfile(name);
    setSaveName(name); // 同步更新输入框
    if (name === "") {
      localStorage.removeItem(LAST_PROFILE_KEY);
      return;
    }
    const prof = profiles.find((p) => p.name === name);
    if (!prof) return;

    localStorage.setItem(LAST_PROFILE_KEY, name);

    const allCids = getValidCids();
    const validCids = prof.visibleCategories.filter((c) => allCids.has(c));
    useMapStore.setState({
      visibleCategories: new Set(validCids),
      collapsedGroups: new Set(prof.collapsedGroups ?? []),
    });
  }

  /** 保存当前状态为新档案 */
  function handleSave() {
    const name = saveName.trim();
    if (!name) return;
    const next = profiles.filter((p) => p.name !== name);
    const collapsedGroups = useMapStore.getState().collapsedGroups;
    next.push({
      name,
      visibleCategories: [...visibleCategories],
      collapsedGroups: [...collapsedGroups],
      savedAt: new Date().toISOString(),
    });
    saveProfiles(next);
    setProfiles(next);
    setSelectedProfile(name);
    // 保存后保持 saveName 为档案名，方便用户继续修改/覆盖
    localStorage.setItem(LAST_PROFILE_KEY, name);
  }

  /** 删除当前选中档案 */
  function handleDelete() {
    if (!selectedProfile) return;
    const next = profiles.filter((p) => p.name !== selectedProfile);
    saveProfiles(next);
    setProfiles(next);
    setSelectedProfile("");
    setSaveName("");  // 同步清空输入框
    localStorage.removeItem(LAST_PROFILE_KEY);
  }

  /** 导出当前配置为 JSON（使用 Tauri 保存对话框） */
  async function handleExport() {
    try {
      const defaultName = selectedProfile || "custom";
      const filePath = await save({
        defaultPath: `rocom-map-profile-${defaultName}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;

      const collapsedGroups = useMapStore.getState().collapsedGroups;
      const data = {
        version: 1,
        name: selectedProfile || "未命名",
        visibleCategories: [...visibleCategories],
        collapsedGroups: [...collapsedGroups],
        exportedAt: new Date().toISOString(),
      };
      await writeFile(filePath, new TextEncoder().encode(JSON.stringify(data, null, 2)));
    } catch (err) {
      console.error("导出失败:", err);
    }
  }

  /** 导入 JSON 档案（使用 Tauri 打开对话框） */
  async function handleImport() {
    try {
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!filePath) return;

      const content = await readFile(filePath as string);
      const text = new TextDecoder().decode(content);
      const data = JSON.parse(text);

      if (!Array.isArray(data.visibleCategories)) {
        return;
      }

      const name =
        data.name?.trim() ||
        `导入 ${new Date().toLocaleDateString("zh-CN")}`;
      const next = profiles.filter((p) => p.name !== name);
      next.push({
        name,
        visibleCategories: data.visibleCategories,
        collapsedGroups: data.collapsedGroups ?? [],
        savedAt: data.exportedAt ?? new Date().toISOString(),
      });
      saveProfiles(next);
      setProfiles(next);
      setSelectedProfile(name);
      setSaveName(name);  // 同步到输入框
      localStorage.setItem(LAST_PROFILE_KEY, name);

      const allCids = getValidCids();
      const validCids = data.visibleCategories.filter((c: number) => allCids.has(c));
      useMapStore.setState({
        visibleCategories: new Set(validCids),
        collapsedGroups: new Set(data.collapsedGroups ?? []),
      });
      setOpenPopover(false);
    } catch (err) {
      console.error("导入失败:", err);
    }
  }

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="config-trigger-btn"
          title="配置"
        >
          <Settings className="config-trigger-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="config-popover-content"
      >
        <div className="config-section">
          <p className="config-label">选择档案</p>
          <Select value={selectedProfile} onValueChange={handleSelect}>
            <SelectTrigger className="config-select-trigger">
              <SelectValue placeholder="选择档案…" />
            </SelectTrigger>
            <SelectContent>
              {profiles.length === 0 && (
                <SelectItem value="__placeholder__" disabled>
                  暂无保存的档案
                </SelectItem>
              )}
              {profiles.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-2" />

        <div className="config-section">
          <p className="config-label">新建档案</p>
          <div className="config-save-row">
            <input
              type="text"
              placeholder="输入档案名称"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="config-input"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="config-save-btn"
            >
              <Save className="config-action-icon" />
            </Button>
          </div>
        </div>

        <Separator className="my-2" />

        <div className="config-actions">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            className="config-action-btn"
          >
            <Download className="config-action-icon" />
            导出
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleImport}
            className="config-action-btn"
          >
            <Upload className="config-action-icon" />
            导入
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                disabled={!selectedProfile}
                className="config-action-btn"
              >
                <Trash2 className="config-action-icon" />
                删除
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除档案</AlertDialogTitle>
                <AlertDialogDescription>
                  确定删除档案「{selectedProfile}」吗？此操作无法撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PopoverContent>
    </Popover>
  );
}
