import { useState, useEffect, useRef } from "react";
import { Settings, Download, Upload, Trash2, Save } from "lucide-react";
import { useMapStore } from "../../composables/useMapStore";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";

interface Profile { name: string; visibleCategories: number[]; collapsedGroups: string[]; completedLocations?: number[]; savedAt: string; }
const STORAGE_KEY = "rocom-map:profiles";
const LAST_PROFILE_KEY = "rocom-map:last-profile";

function loadProfiles(): Profile[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; } }
function saveProfiles(profiles: Profile[]): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); }

export function ConfigPanel() {
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const locations = useMapStore((s) => s.locations);
  const completedLocations = useMapStore((s) => s.completedLocations);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [saveName, setSaveName] = useState("");
  const [openPopover, setOpenPopover] = useState(false);

  useEffect(() => {
    const loaded = loadProfiles();
    setProfiles(loaded);
    const last = localStorage.getItem(LAST_PROFILE_KEY);
    if (last && loaded.some((p) => p.name === last)) {
      setSelectedProfile(last); setSaveName(last);
      const prof = loaded.find((p) => p.name === last);
      if (prof) {
        useMapStore.setState({
          visibleCategories: new Set(prof.visibleCategories),
          collapsedGroups: new Set(prof.collapsedGroups ?? []),
        });
        useMapStore.getState().loadCompleted(prof.completedLocations ?? []);
      }
    }
  }, []);

  // auto-save on completed change
  const autoSaveRef = useRef(false);
  useEffect(() => {
    if (!autoSaveRef.current) { autoSaveRef.current = true; return; }
    if (!selectedProfile) return;
    const state = useMapStore.getState();
    const next = profiles.filter((p) => p.name !== selectedProfile);
    next.push({ name: selectedProfile, visibleCategories: [...state.visibleCategories], collapsedGroups: [...state.collapsedGroups], completedLocations: [...state.completedLocations], savedAt: new Date().toISOString() });
    saveProfiles(next); setProfiles(next);
  }, [completedLocations]);

  function getValidCids() { return new Set(locations.map((l) => l.category_id)); }

  function handleSelect(name: string) {
    setSelectedProfile(name); setSaveName(name);
    if (!name) { localStorage.removeItem(LAST_PROFILE_KEY); return; }
    const prof = profiles.find((p) => p.name === name);
    if (!prof) return;
    localStorage.setItem(LAST_PROFILE_KEY, name);
    useMapStore.setState({
      visibleCategories: new Set(prof.visibleCategories),
      collapsedGroups: new Set(prof.collapsedGroups ?? []),
    });
    useMapStore.getState().loadCompleted(prof.completedLocations ?? []);
  }

  function handleSave() {
    const name = saveName.trim(); if (!name) return;
    const state = useMapStore.getState();
    const next = profiles.filter((p) => p.name !== name);
    next.push({ name, visibleCategories: [...visibleCategories], collapsedGroups: [...state.collapsedGroups], completedLocations: [...state.completedLocations], savedAt: new Date().toISOString() });
    saveProfiles(next); setProfiles(next); setSelectedProfile(name);
    localStorage.setItem(LAST_PROFILE_KEY, name);
  }

  function handleDelete() {
    if (!selectedProfile) return;
    const next = profiles.filter((p) => p.name !== selectedProfile);
    saveProfiles(next); setProfiles(next); setSelectedProfile(""); setSaveName("");
    localStorage.removeItem(LAST_PROFILE_KEY);
  }

  async function handleExport() {
    try {
      const defName = selectedProfile || "custom";
      const fp = await save({ defaultPath: `rocom-map-profile-${defName}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!fp) return;
      const state = useMapStore.getState();
      const data = { version: 1, name: selectedProfile || "未命名", visibleCategories: [...visibleCategories], collapsedGroups: [...state.collapsedGroups], completedLocations: [...state.completedLocations], exportedAt: new Date().toISOString() };
      await writeFile(fp, new TextEncoder().encode(JSON.stringify(data, null, 2)));
    } catch (e) { console.error("导出失败:", e); }
  }

  async function handleImport() {
    try {
      const fp = await open({ filters: [{ name: "JSON", extensions: ["json"] }], multiple: false });
      if (!fp) return;
      const content = await readFile(fp as string);
      const text = new TextDecoder().decode(content);
      const data = JSON.parse(text);
      if (!Array.isArray(data.visibleCategories)) return;
      const name = data.name?.trim() || `导入 ${new Date().toLocaleDateString("zh-CN")}`;
      const next = profiles.filter((p) => p.name !== name);
      next.push({ name, visibleCategories: data.visibleCategories, collapsedGroups: data.collapsedGroups ?? [], completedLocations: data.completedLocations ?? [], savedAt: data.exportedAt ?? new Date().toISOString() });
      saveProfiles(next); setProfiles(next); setSelectedProfile(name); setSaveName(name);
      localStorage.setItem(LAST_PROFILE_KEY, name);
      const allCids = getValidCids();
      useMapStore.setState({ visibleCategories: new Set(data.visibleCategories.filter((c: number) => allCids.has(c))), collapsedGroups: new Set(data.collapsedGroups ?? []) });
      useMapStore.getState().loadCompleted(data.completedLocations ?? []);
      setOpenPopover(false);
    } catch (e) { console.error("导入失败:", e); }
  }

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="config-trigger-btn" title="配置"><Settings className="config-trigger-icon" /></Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8} className="config-popover-content">
        <div className="config-section">
          <p className="config-label">选择档案</p>
          <Select value={selectedProfile} onValueChange={handleSelect}>
            <SelectTrigger className="config-select-trigger"><SelectValue placeholder="选择档案…" /></SelectTrigger>
            <SelectContent>
              {profiles.length === 0 && <SelectItem value="__p__" disabled>暂无保存的档案</SelectItem>}
              {profiles.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Separator className="config-sep" />
        <div className="config-section">
          <p className="config-label">新建档案</p>
          <div className="config-save-row">
            <input type="text" placeholder="输入档案名称" value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} className="config-input" />
            <Button size="sm" variant="outline" onClick={handleSave} disabled={!saveName.trim()} className="config-save-btn"><Save className="config-action-icon" /></Button>
          </div>
        </div>
        <Separator className="config-sep" />
        <div className="config-actions">
          <Button size="sm" variant="outline" onClick={handleExport} className="config-action-btn"><Download className="config-action-icon" />导出</Button>
          <Button size="sm" variant="outline" onClick={handleImport} className="config-action-btn"><Upload className="config-action-icon" />导入</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={!selectedProfile} className="config-action-btn"><Trash2 className="config-action-icon" />删除</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>确认删除档案</AlertDialogTitle><AlertDialogDescription>确定删除档案「{selectedProfile}」吗？此操作无法撤销。</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>确认删除</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PopoverContent>
    </Popover>
  );
}
