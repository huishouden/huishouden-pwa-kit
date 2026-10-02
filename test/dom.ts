// A DOM for element tests; imported before the module under test so its custom elements register.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (typeof document === 'undefined') GlobalRegistrator.register({ url: 'https://baby.example.com/' });
export { GlobalRegistrator };
