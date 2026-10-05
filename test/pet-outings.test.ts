import { describe, expect, test } from 'bun:test';
import { everyTimes, outingId, outingSlots } from '../src/pet-outings';

const meals = [
  { id: 'pm', petId: 'theo', name: 'Dinner ', time: '18:00' },
  { id: 'am', petId: 'theo', name: 'Breakfast', time: '08:00' },
  { id: 'x', petId: 'other', name: 'AM', time: '09:00' },
];

describe('pet outings: the slots and ids every writer shares', () => {
  test('with meals: one per meal of the pet, earliest first, with the meal name', () => {
    expect(outingSlots({ petId: 'theo', mode: 'meals' }, meals)).toEqual([
      { key: 'meal-am', time: '08:00', meal: 'Breakfast' },
      { key: 'meal-pm', time: '18:00', meal: 'Dinner' },
    ]);
  });

  test('set times: distinct, sorted, at most 8; every few hours within waking hours; none while off', () => {
    expect(outingSlots({ petId: 'theo', mode: 'times', times: ['18:00', '07:30', '18:00', 'noon'] }, meals)).toEqual([
      { key: 't-0730', time: '07:30' },
      { key: 't-1800', time: '18:00' },
    ]);
    expect(outingSlots({ petId: 'theo', mode: 'times', times: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00'] }, meals)).toHaveLength(8);
    expect(everyTimes(4, '07:00', '21:00')).toEqual(['07:00', '11:00', '15:00', '19:00']);
    expect(everyTimes(3, '06:30', '12:30')).toEqual(['06:30', '09:30', '12:30']);
    expect(everyTimes(1, '00:00', '23:59')).toHaveLength(24);
    expect(outingSlots({ petId: 'theo', mode: 'every' }, meals).map((s) => s.time)).toEqual(['07:00', '11:00', '15:00', '19:00']);
    expect(outingSlots({ petId: 'theo', on: false, mode: 'meals' }, meals)).toEqual([]);
    expect(outingSlots(undefined, meals)).toEqual([]);
  });

  test("an outing's id names the pet, the day and the slot", () => {
    expect(outingId('theo', '2031-05-14', 'meal-am')).toBe('out-theo-2031-05-14-meal-am');
  });
});
