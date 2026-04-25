import MapContainer from '../components/map/MapContainer';
import CategoryFilter from '../components/map/CategoryFilter';
import { Card, CardContent } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="view-home flex items-center justify-center gap-3 p-4">
      <Card className="map-card">
        <CardContent className="p-0 w-full h-full relative">
          <MapContainer />
        </CardContent>
      </Card>
      <CategoryFilter />
    </div>
  );
}