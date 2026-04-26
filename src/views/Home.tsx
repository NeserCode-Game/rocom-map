import MapContainer from "../components/map/MapContainer";
import CategoryFilter from "../components/map/CategoryFilter";

export default function Home() {
  return (
    <div className="view-home flex h-full">
      <div className="main-container">
        <CategoryFilter />
        <MapContainer />
      </div>
    </div>
  );
}
