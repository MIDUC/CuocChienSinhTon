import { EntityData, EntityTypeKey, LevelData, footprint } from '../entities/definitions';

/** Phong cách chung cho mọi ảnh. Lưu trong bảng Setting (key "artStyle"), sửa được trên trang admin. */
export interface ArtStyle {
  /** Đoạn mô tả phong cách đặt sau chủ thể */
  style: string;
  /** Những thứ KHÔNG muốn có trong ảnh */
  negative: string;
  /** Tham số thêm vào cuối prompt Midjourney */
  midjourneyParams: string;
  /** Kích thước 1 ô vuông trên bản đồ khi xoay isometric (px, tỉ lệ 2:1) */
  tileWidth: number;
}

export const DEFAULT_ART_STYLE: ArtStyle = {
  style:
    'isometric 2D game asset for a medieval fantasy strategy / city-builder game, ' +
    'stylized low-poly 3D render look, bright saturated colors, lush green grass, soft warm sunlight from the top-left, ' +
    'soft ambient occlusion, clean readable silhouette, chunky toy-like proportions, ' +
    'fixed isometric camera (45° rotation, ~30° elevation), single object centered, fully visible, ' +
    'consistent scale and perspective across the whole asset set, isolated on a plain solid white background',
  negative:
    'text, letters, watermark, logo, UI, frame, border, cropped, cut off, multiple objects, background scenery, ' +
    'perspective camera, top-down view, side view, photorealistic, blurry, noisy, dark, gritty, hexagon tiles',
  midjourneyParams: '--style raw --s 150 --v 6.1',
  tileWidth: 128,
};

/** Ảnh nhìn từ trên xuống theo góc chéo nên mỗi loại có khung hình/kích thước gợi ý khác nhau */
export interface SizeSpec {
  width: number;
  height: number;
  /** Giải thích bằng tiếng Việt cho người vẽ */
  note: string;
}

function numProp(e: EntityData, k: string, fallback: number) {
  const v = Number(e.props[k]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function recommendedSize(e: EntityData, style: ArtStyle): SizeSpec {
  const tw = style.tileWidth; // 1 ô = tw × tw/2 khi xoay chéo
  switch (e.type) {
    case 'building': {
      const fp = footprint(e);
      // đế hình thoi của khối w×h ô rộng (w+h)/2 ô theo bề ngang; xuất @2x cho nét trên điện thoại
      const w = tw * (fp.w + fp.h);
      const square = fp.w === fp.h;
      const hgt = square ? w : Math.round(w * 0.75);
      return {
        width: w,
        height: hgt,
        note:
          `Công trình ${fp.w}×${fp.h} ô${square ? '' : ' (hình chữ nhật, cạnh dài chạy chéo xuống bên phải)'}. ` +
          `Đế rộng đúng bề ngang ảnh (${w}px), nằm sát đáy ảnh; phần nhà cao lên phía trên. ` +
          `PNG nền trong suốt, xuất @2x (trong game hiển thị ${w / 2}×${hgt / 2}).`,
      };
    }
    case 'troop':
    case 'monster': {
      const n = numProp(e, 'size', 1);
      const w = tw * 2 * n;
      return {
        width: w,
        height: w,
        note:
          `Nhân vật đứng trong 1 ô${n > 1 ? ` (to gấp ${n})` : ''}, chân chạm 1/4 dưới ảnh, quay mặt về phía dưới-trái (góc isometric). ` +
          `PNG nền trong suốt. Sau này có thể làm sprite sheet 8 hướng cùng kích thước khung.`,
      };
    }
    case 'resource':
      return {
        width: 256,
        height: 256,
        note: 'Biểu tượng tài nguyên dùng trên thanh tài nguyên và phần thưởng. PNG nền trong suốt, vật thể chiếm ~80% khung.',
      };
    case 'terrain': {
      const w = tw * 2;
      return {
        width: w,
        height: w,
        note:
          `Một ô địa hình hình thoi (tỉ lệ 2:1) rộng đúng ${w}px, cao ${w / 2}px mặt trên + phần bề dày đất bên dưới; ` +
          `đặt sát đáy ảnh, phần trống phía trên để trong suốt. Mép ô phải liền mạch để ghép các ô cạnh nhau. Xuất @2x.`,
      };
    }
    case 'decoration': {
      const n = numProp(e, 'size', 1);
      const w = tw * 2 * n;
      return {
        width: w,
        height: w,
        note: `Vật thể đứng trên ${n}×${n} ô, gốc/chân nằm ở 1/4 dưới ảnh, KHÔNG vẽ ô đất bên dưới (game ghép với ô địa hình). PNG nền trong suốt, xuất @2x.`,
      };
    }
    case 'equipment':
    case 'artifact':
      return {
        width: 256,
        height: 256,
        note: 'Biểu tượng cổ vật hiển thị trong ô trang bị và kho đồ. PNG nền trong suốt, vật phẩm chiếm ~80% khung, hơi nghiêng góc isometric.',
      };
    case 'chest':
      return {
        width: 384,
        height: 384,
        note: 'Rương đặt chéo góc isometric, nắp đóng. PNG nền trong suốt, rương chiếm ~70% khung, chừa chỗ cho hiệu ứng phát sáng.',
      };
  }
}

const GENERAL_FRAMING = 'a single heroic general character, full body, larger and more ornate than a normal soldier, confident pose';

const TYPE_FRAMING: Record<EntityTypeKey, string> = {
  building: 'a building that stands on a {size} grass tile footprint, shown as an isometric base',
  troop: 'a single soldier unit character, full body, standing in an idle combat pose',
  monster: 'a single monster enemy character, full body, menacing but cute stylized proportions',
  resource: 'a game resource icon',
  chest: 'a closed treasure chest game item',
  terrain: 'a single seamless isometric ground tile (2:1 diamond top face with a thin soil side), tileable edges, nothing standing on it',
  equipment: 'a single fantasy RPG equipment item icon ({slot}), slightly tilted in isometric view',
  artifact: 'a single magical ancient artifact item icon, slightly tilted in isometric view, with a soft magical glow',
  decoration: 'a single map decoration object standing on the ground, no ground tile under it',
};

function progression(level: LevelData, max: number) {
  if (max <= 1) return '';
  if (level.level === 1) return `level 1 of ${max}: the simplest, smallest and most humble version`;
  if (level.level === max) return `level ${level.level} of ${max}: the final, grandest, most ornate and imposing version`;
  return `level ${level.level} of ${max}: noticeably bigger and more upgraded than level ${level.level - 1}`;
}

export interface LevelPrompt {
  level: number;
  /** Prompt dùng chung (Leonardo, Stable Diffusion, DALL·E, Ideogram...) */
  prompt: string;
  /** Negative prompt (cho Leonardo / Stable Diffusion) */
  negative: string;
  /** Prompt viết sẵn cho Midjourney (đã gồm --ar và --no) */
  midjourney: string;
  size: SizeSpec;
}

export function buildPrompts(e: EntityData, style: ArtStyle): LevelPrompt[] {
  const size = recommendedSize(e, style);
  const max = e.levels.length;
  const fp = footprint(e);
  const framing = (e.type === 'troop' && e.props.unitClass === 'general' ? GENERAL_FRAMING : TYPE_FRAMING[e.type]).replace('{size}', fp.w === fp.h ? `${fp.w}x${fp.h} square` : `${fp.w}x${fp.h} long rectangular`).replace('{slot}', String(e.props.slot ?? 'item'));
  const subject = e.artSubject.trim() || e.name;

  return e.levels.map((lv) => {
    const parts = [
      `${framing}: ${subject}`,
      progression(lv, max),
      lv.artNote.trim(),
      style.style,
    ].filter(Boolean);
    const prompt = parts.join(', ').replace(/\s+/g, ' ');
    const ar = size.width === size.height ? '1:1' : `${size.width}:${size.height}`;
    const midjourney = `${prompt} --ar ${ar} --no ${style.negative.split(',').slice(0, 8).map((s) => s.trim()).join(', ')} ${style.midjourneyParams}`.trim();
    return { level: lv.level, prompt, negative: style.negative, midjourney, size };
  });
}
