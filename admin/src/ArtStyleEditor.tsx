import { useEffect, useState } from 'react';
import { api } from './api';
import { copyText, toast } from './toast';
import type { ArtStyle } from './types';

export default function ArtStyleEditor() {
  const [style, setStyle] = useState<ArtStyle | null>(null);
  const [saved, setSaved] = useState<ArtStyle | null>(null);

  useEffect(() => {
    api.artStyle().then((s) => {
      setStyle(s);
      setSaved(s);
    });
  }, []);

  if (!style) return <div className="muted">Đang tải…</div>;
  const dirty = JSON.stringify(style) !== JSON.stringify(saved);
  const set = (p: Partial<ArtStyle>) => setStyle({ ...style, ...p });

  return (
    <div className="editor">
      <div className="page-head">
        <h1>🎨 Phong cách & prompt chung</h1>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => api.artStyleDefault().then(setStyle)}>
          Khôi phục mặc định
        </button>
        <button
          className="btn primary"
          disabled={!dirty}
          onClick={() =>
            api
              .saveArtStyle(style)
              .then((s) => {
                setStyle(s);
                setSaved(s);
                toast('Đã lưu phong cách. Prompt của mọi thực thể đã cập nhật.');
              })
              .catch((e) => toast(e.message, 'error'))
          }
        >
          Lưu
        </button>
      </div>
      <section className="panel">
        <p className="muted">
          Đoạn phong cách này được ghép vào prompt của <b>mọi</b> công trình, lính, tướng, quái, tài nguyên và rương để toàn bộ ảnh đồng
          bộ: 2D isometric, góc nhìn cố định, ô vuông xoay chéo, màu tươi kiểu low-poly như ảnh tham khảo. Prompt viết bằng tiếng Anh vì
          các công cụ tạo ảnh hiểu tiếng Anh tốt nhất.
        </p>
        <div className="form-grid">
          <label className="full">
            Phong cách (style)
            <textarea rows={6} value={style.style} onChange={(e) => set({ style: e.target.value })} />
          </label>
          <label className="full">
            Negative prompt (những thứ không muốn có)
            <textarea rows={3} value={style.negative} onChange={(e) => set({ negative: e.target.value })} />
          </label>
          <label>
            Tham số Midjourney thêm vào cuối
            <input value={style.midjourneyParams} onChange={(e) => set({ midjourneyParams: e.target.value })} />
          </label>
          <label>
            Bề ngang 1 ô trên bản đồ (px)
            <input type="number" value={style.tileWidth} onChange={(e) => set({ tileWidth: Number(e.target.value) })} />
            <small>
              Ô vuông xoay chéo có tỉ lệ 2:1 → 1 ô = {style.tileWidth}×{style.tileWidth / 2}px trong game. Kích thước ảnh đề xuất tính từ
              số này.
            </small>
          </label>
        </div>
      </section>
      <section className="panel tips">
        <h2>Mẹo để ảnh đồng bộ</h2>
        <ul>
          <li>
            Tạo 1 ảnh ưng ý nhất (ví dụ Thành chính cấp 1) rồi dùng nó làm ảnh tham chiếu phong cách: Midjourney dùng <code>--sref &lt;link ảnh&gt;</code>,
            Leonardo dùng <i>Style Reference</i>. Có thể thêm vào ô “Tham số Midjourney”.
          </li>
          <li>Midjourney không xuất nền trong suốt: tạo với nền trắng rồi tách nền (Leonardo có tuỳ chọn Transparent PNG, hoặc dùng remove.bg).</li>
          <li>Giữ đế hình thoi của công trình sát đáy ảnh và rộng đúng bề ngang ảnh để đặt lên lưới khớp nhau.</li>
          <li>Các cấp của cùng một công trình nên tạo liên tiếp với cùng seed / ảnh tham chiếu để giữ hình dáng, chỉ thay độ hoành tráng.</li>
        </ul>
        <button className="btn" onClick={() => copyText(`${style.style}\nNegative: ${style.negative}`)}>
          ⧉ Copy phong cách
        </button>
      </section>
    </div>
  );
}
