import { TileLayer } from 'react-leaflet';
import { TILE_URL_TEMPLATE } from '../../lib/map/constants';

/**
 * 游戏瓦片层。
 *
 * 官方 URL 格式为 {z}/{y}_{x}.png（y 在前，x 在后，下划线分隔），
 * 与标准 Leaflet 的 {x}/{y} 斜杠格式不同，但 L.tileLayer 的模板替换
 * 机制支持任意 {x}/{y}/{z} 排列，所以直接传入即可。
 */
export default function GameTileLayer() {
  return (
    <TileLayer
      url={TILE_URL_TEMPLATE}
      maxZoom={13}
      minZoom={9}
      tileSize={256}
      noWrap={true}
    />
  );
}
