/* BNEF Summit London — touchscreen kiosk settings.
   Everything event-staff might need to change lives in this one file.
   Per-kiosk overrides can also be passed in the URL, e.g.
     index.html?kiosk=registration           (sets the "You are here" marker)
     index.html?now=2026-10-19T10:30         (pretend it's that time — for testing)
     index.html?cursor=hide                  (hide the mouse pointer on the totem)
*/
window.KIOSK_CONFIG = {

  /* ---- Feedback ---------------------------------------------------------
     The QR code on the Feedback screen and attract loop points here.
     TODO: replace with the real survey link before the event. */
  feedbackUrl: 'https://example.com/bnef-london-2026-feedback',
  feedbackShortLabel: 'Scan to share your feedback',

  /* ---- Behaviour -------------------------------------------------------- */
  idleSeconds: 90,              // return to the attract screen after this long untouched
  dataRefreshMinutes: 5,        // re-fetch agenda/speakers this often
  nightlyReloadHour: 4,         // hard page reload at 04:00 to clear any drift

  /* ---- Event ------------------------------------------------------------- */
  eventName: 'BNEF Summit London',
  venueName: 'Royal Lancaster London',
  timezone: 'Europe/London',

  /* ---- Live data --------------------------------------------------------
     Tried first; if the call fails (CORS / offline) the kiosk falls back to
     the same-origin snapshot in data/, kept fresh by the GitHub Action. */
  api: {
    agenda: 'https://bbgevent.app/api/clients/bnef/events/bnef_summit_london_2026/agendas',
    speakers: 'https://bbgevent.app/api/clients/bnef/events/bnef_summit_london_2026/registrations?categoryType=Speaker',
    relationships: 'https://bbgevent.app/api/clients/bnef/events/bnef_summit_london_2026/content-relationships'
  },
  snapshot: {
    agenda: 'data/agenda.json',
    speakers: 'data/speakers.json',
    relationships: 'data/relationships.json'
  },

  /* ---- Rooms ------------------------------------------------------------
     The agenda API doesn't carry room names yet, so sessions are placed on
     the map by these rules. Zone ids refer to venue.floors[].zones below.
     If a session's "room" field is filled in on the event platform and
     matches a zone label (e.g. "Track 2", "Beech 1"), that wins. */
  rooms: {
    plenary: 'main-plenary',               // every stand-alone session
    networking: 'networking-lounge',       // coffee breaks, lunch, receptions
    registration: 'registration',          // sessions whose name starts "Registration"
    tracks: ['track-1', 'track-2', 'track-3']   // Track 1 / 2 / 3 of any breakout
  },

  /* ---- Venue map --------------------------------------------------------
     Floor artwork is from "BNEF London Map App_01.pdf", cropped per floor
     into assets/img/map/*.svg. Zones are invisible tap targets drawn over
     the artwork, in that SVG's own units (w × h below).
     label = floor tab text; name = full floor name shown on room details.
     kiosks: where each screen stands — pick one with ?kiosk=<name>. */
  venue: {
    defaultKiosk: 'registration',
    kiosks: {
      'registration': { floor: 'ground', x: 764, y: 492, label: 'You are here', labelX: 562, labelY: 408 }
    },
    floors: [
      {
        "id": "lower-ground",
        "label": "Lower ground",
        "name": "Lower Ground Floor",
        "image": "assets/img/map/lower-ground.svg",
        "w": 1000,
        "h": 685,
        "zones": [
          {
            "id": "track-1",
            "label": "Track 1",
            "x": 573,
            "y": 116,
            "w": 217,
            "h": 340,
            "kind": "room",
            "note": "Breakout track sessions and themed lunches"
          },
          {
            "id": "track-2",
            "label": "Track 2",
            "x": 358,
            "y": 116,
            "w": 215,
            "h": 340,
            "kind": "room",
            "note": "Breakout track sessions and themed lunches"
          },
          {
            "id": "track-3",
            "label": "Track 3",
            "x": 179,
            "y": 116,
            "w": 179,
            "h": 340,
            "kind": "room",
            "note": "Breakout track sessions"
          },
          {
            "id": "restrooms-lg",
            "label": "Restrooms",
            "x": 697,
            "y": 563,
            "w": 66,
            "h": 110,
            "kind": "facility",
            "note": "Stairs up to the ground floor"
          }
        ]
      },
      {
        "id": "ground",
        "label": "Ground",
        "name": "Ground Floor",
        "image": "assets/img/map/ground.svg",
        "w": 1000,
        "h": 885,
        "zones": [
          {
            "id": "main-plenary",
            "label": "Main Plenary",
            "x": 285,
            "y": 130,
            "w": 500,
            "h": 340,
            "kind": "stage",
            "note": "Main stage sessions"
          },
          {
            "id": "editorial",
            "label": "Editorial Interviews",
            "x": 33,
            "y": 130,
            "w": 153,
            "h": 340,
            "kind": "service"
          },
          {
            "id": "green-room",
            "label": "Green Room",
            "x": 186,
            "y": 130,
            "w": 99,
            "h": 129,
            "kind": "service",
            "note": "Speakers only"
          },
          {
            "id": "networking-lounge",
            "label": "BNEF Hub & Networking Lounge",
            "x": 130,
            "y": 485,
            "w": 390,
            "h": 360,
            "kind": "social",
            "note": "Breakfast, coffee breaks, lunch and receptions"
          },
          {
            "id": "registration",
            "label": "Registration",
            "x": 785,
            "y": 463,
            "w": 187,
            "h": 72,
            "kind": "service",
            "note": "Badge collection"
          },
          {
            "id": "charging",
            "label": "Charging Station",
            "x": 785,
            "y": 385,
            "w": 187,
            "h": 78,
            "kind": "service"
          },
          {
            "id": "cloakroom",
            "label": "Cloakroom",
            "x": 620,
            "y": 557,
            "w": 94,
            "h": 68,
            "kind": "service"
          },
          {
            "id": "help-desk",
            "label": "Help Desk",
            "x": 714,
            "y": 557,
            "w": 96,
            "h": 48,
            "kind": "service"
          },
          {
            "id": "stairs-track",
            "label": "Stairs to Track Rooms",
            "x": 549,
            "y": 572,
            "w": 68,
            "h": 116,
            "kind": "facility",
            "note": "Down to the lower ground floor \u00b7 Restrooms"
          },
          {
            "id": "stairs-meeting",
            "label": "Stairs to Meeting Rooms",
            "x": 707,
            "y": 609,
            "w": 85,
            "h": 73,
            "kind": "facility",
            "note": "Up to the first floor"
          }
        ]
      },
      {
        "id": "first",
        "label": "First",
        "name": "First Floor",
        "image": "assets/img/map/first.svg",
        "w": 980,
        "h": 680,
        "zones": [
          {
            "id": "beech-3",
            "label": "Beech 3 \u00b7 Partner Lounge",
            "x": 147,
            "y": 483,
            "w": 158,
            "h": 173,
            "kind": "social"
          },
          {
            "id": "beech-2",
            "label": "Beech 2",
            "x": 305,
            "y": 483,
            "w": 150,
            "h": 173,
            "kind": "room"
          },
          {
            "id": "beech-1",
            "label": "Beech 1",
            "x": 455,
            "y": 483,
            "w": 142,
            "h": 155,
            "kind": "room"
          },
          {
            "id": "cedar-1",
            "label": "Cedar 1",
            "x": 758,
            "y": 335,
            "w": 82,
            "h": 81,
            "kind": "room",
            "note": "Meeting room"
          },
          {
            "id": "cedar-2",
            "label": "Cedar 2",
            "x": 672,
            "y": 372,
            "w": 84,
            "h": 78,
            "kind": "room",
            "note": "Meeting room"
          },
          {
            "id": "willow-1",
            "label": "Willow 1",
            "x": 707,
            "y": 62,
            "w": 91,
            "h": 66,
            "kind": "room",
            "note": "Meeting room"
          },
          {
            "id": "willow-2",
            "label": "Willow 2",
            "x": 707,
            "y": 128,
            "w": 91,
            "h": 65,
            "kind": "room",
            "note": "Meeting room"
          },
          {
            "id": "willow-3",
            "label": "Willow 3",
            "x": 707,
            "y": 193,
            "w": 91,
            "h": 66,
            "kind": "room",
            "note": "Meeting room"
          }
        ]
      }
    ]
  }
};
