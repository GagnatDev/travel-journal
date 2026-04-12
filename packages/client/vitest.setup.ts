import '@testing-library/jest-dom';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { server } from './src/__tests__/mocks/server.js';

// jsdom has no Blob URL implementation; AuthenticatedImage uses createObjectURL after fetch.
if (typeof URL.createObjectURL !== 'function') {
  const blobRef = new Map<string, Blob>();
  let seq = 0;
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    if (!(obj instanceof Blob)) {
      throw new TypeError('createObjectURL polyfill only supports Blob in tests');
    }
    const url = `blob:http://localhost:3000/test-blob-${++seq}`;
    blobRef.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    blobRef.delete(url);
  };
}

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
      displayNamePlaceholder: 'Ditt navn',
      passwordLabel: 'Passord',
      submitButton: 'Opprett konto',
      passwordMinLength: 'Passordet må ha minst 8 tegn',
    },
  },
  admin: {
    title: 'Adminpanel',
    accessDenied: 'Tilgang nektet. Kun for admins.',
    tabs: { users: 'Brukere', invites: 'Invitasjoner' },
    invite: {
      emailLabel: 'E-post',
      roleLabel: 'App-rolle',
      submitButton: 'Opprett invitasjon',
      linkLabel: 'Invitasjonslenke',
      copyButton: 'Kopier',
      linkCopied: 'Kopiert!',
      pendingTitle: 'Ventende invitasjoner',
      revokeButton: 'Trekk tilbake',
      noInvites: 'Ingen ventende invitasjoner.',
      roles: { creator: 'Oppretter', follower: 'Følger' },
      expiry: 'Utløper',
    },
    users: {
      title: 'Alle brukere',
      promoteButton: 'Forfrem til oppretter',
      noUsers: 'Ingen brukere funnet.',
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
    copy: 'Kopier',
    copied: 'Kopiert!',
    copyFailed: 'Kunne ikke kopiere',
  },
  language: { nb: 'Norsk', en: 'English' },
  trips: {
    dashboard: {
      title: 'Mine turer',
      createButton: 'Opprett tur',
      emptyState: 'Du har ingen turer ennå.',
      statusGroup: { active: 'Aktive', planned: 'Planlagte', completed: 'Fullførte' },
    },
    role: { creator: 'Oppretter', contributor: 'Bidragsyter', follower: 'Følger' },
    status: { planned: 'Planlagt', active: 'Aktiv', completed: 'Fullført' },
    create: {
      title: 'Opprett tur',
      nameLabel: 'Turnavn',
      namePlaceholder: 'Hvor skal du?',
      descriptionLabel: 'Beskrivelse',
      descriptionPlaceholder: 'Valgfri beskrivelse',
      departureDateLabel: 'Avreisedato',
      returnDateLabel: 'Returdato',
      submitButton: 'Opprett tur',
      nameRequired: 'Turnavn er påkrevd',
    },
    settings: {
      title: 'Turinnstillinger',
      detailsTitle: 'Turdetaljer',
      statusTitle: 'Statusadministrasjon',
      markActive: 'Merk som aktiv',
      markCompleted: 'Merk som fullført',
      reopen: 'Gjenåpne',
      deleteButton: 'Slett tur',
      deleteConfirmTitle: 'Slette turen?',
      deleteConfirmMessage: 'Denne handlingen kan ikke angres.',
      notCreatorRedirect: 'Kun turoppretter har tilgang til innstillingene.',
      membersTitle: 'Medlemmer',
      addMemberTitle: 'Legg til medlem',
      addMemberPlaceholder: 'E-post eller kallenavn',
      addMemberButton: 'Legg til',
      addMemberRoleLabel: 'Turrolle',
      memberAdded: 'Medlem lagt til!',
      inviteLinkGenerated: 'Invitasjonslenke generert',
      copyLink: 'Kopier lenke',
      linkCopied: 'Kopiert!',
      pendingInvitesTitle: 'Ventende invitasjoner',
      revokeInviteButton: 'Trekk tilbake',
      removeButton: 'Fjern',
      removeConfirmTitle: 'Fjerne medlemmet?',
    },
    nav: { timeline: 'Tidslinje', map: 'Kart', settings: 'Innstillinger', addEntry: 'Legg til innlegg' },
  },
  storyMode: {
    toggle: 'Slå på/av historiemodus',
    day: 'Dag',
    dayLabel: 'Dag {{number}} — {{date}}',
  },
  offline: {
    banner: 'Du er frakoblet — innlegg synkroniseres når du er tilkoblet igjen',
    saved: 'Lagret frakoblet — synkroniseres når du er tilkoblet igjen',
    syncing: '{{count}} innlegg venter på synkronisering',
    synced: 'Alle innlegg er synkronisert',
    conflict: 'Versjonen din ble ikke lagret — noen andre redigerte dette innlegget',
  },
  entries: {
    emptyState: 'Ingen innlegg ennå. Vær den første til å poste!',
    newTitle: 'Nytt innlegg',
    editTitle: 'Rediger innlegg',
    titleLabel: 'Tittel',
    titlePlaceholder: 'Hva skjedde?',
    titleRequired: 'Tittel er påkrevd',
    contentLabel: 'Innhold',
    contentPlaceholder: 'Fortell historien din...',
    locationToggle: 'Legg til plassering',
    locationNamePlaceholder: 'Stednavn (valgfritt)',
    edit: 'Rediger',
    delete: 'Slett',
    deleteConfirm: 'Slette dette innlegget?',
    discardConfirm: 'Forkaste ulagrede endringer?',
    addPhotos: 'Legg til bilder',
    uploadingImage: 'Laster opp...',
    imageLimit: 'Maks 10 bilder',
    removeImage: 'Fjern bilde',
  },
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
