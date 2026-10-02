import { describe, expect, it, test } from 'bun:test';
import { normalizeEmail, pendingMembers, pickHousehold, toHousehold } from '../src/household';

describe('household helpers', () => {
  test('emails are compared lowercase and trimmed, matching the rules', () => {
    expect(normalizeEmail('  Someone@Example.COM ')).toBe('someone@example.com');
  });

  test('toHousehold tolerates missing fields from older documents', () => {
    expect(toHousehold('h1', { members: ['a@example.com'] })).toEqual({
      id: 'h1', name: 'Household', members: ['a@example.com'], joined: [], roles: {}, createdAt: 0,
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
  it("keeps a household the person has joined ahead of an older invitation they never acted on", () => {
    // Anyone can add an email to their own household; that must not move the person out of theirs.
    const mine = { id: 'mine', data: { name: 'Ours', members: ['a@example.com', 'b@example.com'], joined: ['a@example.com'], createdAt: 50 } };
    const stranger = { id: 'stranger', data: { name: 'Home', members: ['m@example.com', 'a@example.com'], joined: ['m@example.com'], createdAt: 0 } };
    expect(pickHousehold([stranger, mine], 'A@Example.com')?.id).toBe('mine');
    expect(pickHousehold([stranger, mine], 'b@example.com')?.id).toBe('stranger');
    expect(pickHousehold([stranger, mine])?.id).toBe('stranger');
  });
  it('picks the oldest joined household when the person has joined several', () => {
    const joined = (id: string, createdAt: number) => ({ id, data: { name: id, members: ['a@example.com'], joined: ['a@example.com'], createdAt } });
    expect(pickHousehold([joined('newer', 20), doc('invite', 1), joined('older', 10)], 'a@example.com')?.id).toBe('older');
  });
  it('returns null for no households', () => {
    expect(pickHousehold([])).toBeNull();
  });
});
