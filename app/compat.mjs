import { LANGUAGES } from './languages.mjs';

const studioLanguage = document.querySelector('#studioLanguage');
if (studioLanguage) {
  const repair = () => {
    const option = studioLanguage.options[0];
    if (!option) return;
    if (!option.value) option.value = LANGUAGES.find(([, name]) => name === option.textContent)?.[0] || 'es';
    if (!studioLanguage.value) studioLanguage.value = option.value;
  };
  new MutationObserver(repair).observe(studioLanguage, { childList: true });
  repair();
}
