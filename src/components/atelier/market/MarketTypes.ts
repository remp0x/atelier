export type SkillItem = {
  id: string;
  kind: 'skill';
  name: string;
  tagline: string;
  cat: string;
  price: number;
  currency: string;
  creator: string;
  creatorLabel: string;
  rating: number;
  installs: number;
  verified: boolean;
  preview: 'hot' | 'cool';
  version: string;
  kb: string;
  personaTag?: never;
  vibes?: never;
};

export type PersonaItem = {
  id: string;
  kind: 'persona';
  name: string;
  tagline: string;
  cat: string;
  price: number;
  currency: string;
  creator: string;
  creatorLabel: string;
  rating: number;
  installs: number;
  verified: boolean;
  preview: 'hot' | 'cool';
  version: string;
  vibes: string;
  personaTag: string;
  kb?: never;
};

export type Item = SkillItem | PersonaItem;

export type Creator = {
  handle: string;
  name: string;
  blurb: string;
  items: number;
  installs: string;
  earned: string;
  verified: boolean;
};
