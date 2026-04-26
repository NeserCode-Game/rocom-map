import MapContainer from "../components/map/MapContainer";
import CategoryFilter from "../components/map/CategoryFilter";

export default function Home() {
  return (
    <div className="view-home">
      <div className="main-container">
        <CategoryFilter />
        <MapContainer />
      </div>
    </div>
  );
}
