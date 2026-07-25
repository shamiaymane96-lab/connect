# Connect

A barebones private chat between your PC and your phone. Three static files, no build step,
no server to keep running. Installs as a PWA on both devices.

```
index.html               the whole app (UI + logic)
manifest.webmanifest     PWA metadata
sw.js                    service worker (caches the shell for instant/offline open)
icon-*.png               app icons
```

## How it works

Messages go into a single `messages` table in Supabase. Each device subscribes to
Supabase Realtime filtered on the **room code**, so an insert on one device shows up on the
other in well under a second. Everything else is plain DOM.

Attachments go to a Supabase Storage bucket (`attachments`) under `<room>/<uuid>.<ext>`, and
the message row carries the path plus name, MIME type and size.

The backend is already set up on project `sqqqrdqwrqlhfckcaxzz`:

```sql
create table public.messages (
  id bigint generated always as identity primary key,
  room text not null check (length(room) between 6 and 64),
  sender text not null check (length(sender) between 1 and 32),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
```

## Using it

1. Open the site on your PC. Pick a name, hit **Generate new** for a room code, **Start**.
2. Tap **⋯ → Copy link** and open that link on your phone. It joins the same room automatically.
3. On the phone, use the browser menu → **Add to Home Screen** / **Install app**.

Enter sends, Shift+Enter makes a new line. **⋯** shows the share link, lets you change room,
or wipe the room's history.

### Photos and files

Three ways to send, up to 50 MB each, 10 at a time:

- **＋** in the composer — on a phone this offers the camera and photo library
- **Paste** an image straight from the clipboard (the fast way to send a screenshot)
- **Drag and drop** files anywhere on the window

Images, video and audio play inline. Anything else shows as a download chip with its size.
Wiping a room deletes its uploaded files too, so nothing is left stranded in storage.

## Security model — read this

There is no login. **The room code is the only secret.** Anyone who has it can read and post
in that room, and the anon key in `index.html` is public by design (that's what it's for).

Practically that means:

- Use a generated code, not `family` or `aymane123`. The generator gives ~45 bits of entropy.
- Don't put passwords, card numbers, or anything you'd mind leaking in here.
- The storage bucket is **public**: an attachment URL works for anyone who has it, forever,
  even after the message is deleted. The paths are random UUIDs so they can't be guessed, but
  treat a file you send here as something you've published to an unlisted URL.
- Supabase's linter flags the `insert`/`delete` policies as permissive. That is deliberate for
  a no-auth app, and it is the accepted tradeoff for this design.

If you later want this properly locked down, the upgrade is Supabase Auth with a policy of
`auth.uid() = user_id` — happy to do that, it's maybe 30 lines of change.

## Keeping the backend awake

Supabase pauses free-plan projects after roughly 7 days without user database
activity. A paused project takes Connect offline — messages stop loading and sending —
until it is resumed by hand from the dashboard. No data is lost; it is restorable for up
to a year.

[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) runs a real query
against the database every other day to prevent that. It needs no secret, since the key it
uses is the same public one already in `index.html`. You can also run it on demand from the
repository's **Actions** tab, and it fails loudly if the project is already asleep.

One caveat: GitHub disables scheduled workflows on a repository with no commits for 60
days. It emails you first, and re-enabling is one click in the Actions tab.

## Where the data lives

| What | Where |
| --- | --- |
| Messages | Postgres table `public.messages` |
| Attachments | Storage bucket `attachments`, at `<room>/<uuid>.<ext>` |
| Name and room code | `localStorage` on each device |
| The app shell | Cached by the service worker on each device |

Nothing expires on its own. Data stays until you use **Delete all messages**.

Free-plan headroom: 500 MB database, 1 GB file storage, 50 MB per file, and **5 GB of
downloads per month**. The last one is the real constraint once images are involved, since
every view of an image counts again — storage fills up far more slowly than egress does.

## Local development

```bash
npx -y serve -l 5173 .
```

Then open http://127.0.0.1:5173. Note that service workers and PWA install only work on
`localhost` or over HTTPS — a plain `http://192.168.x.x` LAN address will **not** let you
install it on the phone. That's why this is deployed to a static host.

## Deploying

Any static host works, since there is no backend to run. Push the folder to a GitHub repo and
turn on Pages, or drag the folder onto Netlify/Cloudflare Pages. Nothing needs configuring —
the Supabase URL and key are already in `index.html`.
