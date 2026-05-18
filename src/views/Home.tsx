import MapContainer from "../components/map/MapContainer";
import LeftPanel from "../components/map/LeftPanel";

export default function Home() {
  return (
    <div className="view-home">
      <div className="main-container">
        <LeftPanel />
        <div className="map-wrapper">
          <MapContainer />
          <div className="map-bottom-info">
            <span className="map-info-left">SIFT 匹配 · 灵动岛导航 · 坐标同步</span>
            <span className="map-info-right">rocom-map v0.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
