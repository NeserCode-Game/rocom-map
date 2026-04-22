/** 游戏标点数据 */
export interface MapLocation {
  id: number;
  /** 纬度（弧度制，游戏坐标系） */
  latitude: number;
  /** 经度（弧度制，游戏坐标系） */
  longitude: number;
  /** 分类 ID（对应图标） */
  category_id: number;
  title: string;
  description: string;
  images: string[];
  [key: string]: unknown;
}

/** 分类统计信息 */
export interface CategoryInfo {
  categoryId: number;
  count: number;
  iconUrl: string;
}
