Kiosk tap analytics -> Google Sheet
===================================

1. Create a new Google Sheet (e.g. "BNEF Summit kiosk taps").
2. Extensions > Apps Script. Delete the sample code, paste in apps-script.gs, Save.
3. Deploy > New deployment > type "Web app".
     Execute as:       Me
     Who has access:   Anyone
   Click Deploy, authorise with your Google account, copy the Web app URL
   (ends in /exec).
4. Paste that URL into analyticsUrl in assets/js/config.js, commit and push.
5. Give each kiosk its own name in its URL, e.g. index.html?kiosk=registration
   (that also sets the map's "You are here" marker).

Rows land in the "Taps" tab within ~30 seconds of a tap.

Columns
  Time (London)     when the tap happened on the kiosk
  Kiosk             the ?kiosk= name
  Visit             one ID per visit (from leaving the welcome screen until it returns)
  Step              order of the tap within the visit
  Event             visit_start, open_screen, open_session, open_speaker, open_sponsor,
                    map_room, find_on_map, filter, close_popup, popup_back, tap, visit_end
  Item / Item ID    what was tapped (session title, speaker name, sponsor, room...)
  Visit length (s)  on visit_end rows: how long the visit lasted (idle wait excluded)
  Test              "yes" when sent from a test/rehearsal URL (?now=, #demo, localhost)

If you change the script later, use Deploy > Manage deployments > Edit > New version
so the URL stays the same.
