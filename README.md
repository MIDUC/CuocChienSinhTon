# Cuộc Chiến Sinh Tồn

Game chiến thuật thủ thành trên bản đồ lưới ô vuông (hiển thị 2D isometric, góc nhìn cố định), chơi trên web và app.

Phần đã có: **server + database + trang admin** để quản lý toàn bộ dữ liệu và hình ảnh game (công trình, lính & tướng, quái, tài nguyên, rương, địa hình, cây & vật trang trí, cổ vật, trang bị), mỗi loại có nhiều cấp, mỗi cấp có chỉ số và ảnh riêng.

## Cấu trúc

```
server/   NestJS + Prisma + PostgreSQL — API dữ liệu game, upload ảnh, sinh prompt vẽ ảnh, ảnh SVG tạm
admin/    Trang admin (React + Vite), chạy ở /admin
data/     Dữ liệu game dạng file: mỗi thực thể 1 file JSON
  buildings/  troops/  monsters/  resources/  chests/  terrains/  decorations/  artifacts/  equipments/
  art-style.json   phong cách chung để sinh prompt vẽ ảnh
assets/   Ảnh đã upload, theo <loại>/<key>/lv<cấp>-<thời gian>.png
```

Trong PostgreSQL, mỗi thực thể là **một bản ghi JSON riêng** (bảng `GameEntity`, cột `data` kiểu JSONB). Thư mục `data/` là bản sao dạng file để dễ sửa / review trên git:

- `npm run db:seed` — nạp file trong `data/` vào DB (thêm `-- --prune` để xoá bản ghi không còn file)
- `npm run db:export` hoặc nút **Xuất ra file JSON** trên admin — ghi DB ngược ra `data/`

## Chạy local

Cần Node 20+ và PostgreSQL 16 (hoặc Docker).

```bash
npm install
npm run db:up                         # bật Postgres bằng Docker (bỏ qua nếu đã có Postgres)
cp server/.env.example server/.env    # sửa DATABASE_URL nếu cần
npm run db:migrate                    # tạo bảng
npm run db:seed                       # nạp dữ liệu mẫu
npm run dev:server                    # API: http://localhost:3000
npm run dev:admin                     # Admin: http://localhost:5173/admin/
```

Bản build: `npm run build` rồi `npm start -w server` — server phục vụ luôn trang admin tại `http://localhost:3000/admin/`.

Đặt `ADMIN_TOKEN` trong `server/.env` khi đưa lên server thật; admin sẽ hỏi mã này trước khi cho sửa.

## Trang admin

- Danh sách theo loại, tìm kiếm, thêm / sửa / xoá.
- Thuộc tính cố định (kích thước ô, lính xuất ra, tài nguyên sản xuất…).
- Bảng **chỉ số theo cấp** (dòng = chỉ số, cột = cấp), thêm/xoá cấp, tự điền các cấp theo % tăng.
- Chi phí xây / nâng cấp theo tài nguyên; phần thưởng của rương theo cấp.
- **Kích thước & đường đi** của công trình: chiếm `footprintW` × `footprintH` ô (nhà lính 2×2, tường 1×1, cổng 3×1). Cờ đường đi: `blocksPath`, `friendlyPassable` (cổng), `enemyPassable`, `standable` (tường). Lính có `canClimbWalls` (cung thủ) đứng được trên tường, nhận `wallRangeBonus` / `wallDamagePct`. Quái có `pathMode`: `avoid` (đi vòng, chỉ phá tường khi không còn lối), `smash`, `fly`.
- **Tướng là một loại lính đặc biệt** (`troop` với `props.unitClass = "general"`). Nhà sinh tướng chỉ sinh đúng 1 đơn vị.
- **Lính đóng quân** (nhà lính, trường bắn, nhà tướng…): chọn loại lính, số lính tối đa theo cấp nhà (chọn nhanh 1/3/6/9/16), cấp của lính, đội hình đứng chờ (vây quanh / xếp khối), cách ra đánh khi quái vào vùng bao phủ, xem trước đội hình trên lưới isometric. Thuật toán xếp chỗ đứng ở `admin/src/formation.ts` để game dùng lại.
  - Lính chết là mất, không tự hồi sinh. Tạo lại lính tại nhà: chi phí 1 lính (`levels[].trainCost`), thời gian tạo 1 lính (`stats.trainTimeSec`), số lính tạo cùng lúc (`stats.trainQueue`).
  - Chỉ số lính ghi ngay trên nhà, theo từng cấp nhà (`levels[].troopStats`); ô trống thì dùng chỉ số trong mục Lính.
  - Điểm đóng quân: bật/tắt cho người chơi chọn (`rallySelectable`), điểm mặc định (`rallyX`, `rallyY`, tính bằng ô so với tâm nhà). Phạm vi (`rallyZone`): lính `cover` = chỉ trong vùng bao phủ của nhà; tướng `territory` = mọi nơi trong lãnh thổ, vùng phát hiện địch đi theo chỗ tướng đứng.
  - Cổ vật: số ô trang bị 1–10 (`artifactSlots`), cấp nhà mở từng ô (`artifactSlotUnlocks`, ví dụ `2,4,5,7,8`; cấp 1 chưa mở ô nào nếu không có số 1). Điểm cộng khi lên cấp (`levels[].stats.statPoints`) và giá trị mỗi điểm cho từng chỉ số được phép cộng (`statPointValues`, ví dụ `hp:20,damage:3`).
- **Vật phẩm** (Cổ vật, Trang bị) có trang tổng quan dạng bảng (lọc theo độ hiếm, vị trí):
  - Cổ vật: trang bị vào ô cổ vật của nhà lính, cộng chỉ số cho lính của nhà đó (số thường = cộng thẳng, đuôi `Pct` = cộng %).
  - Trang bị: mặc cho tướng (riêng từng tướng) và lính (cả đội trong một nhà dùng chung), vị trí vũ khí / giáp / mũ / giày / nhẫn, có thể thuộc một bộ.
  - Mỗi cấp có **công dụng đặc biệt** riêng (`levels[].effects`): hút máu, chí mạng, sát thương lan, làm chậm, choáng, thiêu đốt, độc, đẩy lùi, phá giáp, phản đòn, khiên, hồi máu, hào quang, né đòn, hồi sinh 1 lần, thêm vàng. Danh sách công dụng ở `server/src/entities/definitions.ts` (`EFFECT_TYPES`).
- **Ảnh theo cấp**: upload / thay / xoá (kéo thả được). Chưa có ảnh thì dùng ảnh SVG isometric tạm.
- **Prompt vẽ ảnh** cho từng cấp (bản chung cho Leonardo / Stable Diffusion / ChatGPT, bản Midjourney, negative prompt) kèm kích thước ảnh đề xuất, nút Copy. Phong cách chung sửa ở trang *Phong cách & prompt chung*.

## API chính

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/api/game-data` | Toàn bộ dữ liệu game theo loại (cho game client) |
| GET | `/api/meta` | Các loại dữ liệu, chỉ số gợi ý |
| GET/POST | `/api/entities` | Danh sách (`?type=building`) / tạo mới |
| GET/PUT/DELETE | `/api/entities/:id` | Xem kèm prompt / sửa / xoá |
| POST/DELETE | `/api/entities/:id/levels/:level/image` | Upload (form field `file`) / xoá ảnh của cấp |
| GET | `/api/art/placeholder/:type/:key/:level.svg` | Ảnh SVG tạm |
| GET/PUT | `/api/settings/art-style` | Phong cách vẽ chung |
