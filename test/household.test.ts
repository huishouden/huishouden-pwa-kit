import { describe, expect, test } from 'bun:test';
import { normalizeEmail, pendingMembers, toHousehold } from '../src/household';

describe('household helpers', () => {
  test('emails are compared lowercase and trimmed, matching the rules', () => {
    expect(normalizeEmail('  Someone@Example.COM ')).toBe('someone@example.com');
  });

  test('toHousehold tolerates missing fields from older documents', () => {
    expect(toHousehold('h1', { members: ['a@example.com'] })).toEqual({
      id: 'h1', name: 'Household', members: ['a@example.com'], joined: [], createdAt: 0,
    });
  });

  test('pending members are invited but not yet signed in', () => {
    const h = toHousehold('h1', { members: ['a@example.com', 'b@example.com'], joined: ['a@example.com'] });
    expect(pendingMembers(h)).toEqual(['b@example.com']);
  });
});
