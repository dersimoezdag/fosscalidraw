import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const resources = {
  en: {
    translation: {
      back: "Back",
      boardUntitled: "Untitled Board",
      boardViewOnly: "View only",
      boardOnline: "{{count}} online",
      share: "Share",
      shareBoard: "Share board",
      closeShareDialog: "Close share dialog",
      boardLink: "Board link",
      copy: "Copy",
      linkCopied: "Link copied",
      guestAccess: "Guest access",
      guestPrivate: "No guest access",
      guestView: "Anyone with link can view",
      guestEdit: "Anyone with link can edit",
      guestAccessUpdated: "Guest access updated",
      guestAccessUpdateFailed: "Could not update guest access",
      inviteByEmail: "Invite by email",
      emailPlaceholder: "person@example.com",
      editor: "Editor",
      viewer: "Viewer",
      invite: "Invite",
      memberInvited: "Member invited",
      memberInviteFailed: "Could not invite member",
    },
  },
  de: {
    translation: {
      back: "Zurueck",
      boardUntitled: "Unbenanntes Board",
      boardViewOnly: "Nur ansehen",
      boardOnline: "{{count}} online",
      share: "Teilen",
      shareBoard: "Board teilen",
      closeShareDialog: "Teilen-Dialog schliessen",
      boardLink: "Board-Link",
      copy: "Kopieren",
      linkCopied: "Link kopiert",
      guestAccess: "Gastzugriff",
      guestPrivate: "Kein Gastzugriff",
      guestView: "Jeder mit Link kann ansehen",
      guestEdit: "Jeder mit Link kann bearbeiten",
      guestAccessUpdated: "Gastzugriff aktualisiert",
      guestAccessUpdateFailed: "Gastzugriff konnte nicht aktualisiert werden",
      inviteByEmail: "Per E-Mail einladen",
      emailPlaceholder: "person@example.com",
      editor: "Bearbeiter",
      viewer: "Betrachter",
      invite: "Einladen",
      memberInvited: "Mitglied eingeladen",
      memberInviteFailed: "Mitglied konnte nicht eingeladen werden",
    },
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: navigator.language.toLowerCase().startsWith("de") ? "de" : "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
