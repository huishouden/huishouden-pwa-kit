import { afterEach, describe, expect, test } from 'bun:test';
import { setLangForTests } from '../src/i18n';
import { DIET_LABELS, dietLabel, spiceLabel } from '../src/food';
import { PlaceSearchUnavailable } from '../src/places';
import { PhotoError, fitPhoto } from '../src/photo';

afterEach(() => setLangForTests('en'));

describe('food, photo and place text follows the language', () => {
  test('diet and heat labels; the English constants stay English', async () => {
    expect(dietLabel('nut allergy')).toBe('Nut allergy');
    await setLangForTests('es');
    expect(dietLabel('gluten-free')).toBe('Sin gluten');
    expect(spiceLabel('hot')).toBe('Le encanta el picante');
    await setLangForTests('nl');
    expect(dietLabel('vegetarian')).toBe('Vegetarisch');
    expect(spiceLabel('none')).toBe('Niet pittig');
    expect(DIET_LABELS.vegetarian).toBe('Vegetarian');
  });

  test('errors people see are worded in the language', async () => {
    await setLangForTests('nl');
    expect(new PlaceSearchUnavailable(null).message).toBe('De gratis kaartdienst is druk of niet bereikbaar');
    await setLangForTests('es');
    const error = await fitPhoto(async () => null).then(
      () => null,
      (e: unknown) => e,
    );
    // WebP fails, then JPEG fails: the browser can't make it smaller.
    expect(error).toBeInstanceOf(PhotoError);
    expect((error as PhotoError).message).toBe('Este navegador no puede reducir fotos.');
  });
});
