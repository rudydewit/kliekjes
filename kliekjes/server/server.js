'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/data';
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY = 64 * 1024 * 1024;
const VERSION = '1.0.10';

// Home Assistant stuurt ingress-verkeer altijd vanaf dit interne adres.
const INGRESS_IP = process.env.TRUSTED_INGRESS_IP || '172.30.32.2';

/* Als app onder Home Assistant staat de configuratie in /data/options.json;
   los draaiend komt hij uit de omgevingsvariabele. */
function addonOptions() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'options.json'), 'utf8'));
  } catch {
    return {};
  }
}

const OPTIONS = addonOptions();
const PASSWORD = process.env.APP_PASSWORD || OPTIONS.password || '';

fs.mkdirSync(PHOTO_DIR, { recursive: true });

if (!PASSWORD) {
  console.warn('Geen wachtwoord ingesteld. Alleen bereikbaar via de Home Assistant-zijbalk.');
}

/* ---------------------------------------------------------------- database */

const db = new DatabaseSync(path.join(DATA_DIR, 'kliekjes.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    portions     INTEGER NOT NULL DEFAULT 1,
    location     TEXT DEFAULT '',
    frozen_on    TEXT NOT NULL,
    best_before  TEXT,
    notes        TEXT DEFAULT '',
    photo        TEXT,
    created_by   TEXT DEFAULT '',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    archived_at  TEXT
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    TEXT NOT NULL,
    item_name  TEXT NOT NULL,
    action     TEXT NOT NULL,
    amount     INTEGER,
    who        TEXT DEFAULT '',
    at         TEXT NOT NULL
  )
`);

const q = {
  insertItem: db.prepare(`INSERT INTO items
    (id,name,portions,location,frozen_on,best_before,notes,photo,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
  listActive: db.prepare(`SELECT * FROM items WHERE archived_at IS NULL
    ORDER BY COALESCE(best_before,'9999-12-31') ASC, frozen_on ASC`),
  listArchived: db.prepare(`SELECT * FROM items WHERE archived_at IS NOT NULL
    ORDER BY archived_at DESC LIMIT 100`),
  getItem: db.prepare('SELECT * FROM items WHERE id = ?'),
  updateItem: db.prepare(`UPDATE items SET
    name=?, portions=?, location=?, frozen_on=?, best_before=?, notes=?, photo=?, updated_at=?
    WHERE id = ?`),
  setPortions: db.prepare('UPDATE items SET portions=?, updated_at=? WHERE id=?'),
  archive: db.prepare('UPDATE items SET archived_at=?, updated_at=? WHERE id=?'),
  unarchive: db.prepare('UPDATE items SET archived_at=NULL, portions=?, updated_at=? WHERE id=?'),
  deleteItem: db.prepare('DELETE FROM items WHERE id=?'),
  addEvent: db.prepare('INSERT INTO events (item_id,item_name,action,amount,who,at) VALUES (?,?,?,?,?,?)'),
  importItem: db.prepare(`INSERT INTO items
    (id,name,portions,location,frozen_on,best_before,notes,photo,created_by,created_at,updated_at,archived_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`),
  allItems: db.prepare('SELECT * FROM items'),
  allEvents: db.prepare('SELECT * FROM events ORDER BY id ASC'),
  listEvents: db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100'),
};

/* -------------------------------------------------------------------- auth */

const COOKIE = 'kliekjes';
const token = PASSWORD
  ? crypto.createHmac('sha256', PASSWORD).update('kliekjes-v1').digest('hex')
  : null;

/* Home Assistant heeft de gebruiker al ingelogd voordat ingress ons bereikt.
   We eisen zowel de ingress-header als het interne Supervisor-adres, zodat
   een los opengezette poort dit niet kan nabootsen. */
function fromIngress(req) {
  if (!req.headers['x-ingress-path']) return false;
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === INGRESS_IP;
}

function isAuthed(req) {
  if (fromIngress(req)) return true;
  if (!token) return false;
  const raw = req.headers.cookie || '';
  const hit = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!hit) return false;
  const given = Buffer.from(hit.slice(COOKIE.length + 1));
  const want = Buffer.from(token);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/* ----------------------------------------------------------------- helpers */

const now = () => new Date().toISOString();

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': Buffer.isBuffer(body) || typeof body === 'string'
      ? (headers['Content-Type'] || 'text/plain; charset=utf-8')
      : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Foto te groot. Probeer het opnieuw.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Ongeldige aanvraag.'));
      }
    });
    req.on('error', reject);
  });
}

function savePhoto(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(PHOTO_DIR, name), Buffer.from(m[2], 'base64'));
  return name;
}

function dropPhoto(name) {
  if (!name) return;
  fs.rm(path.join(PHOTO_DIR, path.basename(name)), { force: true }, () => {});
}

const str = (v, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);
const today = () => new Date().toISOString().slice(0, 10);
const asDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : null);
const asCount = (v, fallback = 1) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 999 ? n : fallback;
};

/* ------------------------------------------------------------ static files */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function serveStatic(res, urlPath, req) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Niet gevonden');
  }
  const ext = path.extname(file);

  /* Onder ingress hangt de app onder /api/hassio_ingress/<token>/. Alle verwijzingen
     in de pagina zijn relatief; met een <base> komen ze op de juiste plek uit. */
  if (ext === '.html') {
    let html = fs.readFileSync(file, 'utf8');
    const prefix = req && req.headers['x-ingress-path'];
    if (prefix) {
      html = html.replace('<head>', `<head>\n<base href="${prefix.replace(/\/?$/, '/')}">`);
    }
    /* Het versienummer in de URL zorgt dat een browser nooit een oude app.js
       met een nieuwe index.html kan combineren. */
    html = html
      .replace('href="styles.css"', `href="styles.css?v=${VERSION}"`)
      .replace('src="app.js"', `src="app.js?v=${VERSION}"`);
    return send(res, 200, html, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
  }

  /* Stylesheets en scripts veranderen bij elke update; die laten we het
     kleine beetje netwerkverkeer kosten in plaats van een uur vastzitten.
     Afbeeldingen en iconen wijzigen vrijwel nooit en blijven wel staan. */
  const volatile = ext === '.css' || ext === '.js' || ext === '.webmanifest';

  send(res, 200, fs.readFileSync(file), {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': volatile ? 'no-store' : 'max-age=3600',
  });
}

/* ------------------------------------------------------------------ routes */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    /* --- login is the only open endpoint ------------------------------- */
    if (p === '/api/login' && req.method === 'POST') {
      if (!PASSWORD) return send(res, 400, { error: 'Er is geen wachtwoord ingesteld.' });
      const body = await readBody(req);
      const given = Buffer.from(String(body.password || ''));
      const want = Buffer.from(PASSWORD);
      const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
      if (!ok) return send(res, 401, { error: 'Wachtwoord klopt niet.' });
      return send(res, 200, { ok: true }, {
        'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
      });
    }

    if (p === '/api/logout' && req.method === 'POST') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` });
    }

    if (p === '/api/session') {
      return send(res, 200, {
        authed: isAuthed(req),
        // Home Assistant geeft de naam alleen door bij een gewoon HA-account.
        who: fromIngress(req) ? String(req.headers['x-remote-user-name'] || '') : '',
        version: VERSION,
      });
    }

    /* --- app shell stays open so the PWA can boot ---------------------- */
    if (!p.startsWith('/api/') && !p.startsWith('/photos/')) return serveStatic(res, p, req);

    if (!isAuthed(req)) return send(res, 401, { error: 'Niet ingelogd.' });

    /* --- photos -------------------------------------------------------- */
    if (p.startsWith('/photos/')) {
      const file = path.join(PHOTO_DIR, path.basename(p));
      if (!fs.existsSync(file)) return send(res, 404, 'Niet gevonden');
      return send(res, 200, fs.readFileSync(file), {
        'Content-Type': MIME[path.extname(file)] || 'image/jpeg',
        'Cache-Control': 'private, max-age=604800',
      });
    }

    /* --- items --------------------------------------------------------- */
    if (p === '/api/items' && req.method === 'GET') {
      return send(res, 200, { items: q.listActive.all(), archived: q.listArchived.all() });
    }

    if (p === '/api/items' && req.method === 'POST') {
      const b = await readBody(req);
      const name = str(b.name);
      if (!name) return send(res, 400, { error: 'Geef het gerecht een naam.' });
      const id = crypto.randomUUID();
      const ts = now();
      const photo = savePhoto(b.photo);
      q.insertItem.run(
        id, name, asCount(b.portions), str(b.location), asDate(b.frozen_on) || today(),
        asDate(b.best_before), str(b.notes), photo, str(b.who), ts, ts,
      );
      q.addEvent.run(id, name, 'toegevoegd', asCount(b.portions), str(b.who), ts);
      return send(res, 201, { item: q.getItem.get(id) });
    }

    const itemMatch = /^\/api\/items\/([0-9a-f-]{36})(\/[a-z]+)?$/.exec(p);
    if (itemMatch) {
      const id = itemMatch[1];
      const action = itemMatch[2];
      const item = q.getItem.get(id);
      if (!item) return send(res, 404, { error: 'Dit kliekje bestaat niet meer.' });

      if (action === '/take' && req.method === 'POST') {
        const b = await readBody(req);
        const amount = Math.max(1, asCount(b.amount, 1));
        const left = Math.max(0, item.portions - amount);
        const ts = now();
        q.addEvent.run(id, item.name, 'opgegeten', Math.min(amount, item.portions), str(b.who), ts);
        if (left === 0) q.archive.run(ts, ts, id);
        q.setPortions.run(left, ts, id);
        return send(res, 200, { item: q.getItem.get(id) });
      }

      if (action === '/restore' && req.method === 'POST') {
        const b = await readBody(req);
        const ts = now();
        q.unarchive.run(Math.max(1, asCount(b.portions, 1)), ts, id);
        q.addEvent.run(id, item.name, 'teruggezet', null, str(b.who), ts);
        return send(res, 200, { item: q.getItem.get(id) });
      }

      if (!action && req.method === 'PATCH') {
        const b = await readBody(req);
        let photo = item.photo;
        if (b.photo === null) { dropPhoto(photo); photo = null; }
        else if (typeof b.photo === 'string' && b.photo.startsWith('data:')) {
          const fresh = savePhoto(b.photo);
          if (fresh) { dropPhoto(photo); photo = fresh; }
        }
        const ts = now();
        q.updateItem.run(
          str(b.name, item.name) || item.name,
          asCount(b.portions, item.portions),
          b.location === undefined ? item.location : str(b.location),
          asDate(b.frozen_on) || item.frozen_on,
          b.best_before === null ? null : (asDate(b.best_before) || item.best_before),
          b.notes === undefined ? item.notes : str(b.notes),
          photo, ts, id,
        );
        return send(res, 200, { item: q.getItem.get(id) });
      }

      if (!action && req.method === 'DELETE') {
        dropPhoto(item.photo);
        q.deleteItem.run(id);
        q.addEvent.run(id, item.name, 'verwijderd', null, str(url.searchParams.get('who')), now());
        return send(res, 200, { ok: true });
      }
    }

    /* --- alles eruit / alles erin -------------------------------------- */
    if (p === '/api/export' && req.method === 'GET') {
      const items = q.allItems.all();
      const photos = {};
      for (const it of items) {
        if (!it.photo) continue;
        try {
          photos[it.photo] = fs.readFileSync(path.join(PHOTO_DIR, it.photo)).toString('base64');
        } catch { /* foto weg: de rest gaat gewoon mee */ }
      }
      return send(res, 200, {
        kliekjes: VERSION, exported_at: now(), items, events: q.allEvents.all(), photos,
      }, { 'Content-Disposition': `attachment; filename="kliekjes-${today()}.json"` });
    }

    if (p === '/api/import' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b || !Array.isArray(b.items)) {
        return send(res, 400, { error: 'Dit bestand bevat geen kliekjes.' });
      }
      let added = 0;
      let skipped = 0;
      for (const it of b.items) {
        if (!it.id || q.getItem.get(it.id)) { skipped += 1; continue; }
        let photo = null;
        const raw = it.photo && b.photos ? b.photos[it.photo] : null;
        if (raw) {
          photo = `${crypto.randomUUID()}${path.extname(it.photo) || '.jpg'}`;
          try {
            fs.writeFileSync(path.join(PHOTO_DIR, photo), Buffer.from(raw, 'base64'));
          } catch { photo = null; }
        }
        q.importItem.run(
          String(it.id), str(it.name) || 'Naamloos', asCount(it.portions),
          str(it.location), asDate(it.frozen_on) || today(), asDate(it.best_before),
          str(it.notes), photo, str(it.created_by),
          str(it.created_at) || now(), str(it.updated_at) || now(),
          str(it.archived_at) || null,
        );
        added += 1;
      }
      if (Array.isArray(b.events)) {
        for (const ev of b.events) {
          if (!ev || !ev.item_id) continue;
          q.addEvent.run(String(ev.item_id), str(ev.item_name), str(ev.action) || 'onbekend',
            ev.amount === null || ev.amount === undefined ? null : asCount(ev.amount, 0),
            str(ev.who), str(ev.at) || now());
        }
      }
      return send(res, 200, { added, skipped });
    }

    if (p === '/api/events' && req.method === 'GET') {
      return send(res, 200, { events: q.listEvents.all() });
    }

    return send(res, 404, { error: 'Onbekende aanvraag.' });
  } catch (err) {
    console.error(err);
    return send(res, 400, { error: err.message || 'Er ging iets mis.' });
  }
});

server.listen(PORT, () => console.log(`Kliekjes ${VERSION} draait op poort ${PORT}`));
