import { describe, expect, it, test } from 'bun:test';
import { normalizeEmail, pendingMembers, pickHousehold, toHousehold } from '../src/household';

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


const doc = (id: string, createdAt: number, pending = false) => ({ id, data: { name: id, members: ['a@example.com'], createdAt }, pending });

describe('pickHousehold', () => {
  it('picks the oldest household so every app agrees', () => {
    expect(pickHousehold([doc('newer', 20), doc('older', 10)])?.id).toBe('older');
  });
  it('breaks ties by id', () => {
    expect(pickHousehold([doc('b', 10), doc('a', 10)])?.id).toBe('a');
  });
  it('skips households the server has not accepted yet', () => {
    expect(pickHousehold([doc('local', 1, true), doc('saved', 5)])?.id).toBe('saved');
    expect(pickHousehold([doc('local', 1, true)])).toBeNull();
  });
  it('returns null for no households', () => {
    expect(pickHousehold([])).toBeNull();
  });
});
