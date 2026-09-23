/* BNEF Summit London — touchscreen kiosk.
   Plain JS, no build step. Reads settings from assets/js/config.js and event
   data from the same bbgevent.app APIs as the Summit site (falling back to
   the data/*.json snapshot the GitHub Action keeps fresh).

   Session <-> speaker join: content-relationships rows where
   left.type === 'Session' and right.type === 'Speaker'; right.categoryId is
   the role (speaker / moderator / presentations). Same as the main site. */

(function () {
  'use strict';

  var C = window.KIOSK_CONFIG;
  var params = new URLSearchParams(location.search);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = {
    slots: [],          // every agenda slot, time-sorted
    days: [],           // ['2026-10-19', '2026-10-20']
    sessionById: {},
    slotBySessionId: {},
    credits: {},        // sessionId -> {speaker:[], moderator:[], presentations:[]}
    sessionsByPerson: {},
    view: 'home',
    day: null,
    floor: null,
    zone: null,
    sheetStack: []
  };

  var ROLE_ORDER = ['moderator', 'speaker', 'presentations'];
  var ROLE_LABEL = { speaker: 'Speakers', moderator: 'Moderator', presentations: 'Presenting' };
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var ICON = {
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    cup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/></svg>'
  };

  /* ================= time (event wall-clock) =================
     Times are handled as "wall-clock milliseconds": the event's local time
     written as if it were UTC. That way "2026-10-19T09:00" compares directly
     with the kiosk's London clock regardless of the device timezone. */

  function wallFromIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
    return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
  }
  var tzFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: C.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function realWallNow() {
    var p = {};
    tzFmt.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  }
  var nowOffset = 0;
  // ?now=2026-10-19T11:55 (or #demo, which also works in hosted previews) rehearses at a set time.
  var nowParam = params.get('now') || (location.hash === '#demo' ? '2026-10-19T11:55' : '');
  if (nowParam) {
    var fake = wallFromIso(nowParam);
    if (!isNaN(fake)) nowOffset = fake - realWallNow();
  }
  function now() { return realWallNow() + nowOffset; }

  function d(ms) { return new Date(ms); }
  function dayKey(ms) { return d(ms).toISOString().slice(0, 10); }
  function fmtTime(ms) {
    var h = d(ms).getUTCHours(), m = d(ms).getUTCMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  function fmtClock(ms) {
    var h = d(ms).getUTCHours(), m = d(ms).getUTCMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fmtDayLong(ms) { return DAY_NAMES[d(ms).getUTCDay()] + ' ' + d(ms).getUTCDate() + ' ' + MONTHS[d(ms).getUTCMonth()]; }
  function fmtDayShort(ms) { return DAY_NAMES[d(ms).getUTCDay()].slice(0, 3); }

  /* ================= helpers ================= */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  // Avatar markup; a broken/missing photo is swapped for initials (see onImgError).
  function avatar(person) {
    if (person.photo) {
      return '<img class="av" src="' + esc(person.photo) + '" alt="" data-initials="' + esc(initials(person.name)) + '"' +
        (person.photoRemote && person.photoRemote !== person.photo ? ' data-remote="' + esc(person.photoRemote) + '"' : '') + '>';
    }
    return '<span class="av">' + esc(initials(person.name)) + '</span>';
  }
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (img && img.tagName === 'IMG' && img.classList.contains('av')) {
      var remote = img.getAttribute('data-remote');
      if (remote) { img.removeAttribute('data-remote'); img.src = remote; return; }
      var span = document.createElement('span');
      span.className = img.className;
      span.textContent = img.getAttribute('data-initials') || '';
      img.replaceWith(span);
    }
  }, true);

  // Speaker bios come from the event platform as HTML; keep only simple text formatting.
  function cleanHtml(html) {
    var doc = new DOMParser().parseFromString(html || '', 'text/html');
    var ok = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, UL: 1, OL: 1, LI: 1 };
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 1) {
          walk(n);
          if (!ok[n.tagName]) { n.replaceWith.apply(n, Array.prototype.slice.call(n.childNodes)); }
          else { Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); }); }
        } else if (n.nodeType !== 3) { n.remove(); }
      });
    })(doc.body);
    return doc.body.innerHTML;
  }

  // Bundled files (inlined as data: URIs in the single-file preview build).
  function asset(path) { return (window.KIOSK_ASSETS && window.KIOSK_ASSETS[path]) || path; }

  // Speaker photos are saved locally as assets/img/speakers/<file id>.jpg so the
  // kiosk doesn't depend on the photo server. New speakers added later have no
  // local copy yet: the live URL is used, then initials.
  function localPhoto(url) {
    var m = /\/Avatar\/([0-9a-f]+)\.(?:jpe?g|png|webp)/i.exec(url || '');
    if (!m) return url;
    var path = 'assets/img/speakers/' + m[1] + '.jpg';
    if (window.KIOSK_ASSETS) return window.KIOSK_ASSETS[path] || url;
    return path;
  }

  function isBreak(s) {
    var t = s.tags || [];
    return t.indexOf('label:Networking') !== -1 || t.indexOf('sessionType:break') !== -1;
  }

  /* ================= venue lookups ================= */

  var zoneIndex = {};
  C.venue.floors.forEach(function (f) {
    f.zones.forEach(function (z) { zoneIndex[z.id] = { zone: z, floor: f }; });
  });

  function roomFor(session, trackOrder) {
    // A real room name from the API wins if it matches a zone label.
    var raw = (session.room || '').trim();
    if (raw) {
      var hit = Object.keys(zoneIndex).filter(function (id) {
        return zoneIndex[id].zone.label.toLowerCase() === raw.toLowerCase();
      })[0];
      return hit ? { id: hit, label: zoneIndex[hit].zone.label } : { id: null, label: raw };
    }
    var id;
    if (trackOrder != null) id = C.rooms.tracks[trackOrder];
    else if (/^registration/i.test(session.name.trim())) id = C.rooms.registration;
    else if (isBreak(session)) id = C.rooms.networking;
    else id = C.rooms.plenary;
    return id && zoneIndex[id] ? { id: id, label: zoneIndex[id].zone.label } : null;
  }

  /* ================= data ================= */

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function load(key) {
    if (window.KIOSK_DATA && window.KIOSK_DATA[key]) return Promise.resolve(window.KIOSK_DATA[key]);
    return fetchJson(C.api[key]).catch(function () { return fetchJson(C.snapshot[key]); });
  }

  function person(reg) {
    var p = (reg && reg.profile) || {};
    return {
      id: reg.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim(),
      company: p.company || '',
      jobTitle: p.job_title || '',
      photo: localPhoto((p.profile_picture && p.profile_picture.absoluteUrl) || ''),
      photoRemote: (p.profile_picture && p.profile_picture.absoluteUrl) || '',
      bioHtml: (p.bio && p.bio.html) || ''
    };
  }

  function buildModel(agendas, regs, rels) {
    var agenda = agendas.filter(function (a) { return a.id === 'main'; })[0] || agendas[0];
    var items = agenda.items || [];
    var regIndex = {};
    regs.forEach(function (r) { if (!r.profile || r.profile.profile_visible !== false) regIndex[r.id] = r; });

    // credits
    var credits = {}, byPerson = {};
    rels.forEach(function (rel) {
      if (!rel.left || !rel.right || rel.left.type !== 'Session' || rel.right.type !== 'Speaker') return;
      var reg = regIndex[rel.right.contentId];
      if (!reg) return;
      var role = ROLE_ORDER.indexOf(rel.right.categoryId) !== -1 ? rel.right.categoryId : 'speaker';
      var b = credits[rel.left.contentId] || (credits[rel.left.contentId] = { speaker: [], moderator: [], presentations: [] });
      b[role].push({ order: rel.right.order || 0, p: person(reg) });
      (byPerson[reg.id] = byPerson[reg.id] || []).push(rel.left.contentId);
    });
    Object.keys(credits).forEach(function (k) {
      ROLE_ORDER.forEach(function (r) {
        credits[k][r] = credits[k][r].sort(function (a, b) { return a.order - b.order; }).map(function (x) { return x.p; });
      });
    });

    var sessions = items.filter(function (i) { return i.type === 'Session'; });
    var tracks = items.filter(function (i) { return i.type === 'BreakoutTrack'; });
    var breakouts = items.filter(function (i) { return i.type === 'Breakout'; });
    var trackById = {};
    tracks.forEach(function (t) { trackById[t.id] = t; });

    var slots = [];
    var sessionById = {};

    function mkSession(s, track) {
      var ss = {
        raw: s,
        id: s.id,
        title: s.name.trim(),
        subtitle: (s.subtitle || '').trim(),
        synopsis: (s.synopsisMd || '').trim(),
        start: wallFromIso(s.localStart),
        end: wallFromIso(s.localEnd),
        isBreak: isBreak(s),
        isPlenary: (s.tags || []).indexOf('label:Plenary') !== -1,
        track: track ? {
          order: track.order || 0,
          name: track.name.trim(),
          topic: track.name.replace(/^\s*Track\s*\d+\s*:?\s*/i, '').trim()
        } : null
      };
      ss.room = roomFor(s, track ? (track.order || 0) : null);
      sessionById[ss.id] = ss;
      return ss;
    }

    sessions.filter(function (s) { return !s.trackId; }).forEach(function (s) {
      var ss = mkSession(s, null);
      slots.push({ kind: ss.isBreak ? 'break' : 'session', start: ss.start, end: ss.end, sessions: [ss] });
    });
    breakouts.forEach(function (b) {
      var bs = sessions
        .filter(function (s) { return s.trackId && trackById[s.trackId] && trackById[s.trackId].breakoutId === b.id; })
        .map(function (s) { return mkSession(s, trackById[s.trackId]); })
        .sort(function (a, c) { return a.track.order - c.track.order; });
      slots.push({ kind: 'breakout', title: b.name.trim().replace(/\s+/g, ' '), start: wallFromIso(b.localStart), end: wallFromIso(b.localEnd), sessions: bs });
    });

    slots.sort(function (a, b) { return a.start - b.start || (a.kind === 'breakout' ? 1 : -1); });

    // Zero-length items (e.g. "Networking Lunch 13:10–13:10") run until the next thing starts.
    slots.forEach(function (sl, i) {
      if (!(sl.end > sl.start)) {
        var next = slots.slice(i + 1).filter(function (x) { return x.start > sl.start && dayKey(x.start) === dayKey(sl.start); })[0];
        sl.end = next ? next.start : sl.start + 15 * 60000;
        sl.sessions.forEach(function (s) { s.end = sl.end; });
        sl.openEnded = true;
      }
      sl.day = dayKey(sl.start);
      sl.index = i;
    });

    var slotBySessionId = {};
    slots.forEach(function (sl) { sl.sessions.forEach(function (s) { slotBySessionId[s.id] = sl; }); });

    var days = [];
    slots.forEach(function (sl) { if (days.indexOf(sl.day) === -1) days.push(sl.day); });

    state.slots = slots;
    state.days = days.sort();
    state.sessionById = sessionById;
    state.slotBySessionId = slotBySessionId;
    state.credits = credits;
    state.sessionsByPerson = byPerson;
  }

  function peopleOn(sessionId) {
    var c = state.credits[sessionId];
    if (!c) return [];
    var out = [];
    ROLE_ORDER.forEach(function (r) { c[r].forEach(function (p) { out.push(p); }); });
    return out;
  }

  function slotsNow(t) { return state.slots.filter(function (s) { return s.start <= t && t < s.end; }); }
  function slotsAfter(t) { return state.slots.filter(function (s) { return s.start > t; }); }

  /* ================= navigation ================= */

  function go(view) {
    state.view = view;
    $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === view); });
    $$('.dock__btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.go === view); });
    if (view === 'agenda') scrollAgendaToNow(false);
  }

  /* ================= clock ================= */

  function tick() {
    var t = now();
    $('#clock-time').textContent = fmtClock(t);
    $('#clock-date').textContent = fmtDayLong(t);
    $('#attract-clock').textContent = fmtClock(t);
  }

  /* ================= home ================= */

  function chipFor(s) {
    if (s.track) return '<span class="chip chip--t' + (s.track.order % 3 + 1) + '">Track ' + (s.track.order + 1) + (s.track.topic ? ' · ' + esc(s.track.topic) : '') + '</span>';
    if (s.isPlenary) return '<span class="chip chip--main">Main stage</span>';
    if (s.isBreak) return '<span class="chip">Networking</span>';
    return '<span class="chip">Session</span>';
  }

  function renderHome() {
    var t = now();
    var first = state.slots[0], last = state.slots[state.slots.length - 1];
    var nowList = $('#now-list'), nextList = $('#next-list');
    var html = '';
    var current = slotsNow(t);
    var upcoming = slotsAfter(t);

    if (t < first.start) {
      $('#now-heading').textContent = 'Happening now';
      $('#now-meta').textContent = '';
      current = [first];
      upcoming = upcoming.slice(1);
    } else if (t >= last.end) {
      $('#now-heading').textContent = 'Thank you for joining us';
      $('#now-meta').textContent = '';
    } else {
      $('#now-heading').textContent = 'Happening now';
      $('#now-meta').textContent = current.length ? '' : 'Between sessions';
    }

    if (t >= last.end) {
      html = '<p class="empty-note">BNEF Summit London 2026 has closed. We\'d love to hear how it went — tap <b>Share feedback</b> below.</p>';
    } else if (!current.length) {
      var nx = upcoming[0];
      html = '<p class="empty-note">Nothing is running right now. ' + (nx ? 'Next up at <b>' + fmtTime(nx.start) + '</b>' + (nx.day !== dayKey(t) ? ' on ' + fmtDayLong(nx.start) : '') + '.' : '') + '</p>';
    } else {
      var items = [];
      current.forEach(function (sl) { sl.sessions.forEach(function (s) { items.push({ s: s, sl: sl }); }); });
      // Prefer real sessions over a long-running break (e.g. lunch) when both are on.
      var real = items.filter(function (x) { return !x.s.isBreak; });
      if (real.length) items = real;
      var compact = items.length > 1;
      items.slice(0, 3).forEach(function (x) {
        var s = x.s, live = t >= x.sl.start;
        var pct = Math.max(0, Math.min(100, (t - s.start) / (s.end - s.start) * 100));
        html += '<button type="button" class="now-card' + (compact ? ' now-card--compact' : '') + '" data-session="' + esc(s.id) + '">' +
          '<span class="now-card__meta">' + (live ? '<span class="live">Live</span>' : '') +
          '<span>' + fmtTime(s.start) + ' – ' + fmtTime(s.end) + '</span>' + (s.track ? '<span>· Track ' + (s.track.order + 1) + '</span>' : '') + '</span>' +
          '<span class="now-card__title">' + esc(s.title) + '</span>' +
          (s.room ? '<span class="now-card__room">Location: ' + esc(s.room.label) + '</span>' : '') +
          '<span class="now-card__chev">' + ICON.chev + '</span>' +
          (live && !compact ? '<span class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></span>' : '') +
          '</button>';
      });
    }
    nowList.innerHTML = html;

    // Up next — flatten breakouts into one row that opens the agenda at that slot.
    var today = dayKey(t);
    var rows = upcoming.filter(function (sl) { return sl.kind !== 'break' || !/^summit close/i.test(sl.sessions[0].title); }).slice(0, 8);
    $('#next-heading').textContent = rows.length && rows[0].day !== today && t >= first.start ? 'Coming up ' + (DAY_NAMES[d(rows[0].start).getUTCDay()]) : 'Up next';
    nextList.innerHTML = rows.map(function (sl) {
      var timeLabel = fmtTime(sl.start);
      if (sl.kind === 'breakout') {
        return '<button type="button" class="next-row" data-slot="' + sl.index + '"><span class="next-row__time">' + timeLabel + '</span>' +
          '<span class="next-row__title">' + esc(sl.title.replace(/\s*[-–]\s*choose your track/i, '')) +
          '<span class="next-row__room">' + sl.sessions.length + ' parallel tracks · choose one</span></span>' + ICON.chev + '</button>';
      }
      var s = sl.sessions[0];
      return '<button type="button" class="next-row" data-session="' + esc(s.id) + '"><span class="next-row__time">' + timeLabel + '</span>' +
        '<span class="next-row__title">' + esc(s.title) + (s.room ? '<span class="next-row__room">' + esc(s.room.label) + '</span>' : '') + '</span>' + ICON.chev + '</button>';
    }).join('') || '<p class="empty-note">That\'s everything on the programme.</p>';
    // Show as many Up next rows as fit the space above the tiles, never a cut-off row.
    var block = nextList.parentNode;
    while (nextList.children.length > 1 && block.scrollHeight > block.clientHeight + 1) {
      nextList.removeChild(nextList.lastElementChild);
    }
  }

  /* ================= agenda ================= */

  function renderDayToggle() {
    $('#day-toggle').innerHTML = state.days.map(function (day, i) {
      var ms = wallFromIso(day + 'T00:00');
      return '<button type="button" role="tab" data-day="' + day + '"' + (day === state.day ? ' class="is-active"' : '') + '>Day ' + (i + 1) +
        '<small>' + DAY_NAMES[d(ms).getUTCDay()].slice(0, 3) + ' ' + d(ms).getUTCDate() + ' Oct</small></button>';
    }).join('');
  }

  function sessionButton(s) {
    var ppl = peopleOn(s.id);
    var av = ppl.slice(0, 4).map(avatar).join('') + (ppl.length > 4 ? '<span class="avatars__more">+' + (ppl.length - 4) + '</span>' : '');
    return '<button type="button" class="session' + (s.track ? ' session--t' + (s.track.order % 3 + 1) : '') + '" data-session="' + esc(s.id) + '">' +
      '<span class="session__title">' + esc(s.title) + '</span>' +
      '<span class="session__foot"><span class="session__meta">' + chipFor(s) +
        (s.room ? '<span class="session__room">Location: ' + esc(s.room.label) + '</span>' : '') + '</span>' +
        (ppl.length ? '<span class="avatars">' + av + '</span>' : '') + '</span>' +
      '</button>';
  }

  function renderAgenda() {
    var list = $('#agenda-list');
    list.innerHTML = state.days.map(function (day) {
      return '<div class="day-panel' + (day === state.day ? ' is-active' : '') + '" data-day-panel="' + day + '">' +
        state.slots.filter(function (sl) { return sl.day === day; }).map(function (sl) {
          var time = '<div class="slot__time">' + fmtTime(sl.start) + (sl.openEnded ? '' : '<small>to ' + fmtTime(sl.end) + '</small>') + '</div>';
          var body;
          if (sl.kind === 'break') {
            body = '<div class="break-row">' + ICON.cup + '<span>' + esc(sl.sessions[0].title) + '</span></div>';
          } else if (sl.kind === 'breakout') {
            body = '<div><div class="breakout__head">' + esc(sl.title.replace(/\s*[-–]\s*choose your track/i, '')) + ' <em>· choose one of ' + sl.sessions.length + '</em></div>' +
              '<div class="breakout__tracks">' + sl.sessions.map(sessionButton).join('') + '</div></div>';
          } else {
            body = sessionButton(sl.sessions[0]);
          }
          return '<div class="slot slot--' + sl.kind + '" data-slot="' + sl.index + '">' + time + body + '</div>';
        }).join('') + '</div>';
    }).join('');
    markAgendaNow();
  }

  function markAgendaNow() {
    var t = now();
    $$('.now-rule').forEach(function (n) { n.remove(); });
    var ruleBefore = null;
    $$('#agenda-list .slot').forEach(function (el) {
      var sl = state.slots[+el.dataset.slot];
      var isNow = sl.start <= t && t < sl.end;
      el.classList.toggle('is-now', isNow);
      el.classList.toggle('is-past', t >= sl.end && sl.day === dayKey(t));
      if (!ruleBefore && sl.day === dayKey(t) && sl.start > t && t >= state.slots[0].start) ruleBefore = el;
    });
    var nowEl = $('#agenda-list .slot.is-now');
    if (!nowEl && ruleBefore) {
      var rule = document.createElement('div');
      rule.className = 'now-rule';
      rule.innerHTML = '<span>NOW ' + fmtClock(t) + '</span>';
      ruleBefore.parentNode.insertBefore(rule, ruleBefore);
    }
  }

  function setDay(day) {
    state.day = day;
    $$('#day-toggle button').forEach(function (b) { b.classList.toggle('is-active', b.dataset.day === day); });
    $$('.day-panel').forEach(function (p) { p.classList.toggle('is-active', p.dataset.dayPanel === day); });
    $('#agenda-scroller').scrollTop = 0;
  }

  function defaultDay() {
    var today = dayKey(now());
    if (state.days.indexOf(today) !== -1) return today;
    return now() > wallFromIso(state.days[state.days.length - 1] + 'T23:59') ? state.days[state.days.length - 1] : state.days[0];
  }

  function scrollAgendaToNow(smooth) {
    var sc = $('#agenda-scroller');
    var target = $('.day-panel.is-active .slot.is-now') || $('.day-panel.is-active .now-rule');
    sc.scrollTo({ top: target ? Math.max(0, target.offsetTop - 30) : 0, behavior: smooth ? 'smooth' : 'auto' });
  }

  function scrollToSlot(idx) {
    var sl = state.slots[idx];
    go('agenda');
    setDay(sl.day);
    var el = $('.slot[data-slot="' + idx + '"]');
    if (el) $('#agenda-scroller').scrollTop = Math.max(0, el.offsetTop - 30);
  }

  /* ================= sheet (session + speaker detail) ================= */

  function openSheet(render) {
    state.sheetStack.push(render);
    paintSheet();
    $('#sheet').classList.add('is-open');
    $('#sheet').setAttribute('aria-hidden', 'false');
  }
  function paintSheet() {
    var render = state.sheetStack[state.sheetStack.length - 1];
    $('#sheet-body').innerHTML = render();
    $('#sheet-body').scrollTop = 0;
    $('#sheet-back').hidden = state.sheetStack.length < 2;
  }
  function closeSheet() {
    state.sheetStack = [];
    $('#sheet').classList.remove('is-open');
    $('#sheet').setAttribute('aria-hidden', 'true');
  }
  function sheetBack() {
    if (state.sheetStack.length > 1) { state.sheetStack.pop(); paintSheet(); }
    else closeSheet();
  }

  function sessionDetail(id) {
    var s = state.sessionById[id];
    if (!s) return '';
    var t = now();
    var sl = state.slotBySessionId[id];
    var live = s.start <= t && t < s.end;
    var h = '<div class="detail__meta">' + chipFor(s) + (live ? '<span class="live">Live now</span>' : '') +
      '<span class="detail__time">' + fmtDayLong(s.start) + ' · ' + fmtTime(s.start) + (sl.openEnded ? '' : ' – ' + fmtTime(s.end)) + '</span></div>' +
      '<h2 class="detail__title" id="sheet-title">' + esc(s.title) + '</h2>' +
      (s.subtitle ? '<p class="detail__sub">' + esc(s.subtitle) + '</p>' : '') +
      (s.synopsis ? '<p class="detail__desc">' + esc(s.synopsis) + '</p>' : '');
    if (s.room && s.room.id) {
      h += '<button type="button" class="map-link" data-zone="' + esc(s.room.id) + '">' + ICON.pin + 'Find ' + esc(s.room.label) + ' on the map</button>';
    } else if (s.room) {
      h += '<p class="detail__sub">' + esc(s.room.label) + '</p>';
    }
    var c = state.credits[id];
    if (c) {
      ROLE_ORDER.forEach(function (role) {
        if (!c[role].length) return;
        h += '<div class="credits__label">' + (role === 'speaker' && c[role].length === 1 ? 'Speaker' : ROLE_LABEL[role]) + '</div>';
        h += c[role].map(function (p) {
          return '<button type="button" class="person" data-person="' + esc(p.id) + '">' + avatar(p) +
            '<span><span class="person__name">' + esc(p.name) + '</span><span class="person__role">' + esc([p.jobTitle, p.company].filter(Boolean).join(', ')) + '</span></span>' +
            ICON.chev + '</button>';
        }).join('');
      });
    }
    return h;
  }

  function findPerson(pid) {
    var ids = state.sessionsByPerson[pid] || [];
    for (var i = 0; i < ids.length; i++) {
      var ppl = peopleOn(ids[i]);
      for (var j = 0; j < ppl.length; j++) if (ppl[j].id === pid) return ppl[j];
    }
    return null;
  }

  function personDetail(pid) {
    var p = findPerson(pid);
    if (!p) return '';
    var ids = (state.sessionsByPerson[pid] || []).filter(function (v, i, a) { return a.indexOf(v) === i && state.sessionById[v]; })
      .sort(function (a, b) { return state.sessionById[a].start - state.sessionById[b].start; });
    return '<div class="bio">' + avatar(p) + '<div><h3 id="sheet-title">' + esc(p.name) + '</h3><p class="bio__role">' + esc([p.jobTitle, p.company].filter(Boolean).join(', ')) + '</p></div></div>' +
      (p.bioHtml ? '<div class="bio__text">' + cleanHtml(p.bioHtml) + '</div>' : '') +
      '<div class="bio__sessions"><div class="credits__label">Appearing in</div>' +
      ids.map(function (id) {
        var s = state.sessionById[id];
        return '<button type="button" class="next-row" data-session="' + esc(id) + '"><span class="next-row__time"><small style="display:block;font-size:20px;font-weight:400;color:var(--ink-3)">' + fmtDayShort(s.start) + '</small>' + fmtTime(s.start) + '</span>' +
          '<span class="next-row__title">' + esc(s.title) + '</span>' + ICON.chev + '</button>';
      }).join('') + '</div>';
  }

  /* ================= map ================= */

  function kioskSpot() {
    var key = params.get('kiosk') || C.venue.defaultKiosk;
    return C.venue.kiosks[key] || C.venue.kiosks[C.venue.defaultKiosk];
  }

  function renderFloorToggle() {
    $('#floor-toggle').innerHTML = C.venue.floors.map(function (f) {
      return '<button type="button" role="tab" data-floor="' + esc(f.id) + '"' + (f.id === state.floor ? ' class="is-active"' : '') + '>' + esc(f.label) + '</button>';
    }).join('');
  }

  function wrapLabel(label, w) {
    var maxChars = Math.max(6, Math.floor((w - 30) / 17));
    if (label.length <= maxChars) return [label];
    var words = label.split(' '), lines = [''];
    words.forEach(function (wd) {
      var cur = lines[lines.length - 1];
      if ((cur + ' ' + wd).trim().length > maxChars && cur) lines.push(wd); else lines[lines.length - 1] = (cur + ' ' + wd).trim();
    });
    return lines;
  }

  function zoneIsLive(zoneId, t) {
    return slotsNow(t).some(function (sl) { return sl.sessions.some(function (s) { return s.room && s.room.id === zoneId; }); });
  }

  function renderMap() {
    var floor = C.venue.floors.filter(function (f) { return f.id === state.floor; })[0];
    var t = now();
    var svg = $('#map-svg');
    svg.setAttribute('viewBox', '0 0 ' + floor.w + ' ' + floor.h);
    // The venue's own floor-plan artwork, with invisible tap targets over each room.
    var h = '<image href="' + esc(asset(floor.image)) + '" x="0" y="0" width="' + floor.w + '" height="' + floor.h + '"/>';
    floor.zones.forEach(function (z) {
      var live = zoneIsLive(z.id, t);
      h += '<g class="zone' + (state.zone === z.id ? ' is-selected' : '') + (live ? ' is-live' : '') + '" data-zone="' + esc(z.id) + '" role="button" tabindex="0" aria-label="' + esc(z.label) + '">' +
        '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="6"/>' +
        (live ? '<circle class="live-ring" cx="' + (z.x + z.w - 16) + '" cy="' + (z.y + 16) + '" r="9"/><circle class="live-dot" cx="' + (z.x + z.w - 16) + '" cy="' + (z.y + 16) + '" r="8"/>' : '') +
        '</g>';
    });
    var spot = kioskSpot();
    if (spot && spot.floor === floor.id) {
      // Label pill sits beside the dot unless config gives it a spot (labelX/labelY = its top-left).
      var lx = spot.labelX != null ? spot.labelX : (spot.x + 220 > floor.w ? spot.x - 220 : spot.x + 30);
      var ly = spot.labelY != null ? spot.labelY : spot.y - 21;
      h += '<g class="here"><circle class="ring" cx="' + spot.x + '" cy="' + spot.y + '" r="16"/><circle class="core" cx="' + spot.x + '" cy="' + spot.y + '" r="15"/>' +
        '<rect x="' + lx + '" y="' + ly + '" width="190" height="42" rx="21"/>' +
        '<text x="' + (lx + 95) + '" y="' + (ly + 29) + '" text-anchor="middle">' + esc(spot.label || 'You are here') + '</text></g>';
    }
    svg.innerHTML = h;
    renderZoneCard();
  }

  function renderZoneCard() {
    var card = $('#zone-card');
    var info = state.zone && zoneIndex[state.zone];
    if (!info) { card.innerHTML = '<p class="zone-card__hint"><span class="pulse"></span>Tap a room to see what\'s on there</p>'; return; }
    var z = info.zone, t = now();
    var here = state.slots.filter(function (sl) { return sl.end > t; })
      .reduce(function (acc, sl) { return acc.concat(sl.sessions.filter(function (s) { return s.room && s.room.id === z.id; })); }, [])
      .slice(0, 3);
    card.innerHTML = '<h3>' + esc(z.label) + '</h3>' +
      '<p class="zone-card__note">' + esc([info.floor.name || info.floor.label, z.note].filter(Boolean).join(' · ')) + '</p>' +
      (here.length ? here.map(function (s) {
        var live = s.start <= t;
        return '<button type="button" class="next-row" data-session="' + esc(s.id) + '"><span class="next-row__time">' +
          (live ? '<span class="live">Now</span>' : (dayKey(s.start) !== dayKey(t) ? fmtDayShort(s.start) + ' ' : '') + fmtTime(s.start)) + '</span>' +
          '<span class="next-row__title">' + esc(s.title) + '</span>' + ICON.chev + '</button>';
      }).join('') : '');
  }

  function showZone(zoneId) {
    var info = zoneIndex[zoneId];
    if (!info) return;
    closeSheet();
    state.floor = info.floor.id;
    state.zone = zoneId;
    renderFloorToggle();
    renderMap();
    go('map');
  }

  /* ================= feedback / QR ================= */

  function renderQr() {
    var url = C.feedbackUrl;
    var qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    var svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $$('[data-qr]').forEach(function (n) { n.innerHTML = svg; });
  }

  /* ================= attract loop ================= */

  var attractTimer = null, attractIdx = 0;
  function attractCards() {
    var t = now(), cards = [];
    var cur = slotsNow(t).filter(function (sl) { return sl.kind !== 'break'; });
    cur.forEach(function (sl) {
      sl.sessions.forEach(function (s) {
        cards.push({ label: 'On now' + (s.room ? ' · ' + s.room.label : ''), title: s.title, meta: fmtTime(s.start) + ' – ' + fmtTime(s.end) });
      });
    });
    slotsAfter(t).filter(function (sl) { return sl.kind !== 'break'; }).slice(0, 3).forEach(function (sl) {
      var s = sl.sessions[0];
      var title = sl.kind === 'breakout' ? sl.title.replace(/\s*[-–]\s*choose your track/i, '') + ' — ' + sl.sessions.length + ' tracks' : s.title;
      cards.push({ label: 'Coming up' + (sl.day !== dayKey(t) ? ' · ' + fmtDayLong(sl.start) : ''), title: title, meta: fmtTime(sl.start) + (s.room && sl.kind !== 'breakout' ? ' · ' + s.room.label : '') });
    });
    cards.push({ label: 'Find your way', title: 'Main stage, breakout rooms, catering and cloakroom — all on the venue map.', meta: 'Tap the screen to open the map' });
    cards.push({ label: 'Your feedback', title: 'Tell us how the Summit is going — tap the screen, then Feedback.', meta: 'About two minutes on your phone' });
    return cards;
  }
  function paintAttractCard() {
    var cards = attractCards();
    var c = cards[attractIdx % cards.length];
    attractIdx++;
    var el = $('#attract-card');
    el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade');
    el.innerHTML = '<div class="label">' + esc(c.label) + '</div><div class="title">' + esc(c.title) + '</div><div class="meta">' + esc(c.meta) + '</div>';
  }
  function showAttract() {
    closeSheet();
    go('home');
    state.day = defaultDay(); setDay(state.day);
    state.zone = null; state.floor = kioskSpot().floor; renderFloorToggle(); renderMap();
    attractIdx = 0; paintAttractCard();
    clearInterval(attractTimer); attractTimer = setInterval(paintAttractCard, 7000);
    $('#attract').classList.add('is-on');
  }
  function hideAttract() {
    clearInterval(attractTimer);
    $('#attract').classList.remove('is-on');
    renderHome();
    bumpIdle();
  }

  var idleTimer = null;
  function bumpIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showAttract, C.idleSeconds * 1000);
  }

  /* ================= wiring ================= */

  function wire() {
    document.addEventListener('pointerdown', bumpIdle, true);
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    $('#attract').addEventListener('click', hideAttract);

    document.addEventListener('click', function (e) {
      var el;
      if ((el = e.target.closest('[data-attract]'))) { showAttract(); return; }
      if ((el = e.target.closest('[data-go]'))) { closeSheet(); go(el.dataset.go); return; }
      if ((el = e.target.closest('[data-close]'))) { closeSheet(); return; }
      if ((el = e.target.closest('#sheet-back'))) { sheetBack(); return; }
      if ((el = e.target.closest('[data-person]'))) { var pid = el.dataset.person; openSheet(function () { return personDetail(pid); }); return; }
      if ((el = e.target.closest('[data-session]'))) { var sid = el.dataset.session; openSheet(function () { return sessionDetail(sid); }); return; }
      if ((el = e.target.closest('.next-row[data-slot]'))) { scrollToSlot(+el.dataset.slot); return; }
      if ((el = e.target.closest('#day-toggle [data-day]'))) { setDay(el.dataset.day); return; }
      if ((el = e.target.closest('#floor-toggle [data-floor]'))) { state.floor = el.dataset.floor; state.zone = null; renderFloorToggle(); renderMap(); return; }
      if ((el = e.target.closest('[data-zone]'))) {
        if (el.closest('#map-svg')) { state.zone = state.zone === el.dataset.zone ? null : el.dataset.zone; renderMap(); }
        else showZone(el.dataset.zone);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#map-svg [data-zone]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });

    window.addEventListener('resize', fitStage);
  }

  function fitStage() {
    var s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    $('#stage').style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  function renderAll() {
    renderHome();
    renderDayToggle();
    renderAgenda();
    renderFloorToggle();
    renderMap();
  }

  function refreshData() {
    return Promise.all([
      load('agenda'),
      load('speakers'),
      load('relationships').catch(function () { return []; })
    ]).then(function (r) {
      var sig = JSON.stringify(r).length + ':' + JSON.stringify(r[0]).slice(0, 5000);
      if (sig === lastSig) return false;       // nothing changed: leave the screen alone
      lastSig = sig;
      buildModel(r[0], r[1], r[2]);
      renderAll();
      return true;
    });
  }
  var lastSig = null;

  var bootedAt = Date.now();
  function boot() {
    fitStage();
    if (params.get('cursor') === 'hide') document.body.classList.add('hide-cursor');
    tick();
    renderQr();
    wire();
    state.floor = kioskSpot().floor;

    refreshData().then(function () {
      state.day = defaultDay();
      setDay(state.day);
      if (params.get('view')) go(params.get('view'));
      if (params.get('attract') === '1') showAttract(); else bumpIdle();
    }).catch(function (err) {
      $('#now-list').innerHTML = '<p class="empty-note">The agenda couldn\'t be loaded (' + esc(err.message) + '). Check the kiosk\'s network connection or the data/ folder.</p>';
    });

    setInterval(tick, 1000);
    // Keep "now" states fresh without disturbing whatever the visitor is looking at.
    setInterval(function () {
      if (!state.slots.length) return;
      renderHome(); markAgendaNow();
      if (state.view === 'map') renderMap();
    }, 30000);
    setInterval(function () {
      refreshData().then(function (changed) {
        if (!changed) return;
        setDay(state.day);
        $$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === state.view); });
      }).catch(function () { /* keep showing the last good data */ });
    }, C.dataRefreshMinutes * 60000);
    setInterval(function () {
      var h = d(realWallNow()).getUTCHours();
      if (h === C.nightlyReloadHour && Date.now() - bootedAt > 3600000) location.reload();
    }, 60000);

    // Ask the screen not to sleep (ignored where unsupported).
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
