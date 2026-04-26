/** 标点贡献者 */
export interface LocationAuthor {
  nickName: string;
  userId: string;
}

/** 游戏标点数据 */
export interface MapLocation {
  id: number;
  /** 纬度（WGS84 度） */
  latitude: number;
  /** 经度（WGS84 度） */
  longitude: number;
  /** 分类 ID（对应图标） */
  category_id: number;
  title: string;
  description: string;
  /** 封面图 URL */
  image?: string;
  /** 指示图 URL 列表 */
  images: string[];
  /** 视频链接 */
  video_url?: string;
  /** 贡献者 */
  author?: LocationAuthor;
  [key: string]: unknown;
}

/** 官方子分类 */
export interface SubCategory {
  /** categoryId 如 17310030001 */
  categoryId: number;
  /** 官方分类名称（运行时从 constants 填充） */
  name?: string;
  /** 该子分类下的标点数量（运行时计算） */
  count: number;
}

/** 官方分组（与官网一致） */
export interface MarkerGroup {
  /** 分组 key 如 "collect" */
  key: string;
  /** 官方分组名称 */
  label: string;
  /** 包含的 categoryId 列表 */
  categoryIds: number[];
  /** 该分组下所有标点总数（运行时计算） */
  count: number;
  /** 子分类列表（运行时构建） */
  subCategories: SubCategory[];
}