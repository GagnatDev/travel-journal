import '@testing-library/jest-dom';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { server } from './src/__tests__/mocks/server.js';

const nb = {
  auth: {
    login: {
      title: 'Logg inn',
      emailLabel: 'E-post',
      emailPlaceholder: 'din@epost.no',
      passwordLabel: 'Passord',
      passwordPlaceholder: 'Ditt passord',
      submitButton: 'Logg inn',
      invalidCredentials: 'Ugyldig e-post eller passord',
    },
    register: {
      title: 'Opprett administratorkonto',
      emailLabel: 'E-post',
      displayNameLabel: 'Visningsnavn',
      displayNamePlaceholder: 'Ditt navn',
      passwordLabel: 'Passord',
      submitButton: 'Opprett konto',
    },
    errors: {
      emailRequired: 'E-post er påkrevd',
      passwordRequired: 'Passord er påkrevd',
      displayNameRequired: 'Visningsnavn er påkrevd',
    },
  },
  invite: {
    accept: {
      title: 'Fullfør registreringen',
      expiredError:
        'Denne invitasjonen har utløpt eller er allerede brukt. Kontakt personen som sendte den.',
      displayNameLabel: 'Visningsnavn',
      passwordLabel: 'Passord',
      submitButton: 'Opprett konto',
      passwordMinLength: 'Passordet må ha minst 8 tegn',
    },
  },
  nav: { trips: 'Turer', admin: 'Admin' },
  common: {
    loading: 'Laster...',
    error: 'Det oppstod en feil',
    save: 'Lagre',
    cancel: 'Avbryt',
    delete: 'Slett',
    confirm: 'Bekreft',
  },
  language: { nb: 'Norsk', en: 'English' },
};

i18n.use(initReactI18next).init({
  lng: 'nb',
  fallbackLng: 'nb',
  resources: { nb: { translation: nb } },
  interpolation: { escapeValue: false },
});

// Global MSW lifecycle — shared across all test files
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
beforeEach(() => server.resetHandlers()); // reset BEFORE each test so each starts clean
afterAll(() => server.close());
