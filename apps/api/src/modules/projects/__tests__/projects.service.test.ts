import { describe, expect, it } from 'vitest';
import { slugify, toProjectDto } from '../projects.service';
import type { ProjectRow } from '../../../db/schema';

describe('slugify', () => {
  it('produces lowercase kebab-case', () => {
    expect(slugify('Trace Back API')).toBe('trace-back-api');
  });

  it('collapses punctuation and repeated separators', () => {
    expect(slugify('  Checkout!!!  Service  v2  ')).toBe('checkout-service-v2');
  });

  it('strips accents via NFKD normalisation', () => {
    expect(slugify('Café Déploiement')).toBe('cafe-deploiement');
  });

  it('never returns an empty slug', () => {
    expect(slugify('***')).toBe('project');
  });

  it('truncates to 64 characters', () => {
    expect(slugify('a'.repeat(120)).length).toBe(64);
  });
});

describe('toProjectDto', () => {
  it('serialises timestamps to ISO strings', () => {
    const created = new Date('2026-01-02T03:04:05.000Z');
    const row: ProjectRow = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Demo',
      slug: 'demo',
      description: null,
      repositoryUrl: null,
      rowVersion: 3,
      createdBy: null,
      deletedAt: null,
      createdAt: created,
      updatedAt: created,
    };

    const dto = toProjectDto(row);
    expect(dto.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(dto.deletedAt).toBeNull();
    expect(dto.rowVersion).toBe(3);
  });
});
