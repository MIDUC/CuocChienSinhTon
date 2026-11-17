-- Tướng là một loại lính đặc biệt: chuyển các bản ghi type=general sang type=troop, đánh dấu props.unitClass = "general".
UPDATE "GameEntity"
SET "type" = 'troop',
    "data" = jsonb_set(jsonb_set("data", '{type}', '"troop"'), '{props,unitClass}', '"general"')
WHERE "type" = 'general';

-- Phần thưởng rương trỏ tới "general:<key>" đổi thành "troop:<key>"
UPDATE "GameEntity"
SET "data" = replace("data"::text, '"general:', '"troop:')::jsonb
WHERE "type" = 'chest' AND "data"::text LIKE '%"general:%';
