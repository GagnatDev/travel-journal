import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { server } from './src/__tests__/mocks/server.js';

// GitHub Actions runners are ~20-25x slower than local dev machines, which makes
// the default 1000ms findBy*/waitFor deadline too tight for tests that wait for
// an auth refresh → React Query enable → fetch → re-render chain. Bumping the
// async util timeout globally avoids having to sprinkle `{ timeout: 5000 }` on
// every assertion that happens to depend on that cascade.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no matchMedia implementation; polyfill it globally for all tests.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

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
  app: { name: 'Reisedagbok' },
  auth: {
    login: {
      title: 'Logg inn',
      emailLabel: 'E-post',
      emailPlaceholder: 'din@epost.no',
      passwordLabel: 'Passord',
      passwordPlaceholder: 'Ditt passord',
      submitButton: 'Logg inn',
      invalidCredentials: 'Ugyldig e-post eller passord',
      sessionExpired: 'Økten din har utløpt. Vennligst logg inn på nytt.',
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
  nav: { trips: 'Turer', admin: 'Admin', back: 'Gå tilbake' },
  common: {
    loading: 'Laster...',
    error: 'Det oppstod en feil',
    retry: 'Prøv igjen',
    save: 'Lagre',
    cancel: 'Avbryt',
    close: 'Lukk',
    delete: 'Slett',
    confirm: 'Bekreft',
    copy: 'Kopier',
    copied: 'Kopiert!',
    copyFailed: 'Kunne ikke kopiere',
  },
  media: {
    imageUnavailable: 'Bildet er ikke tilgjengelig',
  },
  language: { nb: 'Norsk', en: 'English' },
  menu: { openMenu: 'Åpne meny', theme: 'Mørk modus', language: 'Språk', profile: 'Profil' },
  notifications: {
    openPanel: 'Varsler',
    panelTitle: 'Varsler',
    closePanel: 'Lukk varselspanelet',
    empty: 'Du er à jour. Nye varsler dukker opp her.',
    dismiss: 'Fjern varsel',
    clearAll: 'Fjern alle',
    unreadBadge_one: '{{count}} ulest varsel',
    unreadBadge_other: '{{count}} uleste varsler',
    openTripSettings: 'Åpne innstillinger for denne turen',
    goToTrips: 'Gå til Mine turer',
    pushStatusHeading: 'Leveringsstatus for push',
    pushStatusSummary: 'Hvordan push-varsler når denne enheten',
    statusHeading: 'Denne enheten',
    serverHeading: 'Server',
    loadingServer: 'Sjekker om push er tilgjengelig…',
    serverAvailable:
      'Serveren er satt opp for Web Push. Med tillatelse i nettleseren og varsling slått på for turen kan du motta varsler om nye innlegg.',
    serverUnavailable:
      'Push er ikke konfigurert på denne serveren, så varsler om nye innlegg kan ikke leveres før driftsmiljøet legger inn Web Push (VAPID-nøkler).',
    serverError:
      'Klarte ikke å bekrefte om push er tilgjengelig. Varsler kan mangle inntil denne sjekken lykkes.',
    deviceGranted: 'Nettleservarsler er tillatt på denne enheten.',
    deviceDefault:
      'Nettleservarsler er ikke tillatt ennå. Du kan tillate dem når du slår på varsler i turinnstillingene, eller fra nettleserens nettstedinnstillinger for denne appen.',
    item: {
      tripNewEntry: {
        title: '{{authorName}} la til et nytt innlegg',
        body: '{{entryTitle}} · {{tripName}}',
      },
      releaseAnnouncement: {
        title: 'Travel Journal er oppdatert til {{version}}',
        body: 'En ny versjon er klar. Last siden på nytt for å få de siste forbedringene.',
        updateAction: 'Oppdater nå',
      },
      privateMessage: {
        title: 'Ny melding fra {{fromUserName}}',
        body: '{{preview}}',
        openAction: 'Åpne samtalen',
      },
    },
  },
  profile: {
    title: 'Profil',
    displayNameLabel: 'Kallenavn',
    editButton: 'Rediger',
    saveButton: 'Lagre',
    cancelButton: 'Avbryt',
    emailLabel: 'E-post',
    logoutButton: 'Logg ut',
  },
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
      circleTitle: 'Utforskernes krets',
      inviteButton: 'INVITER NYTT MEDLEM',
      membersCountSuffix: 'TOTALT',
      privacyTitle: 'PERSONVERNINNSTILLINGER',
      privacyPublic: 'Hele kretsen',
      privacyPrivate: 'Privat dagbok',
      allowContributorInvites: 'La bidragsytere invitere andre',
      notificationsNewEntriesToggle: 'Varsle meg når nye innlegg publiseres i denne turen',
      notificationsUnsupported: 'Denne nettleseren støtter ikke push-varsler.',
      notificationsDenied:
        'Push-varsler er blokkert. Aktiver varsler i nettleserinnstillingene for å slå dette på.',
      notificationsPermissionRequired: 'Tillat varsler i nettleseren for å aktivere denne innstillingen.',
      collaborativeChaptersTitle: 'Samarbeidskapitler',
      collaborativeChaptersInfo: 'Medlemmer kan skrive innlegg sammen og dele minner.',
    },
    nav: { timeline: 'Tidslinje', map: 'Kart', settings: 'Innstillinger', addEntry: 'Legg til innlegg' },
  },
  storyMode: {
    toggle: 'Slå på/av historiemodus',
    day: 'Dag',
    dayLabel: 'Dag {{number}} — {{date}}',
  },
  map: {
    title: 'Kart',
    noLocations: 'Ingen innlegg med plassering ennå. Legg til plassering når du oppretter et innlegg.',
    viewEntry: 'Se innlegg',
    mapboxTokenMissingTitle: 'Kartet kan ikke vises',
    mapboxTokenMissingDev:
      'Legg til VITE_MAPBOX_TOKEN (Mapbox public token) i miljøfilen for klienten, for eksempel packages/client/.env, og start Vite på nytt.',
    mapboxTokenMissingStaging:
      'Klientbygget mangler VITE_MAPBOX_TOKEN. Legg tokenet i hemmeligheter/variabler for staging-bygget.',
    mapboxTokenMissingProd:
      'Karttjenesten er ikke konfigurert for denne installasjonen. Ta kontakt med den som drifter appen.',
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
    draft: 'Kladd',
    sectionLabel: 'Siste nytt fra reisen',
    loadError: 'Kunne ikke laste innlegg.',
    retryLoad: 'Prøv igjen',
    tripNameFallback: 'Reise',
    moreOptions: 'Flere valg',
    saveEntry: 'LAGRE INNLEGG',
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
  reactions: {
    label: 'Reaksjoner',
  },
  comments: {
    add: 'Publiser',
    placeholder: 'Skriv en kommentar…',
    delete: 'Slett',
    hide: 'Skjul kommentarer',
    empty: 'Ingen kommentarer ennå.',
    count_one: '{{count}} kommentar',
    count_other: '{{count}} kommentarer',
    count_zero: 'Legg til kommentar',
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
