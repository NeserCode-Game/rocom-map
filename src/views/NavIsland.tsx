import { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

export default function NavIsland() {
  const win = useRef(getCurrentWindow());
  const [title, setTitle] = useState<string | null>(null);
  const [angle, setAngle] = useState(0);
  const [dist, setDist] = useState(0);
  const [refB64, setRefB64] = useState<string | null>(null);
  const [dotX, setDotX] = useState(50);
  const [dotY, setDotY] = useState(50);

  useEffect(() => {
    document.documentElement.classList.add("navisland-window");
    return () => document.documentElement.classList.remove("navisland-window");
  }, []);

  useEffect(() => {
    const onPtrDown = () => win.current.startDragging();
    window.addEventListener("pointerdown", onPtrDown);
    return () => window.removeEventListener("pointerdown", onPtrDown);
  }, []);

  useEffect(() => {
    const unlisten = listen<{ title: string | null; angle: number; dist: number; refB64: string | null; dotX: number; dotY: number }>("nav-data", (e) => {
      setTitle(e.payload.title);
      setAngle(e.payload.angle);
      setDist(e.payload.dist);
      setRefB64(e.payload.refB64);
      setDotX(e.payload.dotX);
      setDotY(e.payload.dotY);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div className="navisland-root">
      <div className="navisland-main">
        <div className="navisland-left">
          <div className="navisland-arrow" style={{ transform: `rotate(${angle}deg)` }}>
            <svg width="20" height="20" viewBox="0 0 20 20">
              <polygon points="10,0 6,12 10,10 14,12" className="fill-emerald-400/90" />
            </svg>
          </div>
          <div className="navisland-info">
            {title ? (
              <>
                <span className="navisland-distance">{dist}m</span>
                <span className="navisland-name">{title}</span>
              </>
            ) : (
              <span className="navisland-empty">—</span>
            )}
          </div>
        </div>
        {refB64 && (
          <div className="navisland-ref-wrap">
            <img className="navisland-ref-img" src={`data:image/png;base64,${refB64}`} alt="" />
            <div className="navisland-player-dot" />
            <div className="navisland-target-dot" style={{ left: `${dotX}%`, top: `${dotY}%` }} />
          </div>
        )}
      </div>
      <div className="navisland-hotkeys">F9 标记完成 · F10 撤销</div>
    </div>
  );
}
