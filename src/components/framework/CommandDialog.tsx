"use client";

import * as React from "react";
import { Home, Settings, Crosshair, RefreshCcw } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useThrottleFn } from "ahooks";

import { NavigatorContext } from "@/App";
import { useI18n } from "@/composables";

export default function CommandMenu() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const { navigator } = React.useContext(NavigatorContext);

  const down = useThrottleFn(
    (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    },
    { wait: 1000 }
  );
  React.useEffect(() => {
    document.addEventListener("keydown", down.run);
    return () => document.removeEventListener("keydown", down.run);
  }, []);

  function handleCommandSelect(command: string) {
    const [symbol, value] = command.split("::");

    if (symbol === "navigate") navigator(value);
    if (symbol === "reload") {
      navigator("/");
      window.location.reload();
    }

    /* Dialog close */
    setOpen(false);
  }

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("Command.placeholder")} />
        <CommandList>
          <CommandEmpty>{t("Command.notFound")}</CommandEmpty>
          <CommandGroup heading={t("Command.suggestions")}>
            <CommandItem
              value="reload"
              onSelect={handleCommandSelect}
              keywords={["reload", "refresh", "重新加载", "刷新"]}
            >
              <RefreshCcw />
              <span>{t("Command.suggestions.reload")}</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t("Command.turnto")}>
            <CommandItem
              value="navigate::/"
              onSelect={handleCommandSelect}
              keywords={["home", "index", "首页", "主页"]}
            >
              <Home />
              <span>{t("Command.turnto.home")}</span>
              <CommandShortcut>⌘H</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="navigate::/settings"
              onSelect={handleCommandSelect}
              keywords={["settings", "设置", "配置", "选项", "preferences"]}
            >
              <Settings />
              <span>{t("Command.turnto.settings")}</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="navigate::/navigator"
              onSelect={handleCommandSelect}
              keywords={["navigator", "navigate", "导航", "定位", "小地图"]}
            >
              <Crosshair />
              <span>{t("Command.turnto.navigator")}</span>
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
