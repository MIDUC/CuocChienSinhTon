export type EntityType = 'building' | 'troop' | 'general' | 'monster' | 'resource' | 'chest';

export interface Reward {
  item: string;
  min: number;
  max: number;
  chance: number;
}

export interface LevelData {
  level: number;
  stats: Record<string, number>;
  cost: Record<string, number>;
  rewards?: Reward[];
  image: string | null;
  artNote: string;
}

export interface EntityData {
  key: string;
  type: EntityType;
  name: string;
  description: string;
  artSubject: string;
  props: Record<string, string | number | boolean>;
  levels: LevelData[];
}

export interface SizeSpec {
  width: number;
  height: number;
  note: string;
}

export interface LevelPrompt {
  level: number;
  prompt: string;
  negative: string;
  midjourney: string;
  size: SizeSpec;
}

export interface EntityView extends EntityData {
  id: string;
  updatedAt: string;
  prompts: LevelPrompt[];
  placeholders: string[];
}

export interface EntitySummary {
  id: string;
  type: EntityType;
  key: string;
  name: string;
  levelCount: number;
  image: string | null;
  placeholder: string;
}

export interface FieldDef {
  key: string;
  label: string;
  hint?: string;
}

export interface TypeDef {
  type: EntityType;
  label: string;
  folder: string;
  icon: string;
  stats: FieldDef[];
  props: FieldDef[];
  hasCost: boolean;
  hasRewards: boolean;
}

export interface Meta {
  types: TypeDef[];
  authRequired: boolean;
}

export interface ArtStyle {
  style: string;
  negative: string;
  midjourneyParams: string;
  tileWidth: number;
}
